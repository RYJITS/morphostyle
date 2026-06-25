import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps

from insightface.app import FaceAnalysis


DEFAULT_INSIGHTFACE_ROOT = (
    "D:/00_Cerveau_IA/Conpetances/Video/ComfyUI/ComfyUI_windows_portable/"
    "ComfyUI/models/insightface"
)


def parse_args():
    parser = argparse.ArgumentParser(description="Keep a generated reference preview as one clean portrait.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", default="")
    parser.add_argument("--insightface-root", default=DEFAULT_INSIGHTFACE_ROOT)
    parser.add_argument("--model", default="antelopev2")
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--always-crop", action="store_true")
    return parser.parse_args()


def load_face_app(root, model):
    app = FaceAnalysis(name=model, root=root, providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=0, det_size=(640, 640))
    return app


def detect_faces(app, image_rgb):
    image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
    return app.get(image_bgr)


def crop_box_for_face(face, width, height):
    x1, y1, x2, y2 = [float(value) for value in face.bbox]
    face_w = max(1.0, x2 - x1)
    face_h = max(1.0, y2 - y1)
    cx = (x1 + x2) / 2.0
    cy = (y1 + y2) / 2.0 - face_h * 0.14
    side = max(face_w * 2.65, face_h * 2.35)
    if cx < width * 0.46 or cx > width * 0.54:
        side = min(side, width * 0.52)

    left = int(round(cx - side / 2.0))
    top = int(round(cy - side / 2.0))
    right = int(round(cx + side / 2.0))
    bottom = int(round(cy + side / 2.0))

    if left < 0:
        right -= left
        left = 0
    if top < 0:
        bottom -= top
        top = 0
    if right > width:
        left -= right - width
        right = width
    if bottom > height:
        top -= bottom - height
        bottom = height

    left = max(0, left)
    top = max(0, top)
    right = min(width, right)
    bottom = min(height, bottom)
    return left, top, right, bottom


def face_center(face):
    x1, y1, x2, y2 = [float(value) for value in face.bbox]
    return (x1 + x2) / 2.0, (y1 + y2) / 2.0


def clamp_box(left, top, right, bottom, width, height):
    left = max(0, min(width - 1, int(round(left))))
    top = max(0, min(height - 1, int(round(top))))
    right = max(left + 1, min(width, int(round(right))))
    bottom = max(top + 1, min(height, int(round(bottom))))
    return left, top, right, bottom


def grid_cell_box_for_face(face, faces, width, height):
    cx, cy = face_center(face)
    inset = max(0, int(round(min(width, height) * 0.006)))

    if len(faces) >= 4:
        mid_x = width / 2.0
        mid_y = height / 2.0
        left = 0.0 if cx < mid_x else mid_x
        right = mid_x if cx < mid_x else float(width)
        top = 0.0 if cy < mid_y else mid_y
        bottom = mid_y if cy < mid_y else float(height)

        if left > 0:
            left += inset
        if top > 0:
            top += inset
        if right < width:
            right -= inset
        if bottom < height:
            bottom -= inset
        return clamp_box(left, top, right, bottom, width, height)

    centers = [face_center(item) for item in faces]
    spread_x = max(point[0] for point in centers) - min(point[0] for point in centers)
    spread_y = max(point[1] for point in centers) - min(point[1] for point in centers)

    if spread_x >= spread_y:
        mid_x = width / 2.0
        left = 0.0 if cx < mid_x else mid_x
        right = mid_x if cx < mid_x else float(width)
        return clamp_box(left + (inset if left > 0 else 0), 0, right - (inset if right < width else 0), height, width, height)

    mid_y = height / 2.0
    top = 0.0 if cy < mid_y else mid_y
    bottom = mid_y if cy < mid_y else float(height)
    return clamp_box(0, top + (inset if top > 0 else 0), width, bottom - (inset if bottom < height else 0), width, height)


def score_face(face, width, height):
    x1, y1, x2, y2 = [float(value) for value in face.bbox]
    area = max(1.0, (x2 - x1) * (y2 - y1))
    cx = (x1 + x2) / 2.0
    cy = (y1 + y2) / 2.0
    center_distance = abs(cx - width / 2.0) / width + abs(cy - height / 2.0) / height
    return area * (1.0 - min(0.75, center_distance))


def main():
    args = parse_args()
    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve() if args.output else input_path

    image = Image.open(input_path).convert("RGB")
    image = ImageOps.exif_transpose(image)
    image_rgb = np.asarray(image, dtype=np.uint8)
    height, width = image_rgb.shape[:2]

    app = load_face_app(args.insightface_root, args.model)
    faces = detect_faces(app, image_rgb)
    if len(faces) <= 1 and not args.always_crop:
        print(f"Reference sanitizer kept original ({len(faces)} face)")
        return

    if not faces:
        print("Reference sanitizer found no face, kept original")
        return

    best = max(faces, key=lambda face: score_face(face, width, height))
    crop_box = (
        grid_cell_box_for_face(best, faces, width, height)
        if len(faces) > 1
        else crop_box_for_face(best, width, height)
    )
    cleaned = image.crop(crop_box).resize((args.size, args.size), Image.Resampling.LANCZOS)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cleaned.save(output_path)
    print(f"Reference sanitizer cropped {len(faces)} faces to one portrait: {output_path}")


if __name__ == "__main__":
    main()
