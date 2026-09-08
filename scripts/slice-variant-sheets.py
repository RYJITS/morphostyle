import argparse
from pathlib import Path
from PIL import Image, ImageChops, ImageOps, ImageStat


ROOT = Path(__file__).resolve().parents[1]
VIEW_NAMES = ("front", "left", "right", "back")


def is_white(pixel):
    r, g, b = pixel[:3]
    return r > 245 and g > 245 and b > 245


def outer_white_ratio(image, border=8):
    width, height = image.size
    regions = [
        image.crop((0, 0, width, border)),
        image.crop((0, height - border, width, height)),
        image.crop((0, 0, border, height)),
        image.crop((width - border, 0, width, height)),
    ]
    total_white = 0
    total_pixels = 0
    for region in regions:
        pixels = list(region.getdata())
        total_pixels += len(pixels)
        total_white += sum(1 for pixel in pixels if is_white(pixel))
    return total_white / total_pixels if total_pixels else 0


def resize_cover(image, size):
    target_w, target_h = size
    width, height = image.size
    scale = max(target_w / width, target_h / height)
    resized = image.resize((round(width * scale), round(height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def inset_box(box, inset=8):
    left, top, right, bottom = box
    return (left + inset, top + inset, right - inset, bottom - inset)


def bright_midline(image, axis):
    width, height = image.size
    gray = ImageOps.grayscale(image)
    limit = width if axis == "x" else height
    target = limit / 2
    radius = round(limit * 0.06)
    start = max(4, round(target - radius))
    end = min(limit - 4, round(target + radius))
    scores = []
    for position in range(start, end + 1):
        region = gray.crop((position, 0, position + 1, height)) if axis == "x" else gray.crop((0, position, width, position + 1))
        scores.append((ImageStat.Stat(region).mean[0], position))
    score, position = max(scores)
    if score >= 185:
        return position
    return round(target)


def cell_boxes(image):
    width, height = image.size
    mid_x = bright_midline(image, "x")
    mid_y = bright_midline(image, "y")
    return {
        "front": (0, 0, mid_x, mid_y),
        "left": (mid_x + 1, 0, width, mid_y),
        "right": (0, mid_y + 1, mid_x, height),
        "back": (mid_x + 1, mid_y + 1, width, height),
    }


def mirror_score(image, boxes):
    left = image.crop(boxes["left"])
    right = image.crop(boxes["right"])
    mirrored_right = ImageOps.mirror(right)
    a = ImageOps.grayscale(left).resize((128, 128), Image.Resampling.LANCZOS)
    b = ImageOps.grayscale(mirrored_right).resize((128, 128), Image.Resampling.LANCZOS)
    diff = ImageChops.difference(a, b)
    return ImageStat.Stat(diff).mean[0]


def process_sheet(profile_dir, sheet_path, strict):
    stem_parts = sheet_path.stem.split("-")
    if len(stem_parts) < 4:
        raise ValueError(f"{sheet_path.name}: expected <combo>-<variant>.png")
    variant = stem_parts[-1]
    combo = "-".join(stem_parts[:-1])

    image = Image.open(sheet_path).convert("RGB")
    boxes = cell_boxes(image)
    sheet_edge_white = outer_white_ratio(image)
    side_mirror_score = mirror_score(image, boxes)

    if strict and sheet_edge_white > 0.2:
        raise ValueError(f"{sheet_path.name}: outer white ratio too high ({sheet_edge_white:.3f})")
    if strict and side_mirror_score < 28:
        raise ValueError(f"{sheet_path.name}: left/right profile may be mirrored ({side_mirror_score:.2f})")

    preview_dir = profile_dir / "recommendation-previews"
    final_dir = profile_dir / "final-selections"
    final_view_dir = profile_dir / "final-views"
    preview_dir.mkdir(parents=True, exist_ok=True)
    final_dir.mkdir(parents=True, exist_ok=True)
    final_view_dir.mkdir(parents=True, exist_ok=True)

    cropped_views = {}
    for view_name in VIEW_NAMES:
        cropped = image.crop(inset_box(boxes[view_name]))
        view = resize_cover(cropped, (768, 1152))
        edge_white = outer_white_ratio(view)
        if strict and edge_white > 0.25:
            raise ValueError(f"{sheet_path.name} {view_name}: cropped edge white ratio too high ({edge_white:.3f})")
        cropped_views[view_name] = view
        view.save(final_view_dir / f"{combo}-{variant}-{view_name}.png", optimize=True)

    cropped_views["front"].save(preview_dir / f"{combo}-{variant}.png", optimize=True)

    gap = 6
    cell_size = (512, 768)
    final = Image.new("RGB", (cell_size[0] * 2 + gap, cell_size[1] * 2 + gap), (246, 242, 238))
    positions = {
        "front": (0, 0),
        "left": (cell_size[0] + gap, 0),
        "right": (0, cell_size[1] + gap),
        "back": (cell_size[0] + gap, cell_size[1] + gap),
    }
    for view_name, position in positions.items():
        final.paste(resize_cover(cropped_views[view_name], cell_size), position)
    final.save(final_dir / f"{combo}-{variant}.png", optimize=True)

    print(f"Processed {sheet_path.name}")
    print(f"  outer_white_ratio={sheet_edge_white:.4f}")
    print(f"  mirror_score={side_mirror_score:.2f}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("profile", help="profile asset id, for example marc")
    parser.add_argument("--combo", help="optional combo key, for example short-low-classic")
    parser.add_argument("--variant", help="optional variant, for example primary")
    parser.add_argument("--strict", action="store_true", help="fail on border or mirror-like profile issues")
    args = parser.parse_args()

    profile_dir = ROOT / "public" / "demo-profiles" / args.profile
    sheet_dir = profile_dir / "variant-sheets"
    if args.combo and args.variant:
        pattern = f"{args.combo}-{args.variant}.png"
    elif args.combo:
        pattern = f"{args.combo}-*.png"
    else:
        pattern = "*.png"
    sheets = sorted(sheet_dir.glob(pattern))
    if not sheets:
        raise SystemExit(f"No variant sheets found in {sheet_dir} for {pattern}")

    for sheet in sheets:
        process_sheet(profile_dir, sheet, args.strict)

    print(f"Processed variant sheets: {len(sheets)}")
    print(f"Previews: {len(list((profile_dir / 'recommendation-previews').glob('*.png')))}")
    print(f"Final selections: {len(list((profile_dir / 'final-selections').glob('*.png')))}")
    print(f"Final views: {len(list((profile_dir / 'final-views').glob('*.png')))}")


if __name__ == "__main__":
    main()
