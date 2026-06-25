import argparse
import os
import sys
from pathlib import Path

import cv2
import numpy as np
import torch
import torchvision.transforms as transforms
from PIL import Image
from scipy import ndimage


LABELS = {
    "background": 0,
    "skin": 1,
    "left_brow": 2,
    "right_brow": 3,
    "left_eye": 4,
    "right_eye": 5,
    "glasses": 6,
    "left_ear": 7,
    "right_ear": 8,
    "earring": 9,
    "nose": 10,
    "mouth": 11,
    "upper_lip": 12,
    "lower_lip": 13,
    "neck": 14,
    "necklace": 15,
    "cloth": 16,
    "hair": 17,
    "hat": 18,
}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Fuse a HairFastGAN hairstyle transfer with the original face preserved."
    )
    parser.add_argument("--repo", default="output/external/HairFastGAN")
    parser.add_argument("--source", required=True)
    parser.add_argument("--generated", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--mask-output", default="")
    parser.add_argument("--debug-output", default="")
    parser.add_argument("--width", type=int, default=1024)
    parser.add_argument("--height", type=int, default=1024)
    parser.add_argument("--mode", choices=["alpha", "poisson", "mixed"], default="mixed")
    parser.add_argument("--hair-dilate", type=int, default=24)
    parser.add_argument("--face-dilate", type=int, default=7)
    parser.add_argument("--blur", type=float, default=11.0)
    parser.add_argument("--upper-band", type=float, default=0.315)
    parser.add_argument("--forehead-pad", type=int, default=24)
    return parser.parse_args()


def load_rgb(path, width, height):
    image = Image.open(path).convert("RGB")
    image = image.resize((width, height), Image.LANCZOS)
    return np.asarray(image, dtype=np.uint8)


def load_parser(repo, device):
    repo_path = Path(repo).resolve()
    sys.path.insert(0, str(repo_path))
    os.chdir(repo_path)

    from models.CtrlHair.external_code.face_parsing.model import BiSeNet

    model = BiSeNet(n_classes=19)
    weight_path = repo_path / "pretrained_models" / "BiSeNet" / "face_parsing_79999_iter.pth"
    state = torch.load(weight_path, map_location=device)
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


def dilate(mask, iterations):
    if iterations <= 0:
        return mask
    return ndimage.binary_dilation(mask, iterations=iterations)


def erode(mask, iterations):
    if iterations <= 0:
        return mask
    return ndimage.binary_erosion(mask, iterations=iterations)


def close(mask, iterations):
    if iterations <= 0:
        return mask
    structure = np.ones((3, 3), dtype=bool)
    return ndimage.binary_closing(mask, structure=structure, iterations=iterations)


def soft_mask(mask, blur):
    mask = mask.astype(np.float32)
    if blur > 0:
        mask = ndimage.gaussian_filter(mask, sigma=blur)
    max_value = float(mask.max())
    if max_value > 0:
        mask = mask / max_value
    return np.clip(mask, 0.0, 1.0)


def y_min_for_labels(parsing, labels, fallback):
    mask = np.isin(parsing, list(labels))
    ys = np.where(mask)[0]
    if ys.size == 0:
        return fallback
    return int(ys.min())


def build_masks(source_parse, generated_parse, args):
    height, width = source_parse.shape
    y_grid, x_grid = np.mgrid[0:height, 0:width]

    source_hair = source_parse == LABELS["hair"]
    generated_hair = generated_parse == LABELS["hair"]
    generated_hat = generated_parse == LABELS["hat"]

    eye_brow_top = y_min_for_labels(
        source_parse,
        {
            LABELS["left_brow"],
            LABELS["right_brow"],
            LABELS["left_eye"],
            LABELS["right_eye"],
            LABELS["nose"],
        },
        int(height * 0.34),
    )
    forehead_cut = max(0, eye_brow_top - args.forehead_pad)
    upper_band_y = int(height * args.upper_band)

    hair_region = dilate(source_hair | generated_hair | generated_hat, args.hair_dilate)
    hair_region = close(hair_region, 6)

    source_head_width = dilate(
        np.isin(
            source_parse,
            [
                LABELS["skin"],
                LABELS["left_brow"],
                LABELS["right_brow"],
                LABELS["left_eye"],
                LABELS["right_eye"],
                LABELS["nose"],
                LABELS["mouth"],
                LABELS["upper_lip"],
                LABELS["lower_lip"],
                LABELS["left_ear"],
                LABELS["right_ear"],
                LABELS["hair"],
            ],
        ),
        22,
    )
    upper_band = (y_grid < upper_band_y) & source_head_width

    transfer = hair_region | upper_band

    protected_core = np.isin(
        source_parse,
        [
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
        ],
    )
    protected_skin = (source_parse == LABELS["skin"]) & (y_grid >= forehead_cut)
    protected_face = dilate(protected_core | protected_skin, args.face_dilate)

    transfer = transfer & ~erode(protected_face, 2)
    transfer = close(transfer, 3)

    face_reinject = soft_mask(dilate(protected_core | protected_skin, 2), 2.5)
    alpha = soft_mask(transfer, args.blur)
    alpha = np.clip(alpha * (1.0 - face_reinject), 0.0, 1.0)
    return alpha, face_reinject, transfer, protected_face, forehead_cut


def alpha_blend(source, generated, alpha):
    alpha3 = alpha[..., None]
    return np.clip(generated.astype(np.float32) * alpha3 + source.astype(np.float32) * (1.0 - alpha3), 0, 255).astype(
        np.uint8
    )


def poisson_blend(source, generated, transfer):
    mask = (transfer.astype(np.uint8) * 255)
    ys, xs = np.where(mask > 0)
    if xs.size == 0 or ys.size == 0:
        return source.copy()
    center = (int((xs.min() + xs.max()) / 2), int((ys.min() + ys.max()) / 2))
    source_bgr = cv2.cvtColor(source, cv2.COLOR_RGB2BGR)
    generated_bgr = cv2.cvtColor(generated, cv2.COLOR_RGB2BGR)
    blended = cv2.seamlessClone(generated_bgr, source_bgr, mask, center, cv2.MIXED_CLONE)
    return cv2.cvtColor(blended, cv2.COLOR_BGR2RGB)


def reinject_face(base, source, face_reinject):
    face3 = face_reinject[..., None]
    return np.clip(source.astype(np.float32) * face3 + base.astype(np.float32) * (1.0 - face3), 0, 255).astype(np.uint8)


def save_debug(debug_path, source, generated, alpha, face_reinject, final):
    alpha_rgb = np.repeat((alpha * 255).astype(np.uint8)[..., None], 3, axis=2)
    face_rgb = np.zeros_like(source)
    face_rgb[..., 1] = (face_reinject * 255).astype(np.uint8)
    row1 = np.concatenate([source, generated], axis=1)
    row2 = np.concatenate([alpha_rgb, face_rgb], axis=1)
    row3 = np.concatenate([final, np.zeros_like(final)], axis=1)
    debug = np.concatenate([row1, row2, row3], axis=0)
    Image.fromarray(debug).save(debug_path)


def main():
    args = parse_args()
    source_path = Path(args.source).resolve()
    generated_path = Path(args.generated).resolve()
    output_path = Path(args.output).resolve()
    mask_output_path = Path(args.mask_output).resolve() if args.mask_output else None
    debug_output_path = Path(args.debug_output).resolve() if args.debug_output else None

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = load_parser(args.repo, device)

    source = load_rgb(source_path, args.width, args.height)
    generated = load_rgb(generated_path, args.width, args.height)
    source_parse = parse_image(model, source, device)
    generated_parse = parse_image(model, generated, device)

    alpha, face_reinject, transfer, _protected_face, forehead_cut = build_masks(source_parse, generated_parse, args)

    alpha_result = alpha_blend(source, generated, alpha)
    if args.mode == "alpha":
        final = alpha_result
    else:
        poisson = poisson_blend(source, generated, transfer)
        if args.mode == "poisson":
            final = poisson
        else:
            mix_alpha = soft_mask(transfer, max(4.0, args.blur / 2.0))
            final = alpha_blend(alpha_result, poisson, mix_alpha * 0.45)

    final = reinject_face(final, source, face_reinject)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(final).save(output_path)

    if mask_output_path:
        mask_output_path.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray((alpha * 255).astype(np.uint8)).save(mask_output_path)

    if debug_output_path:
        debug_output_path.parent.mkdir(parents=True, exist_ok=True)
        save_debug(debug_output_path, source, generated, alpha, face_reinject, final)

    print(f"Fusion saved to: {output_path}")
    print(f"Forehead cut y: {forehead_cut}")


if __name__ == "__main__":
    main()
