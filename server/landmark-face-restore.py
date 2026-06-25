import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage
from skimage.transform import PiecewiseAffineTransform, warp

from insightface.app import FaceAnalysis


DEFAULT_INSIGHTFACE_ROOT = (
    "D:/00_Cerveau_IA/Conpetances/Video/ComfyUI/ComfyUI_windows_portable/"
    "ComfyUI/models/insightface"
)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Restore the original face onto a generated haircut image using InsightFace landmarks."
    )
    parser.add_argument("--source", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--debug-output", default="")
    parser.add_argument("--insightface-root", default=DEFAULT_INSIGHTFACE_ROOT)
    parser.add_argument("--model", default="antelopev2")
    parser.add_argument("--width", type=int, default=1024)
    parser.add_argument("--height", type=int, default=1024)
    parser.add_argument("--mode", choices=["alpha", "seamless", "mixed"], default="mixed")
    parser.add_argument("--mask-dilate", type=int, default=18)
    parser.add_argument("--mask-erode", type=int, default=0)
    parser.add_argument("--mask-blur", type=float, default=11.0)
    parser.add_argument("--top-protect", type=float, default=0.245)
    parser.add_argument("--alpha-strength", type=float, default=0.92)
    parser.add_argument("--quality-gate", action="store_true", default=True)
    parser.add_argument("--no-quality-gate", dest="quality_gate", action="store_false")
    parser.add_argument("--similarity-margin", type=float, default=0.01)
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


def detect_best_face(app, image_rgb):
    image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
    faces = app.get(image_bgr)
    if not faces:
        raise RuntimeError("No face detected")
    return max(faces, key=lambda face: float((face.bbox[2] - face.bbox[0]) * (face.bbox[3] - face.bbox[1])))


def landmarks(face):
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
    # Border anchors keep the piecewise transform stable outside the face.
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


def warp_source_to_target(source, source_points, target_points):
    height, width = source.shape[:2]
    transform = PiecewiseAffineTransform()
    transform.estimate(stable_points(source_points, width, height), stable_points(target_points, width, height))
    warped = warp(
        source,
        inverse_map=transform.inverse,
        output_shape=(height, width),
        preserve_range=True,
        mode="edge",
    )
    return np.clip(warped, 0, 255).astype(np.uint8)


def landmark_hull_mask(points, width, height, top_protect):
    hull = cv2.convexHull(points.astype(np.int32))
    mask = np.zeros((height, width), dtype=np.uint8)
    cv2.fillConvexPoly(mask, hull, 255)

    # Keep the generated hairline/scalp from the target. Landmarks can include brow/forehead,
    # but the selected haircut must remain from the generated image.
    y_grid = np.arange(height)[:, None]
    mask = np.where(y_grid < int(height * top_protect), 0, mask)
    return mask


def process_mask(mask, dilate, erode, blur):
    work = mask > 0
    if dilate > 0:
        work = ndimage.binary_dilation(work, iterations=dilate)
    if erode > 0:
        work = ndimage.binary_erosion(work, iterations=erode)
    alpha = work.astype(np.float32)
    if blur > 0:
        alpha = ndimage.gaussian_filter(alpha, sigma=blur)
    max_value = float(alpha.max())
    if max_value > 0:
        alpha /= max_value
    return np.clip(alpha, 0.0, 1.0)


def color_match(source, target, alpha):
    mask = alpha > 0.35
    if not np.any(mask):
        return source
    src = source.astype(np.float32)
    tgt = target.astype(np.float32)
    out = src.copy()
    for channel in range(3):
        src_vals = src[..., channel][mask]
        tgt_vals = tgt[..., channel][mask]
        src_std = float(src_vals.std()) or 1.0
        tgt_std = float(tgt_vals.std()) or 1.0
        out[..., channel] = (src[..., channel] - float(src_vals.mean())) * (tgt_std / src_std) + float(tgt_vals.mean())
    return np.clip(out, 0, 255).astype(np.uint8)


def alpha_composite(target, source, alpha, strength):
    alpha = np.clip(alpha * strength, 0.0, 1.0)[..., None]
    return np.clip(source.astype(np.float32) * alpha + target.astype(np.float32) * (1.0 - alpha), 0, 255).astype(np.uint8)


def seamless_composite(target, source, alpha):
    mask = (alpha > 0.12).astype(np.uint8) * 255
    ys, xs = np.where(mask > 0)
    if xs.size == 0 or ys.size == 0:
        return target
    center = (int((xs.min() + xs.max()) / 2), int((ys.min() + ys.max()) / 2))
    return cv2.cvtColor(
        cv2.seamlessClone(
            cv2.cvtColor(source, cv2.COLOR_RGB2BGR),
            cv2.cvtColor(target, cv2.COLOR_RGB2BGR),
            mask,
            center,
            cv2.NORMAL_CLONE,
        ),
        cv2.COLOR_BGR2RGB,
    )


def save_debug(path, source, target, warped, alpha, final):
    alpha_rgb = np.repeat((alpha * 255).astype(np.uint8)[..., None], 3, axis=2)
    row1 = np.concatenate([source, target], axis=1)
    row2 = np.concatenate([warped, alpha_rgb], axis=1)
    row3 = np.concatenate([final, np.zeros_like(final)], axis=1)
    save_rgb(path, np.concatenate([row1, row2, row3], axis=0))


def normalized_embedding(face):
    embedding = getattr(face, "embedding", None)
    if embedding is None:
        return None
    embedding = np.asarray(embedding, dtype=np.float32)
    norm = float(np.linalg.norm(embedding))
    if norm <= 0:
        return None
    return embedding / norm


def cosine_similarity(a, b):
    if a is None or b is None:
        return None
    return float(np.dot(a, b))


def main():
    args = parse_args()
    source = load_rgb(args.source, args.width, args.height)
    target = load_rgb(args.target, args.width, args.height)

    app = load_face_app(args.insightface_root, args.model)
    source_face = detect_best_face(app, source)
    target_face = detect_best_face(app, target)
    source_points = landmarks(source_face)
    target_points = landmarks(target_face)

    warped = warp_source_to_target(source, source_points, target_points)
    alpha = process_mask(
        landmark_hull_mask(target_points, args.width, args.height, args.top_protect),
        args.mask_dilate,
        args.mask_erode,
        args.mask_blur,
    )
    matched = color_match(warped, target, alpha)

    alpha_result = alpha_composite(target, matched, alpha, args.alpha_strength)
    if args.mode == "alpha":
        final = alpha_result
    elif args.mode == "seamless":
        final = seamless_composite(target, matched, alpha)
    else:
        seamless = seamless_composite(target, matched, alpha)
        final = alpha_composite(alpha_result, seamless, alpha * 0.45, 1.0)

    if args.quality_gate:
        source_embedding = normalized_embedding(source_face)
        target_embedding = normalized_embedding(target_face)
        final_face = detect_best_face(app, final)
        final_embedding = normalized_embedding(final_face)
        target_similarity = cosine_similarity(source_embedding, target_embedding)
        final_similarity = cosine_similarity(source_embedding, final_embedding)
        if (
            target_similarity is not None
            and final_similarity is not None
            and final_similarity + args.similarity_margin < target_similarity
        ):
            final = target
            print(
                "Quality gate kept target "
                f"(target_sim={target_similarity:.4f}, restored_sim={final_similarity:.4f})"
            )
        else:
            print(
                "Quality gate kept restored "
                f"(target_sim={target_similarity:.4f}, restored_sim={final_similarity:.4f})"
            )

    save_rgb(args.output, final)
    if args.debug_output:
        save_debug(args.debug_output, source, target, matched, alpha, final)

    print(f"Restored face saved to: {Path(args.output).resolve()}")


if __name__ == "__main__":
    main()
