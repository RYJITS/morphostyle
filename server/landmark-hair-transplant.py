import argparse
import os
import sys
from pathlib import Path

import cv2
import numpy as np
import torch
import torchvision.transforms as transforms
from PIL import Image, ImageOps
from scipy import ndimage
from skimage.transform import PiecewiseAffineTransform, warp

from insightface.app import FaceAnalysis


DEFAULT_INSIGHTFACE_ROOT = (
    "D:/00_Cerveau_IA/Conpetances/Video/ComfyUI/ComfyUI_windows_portable/"
    "ComfyUI/models/insightface"
)

LABELS = {
    "skin": 1,
    "left_brow": 2,
    "right_brow": 3,
    "left_eye": 4,
    "right_eye": 5,
    "glasses": 6,
    "left_ear": 7,
    "right_ear": 8,
    "nose": 10,
    "mouth": 11,
    "upper_lip": 12,
    "lower_lip": 13,
    "neck": 14,
    "cloth": 16,
    "hair": 17,
    "hat": 18,
}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Transfer only the hairstyle from a generated image onto the original face."
    )
    parser.add_argument("--source", required=True)
    parser.add_argument("--hair-source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--debug-output", default="")
    parser.add_argument("--repo", default="output/external/HairFastGAN")
    parser.add_argument("--insightface-root", default=DEFAULT_INSIGHTFACE_ROOT)
    parser.add_argument("--insightface-model", default="antelopev2")
    parser.add_argument("--width", type=int, default=1024)
    parser.add_argument("--height", type=int, default=1024)
    parser.add_argument("--mask-dilate", type=int, default=20)
    parser.add_argument("--mask-blur", type=float, default=9.0)
    parser.add_argument("--face-protect-dilate", type=int, default=10)
    parser.add_argument("--forehead-protect", type=float, default=0.345)
    parser.add_argument("--alpha-strength", type=float, default=0.96)
    parser.add_argument("--remove-old-hair", action="store_true", default=True)
    parser.add_argument("--no-remove-old-hair", dest="remove_old_hair", action="store_false")
    parser.add_argument("--mode", choices=["alpha", "seamless", "mixed"], default="alpha")
    return parser.parse_args()


def load_rgb(path, width, height):
    image = ImageOps.fit(Image.open(path).convert("RGB"), (width, height), method=Image.LANCZOS, centering=(0.5, 0.5))
    return np.asarray(image, dtype=np.uint8)


def save_rgb(path, image):
    output = Path(path).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(image, 0, 255).astype(np.uint8)).save(output)


def load_face_app(root, model):
    app = FaceAnalysis(name=model, root=root, providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=0, det_size=(640, 640))
    return app


def best_face(app, image_rgb):
    image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
    faces = app.get(image_bgr)
    if not faces:
        raise RuntimeError("No face detected")
    return max(faces, key=lambda face: float((face.bbox[2] - face.bbox[0]) * (face.bbox[3] - face.bbox[1])))


def face_points(face):
    points = getattr(face, "landmark_2d_106", None)
    if points is None:
        points = getattr(face, "landmark_3d_68", None)
        if points is not None:
            points = points[:, :2]
    if points is None:
        points = getattr(face, "kps", None)
    if points is None:
        raise RuntimeError("Face has no landmarks")
    return np.asarray(points, dtype=np.float32)


def stable_points(points, width, height):
    anchors = np.array(
        [
            [0, 0],
            [width * 0.25, 0],
            [width * 0.5, 0],
            [width * 0.75, 0],
            [width - 1, 0],
            [0, height * 0.25],
            [width - 1, height * 0.25],
            [0, height * 0.5],
            [width - 1, height * 0.5],
            [0, height - 1],
            [width * 0.25, height - 1],
            [width * 0.5, height - 1],
            [width * 0.75, height - 1],
            [width - 1, height - 1],
        ],
        dtype=np.float32,
    )
    return np.vstack([points, anchors])


def warp_to_source(image, image_points, source_points):
    height, width = image.shape[:2]
    transform = PiecewiseAffineTransform()
    transform.estimate(stable_points(image_points, width, height), stable_points(source_points, width, height))
    warped = warp(
        image,
        inverse_map=transform.inverse,
        output_shape=(height, width),
        preserve_range=True,
        mode="edge",
    )
    return np.clip(warped, 0, 255).astype(np.uint8)


def load_parser(repo, device):
    repo_path = Path(repo).resolve()
    sys.path.insert(0, str(repo_path))
    os.chdir(repo_path)
    from models.CtrlHair.external_code.face_parsing.model import BiSeNet

    model = BiSeNet(n_classes=19)
    state = torch.load(repo_path / "pretrained_models/BiSeNet/face_parsing_79999_iter.pth", map_location=device)
    model.load_state_dict(state)
    model.to(device)
    model.eval()
    return model


def parse_image(model, image_rgb, device):
    transform = transforms.Compose(
        [
            transforms.ToTensor(),
            transforms.Normalize((0.485, 0.456, 0.406), (0.229, 0.224, 0.225)),
        ]
    )
    pil = Image.fromarray(image_rgb).resize((512, 512), Image.BILINEAR)
    tensor = transform(pil).unsqueeze(0).to(device)
    with torch.no_grad():
        output = model(tensor)[0]
    parsing = output.squeeze(0).detach().cpu().numpy().argmax(0).astype(np.uint8)
    return cv2.resize(parsing, (image_rgb.shape[1], image_rgb.shape[0]), interpolation=cv2.INTER_NEAREST)


def landmark_hull(points, width, height):
    mask = np.zeros((height, width), dtype=np.uint8)
    cv2.fillConvexPoly(mask, cv2.convexHull(points.astype(np.int32)), 255)
    return mask > 0


def soften(mask, blur):
    alpha = mask.astype(np.float32)
    if blur > 0:
        alpha = ndimage.gaussian_filter(alpha, sigma=blur)
    max_value = float(alpha.max())
    if max_value > 0:
        alpha /= max_value
    return np.clip(alpha, 0.0, 1.0)


def build_masks(source_parse, warped_parse, source_points, args):
    height, width = source_parse.shape
    y_grid = np.arange(height)[:, None]
    source_hair = np.isin(source_parse, [LABELS["hair"], LABELS["hat"]])
    warped_hair = np.isin(warped_parse, [LABELS["hair"], LABELS["hat"]])

    # Remove old high-volume hair even where the new short hair no longer covers it,
    # but do not let the donor image overwrite the actual facial features.
    upper_head = (y_grid < int(height * 0.335)) & ndimage.binary_dilation(landmark_hull(source_points, width, height), iterations=35)

    protected_labels = [
        LABELS["left_brow"],
        LABELS["right_brow"],
        LABELS["left_eye"],
        LABELS["right_eye"],
        LABELS["glasses"],
        LABELS["nose"],
        LABELS["mouth"],
        LABELS["upper_lip"],
        LABELS["lower_lip"],
        LABELS["left_ear"],
        LABELS["right_ear"],
        LABELS["neck"],
        LABELS["cloth"],
    ]
    protected = np.isin(source_parse, protected_labels)
    protected |= (source_parse == LABELS["skin"]) & (y_grid >= int(height * args.forehead_protect))
    protected = ndimage.binary_dilation(protected, iterations=args.face_protect_dilate)

    old_hair_region = ndimage.binary_dilation(source_hair | upper_head, iterations=args.mask_dilate)
    old_hair_region = ndimage.binary_closing(old_hair_region, iterations=5) & ~protected

    new_hair_region = ndimage.binary_dilation(warped_hair, iterations=max(6, args.mask_dilate // 2))
    new_hair_region = ndimage.binary_closing(new_hair_region, iterations=4) & ~protected

    remove_region = old_hair_region & ~ndimage.binary_dilation(new_hair_region, iterations=8)
    overlay_alpha = soften(new_hair_region, args.mask_blur)
    remove_mask = (remove_region.astype(np.uint8) * 255)
    remove_mask = cv2.GaussianBlur(remove_mask, (0, 0), sigmaX=max(2.0, args.mask_blur / 2.0))
    return overlay_alpha, remove_mask


def inpaint_old_hair(source, remove_mask):
    if remove_mask.max() == 0:
        return source
    hard_mask = (remove_mask > 24).astype(np.uint8) * 255
    return cv2.cvtColor(
        cv2.inpaint(cv2.cvtColor(source, cv2.COLOR_RGB2BGR), hard_mask, 5, cv2.INPAINT_TELEA),
        cv2.COLOR_BGR2RGB,
    )


def alpha_composite(base, overlay, alpha, strength):
    alpha = np.clip(alpha * strength, 0.0, 1.0)[..., None]
    return np.clip(overlay.astype(np.float32) * alpha + base.astype(np.float32) * (1.0 - alpha), 0, 255).astype(np.uint8)


def seamless_composite(base, overlay, alpha):
    mask = (alpha > 0.15).astype(np.uint8) * 255
    ys, xs = np.where(mask > 0)
    if xs.size == 0 or ys.size == 0:
        return base
    center = (int((xs.min() + xs.max()) / 2), int((ys.min() + ys.max()) / 2))
    result = cv2.seamlessClone(
        cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR),
        cv2.cvtColor(base, cv2.COLOR_RGB2BGR),
        mask,
        center,
        cv2.MIXED_CLONE,
    )
    return cv2.cvtColor(result, cv2.COLOR_BGR2RGB)


def save_debug(path, source, warped_hair_source, alpha, final):
    alpha_rgb = np.repeat((alpha * 255).astype(np.uint8)[..., None], 3, axis=2)
    row1 = np.concatenate([source, warped_hair_source], axis=1)
    row2 = np.concatenate([alpha_rgb, final], axis=1)
    save_rgb(path, np.concatenate([row1, row2], axis=0))


def main():
    args = parse_args()
    source_path = Path(args.source).resolve()
    hair_source_path = Path(args.hair_source).resolve()
    output_path = Path(args.output).resolve()
    debug_output_path = Path(args.debug_output).resolve() if args.debug_output else None

    source = load_rgb(source_path, args.width, args.height)
    hair_source = load_rgb(hair_source_path, args.width, args.height)

    face_app = load_face_app(args.insightface_root, args.insightface_model)
    source_face = best_face(face_app, source)
    hair_face = best_face(face_app, hair_source)
    source_points = face_points(source_face)
    hair_points = face_points(hair_face)

    warped_hair_source = warp_to_source(hair_source, hair_points, source_points)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    parser = load_parser(args.repo, device)
    source_parse = parse_image(parser, source, device)
    warped_parse = parse_image(parser, warped_hair_source, device)
    alpha, remove_mask = build_masks(source_parse, warped_parse, source_points, args)
    base = inpaint_old_hair(source, remove_mask) if args.remove_old_hair else source

    alpha_result = alpha_composite(base, warped_hair_source, alpha, args.alpha_strength)
    if args.mode == "alpha":
        final = alpha_result
    elif args.mode == "seamless":
        final = seamless_composite(base, warped_hair_source, alpha)
    else:
        seamless = seamless_composite(base, warped_hair_source, alpha)
        final = alpha_composite(alpha_result, seamless, alpha * 0.35, 1.0)

    save_rgb(output_path, final)
    if debug_output_path:
        save_debug(debug_output_path, base, warped_hair_source, alpha, final)
    print(f"Hair transplant saved to: {output_path}")


if __name__ == "__main__":
    main()
