import argparse
from pathlib import Path
from PIL import Image, ImageChops, ImageOps, ImageStat


ROOT = Path(__file__).resolve().parents[1]
VARIANTS = ("primary", "soft", "structured", "signature")
VIEW_NAMES = ("front", "left", "right", "back")


def is_white(pixel):
    r, g, b = pixel[:3]
    return r > 245 and g > 245 and b > 245


def white_ratio(image):
    pixels = list(image.getdata())
    if not pixels:
        return 0
    return sum(1 for pixel in pixels if is_white(pixel)) / len(pixels)


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


def gutter_runs(image, axis):
    width, height = image.size
    pixels = image.load()
    runs = []
    start = None

    if axis == "x":
        outer = width
        inner_positions = range(0, height, 8)
        total = len(range(0, height, 8))
        for x in range(width):
            white = sum(1 for y in inner_positions if is_white(pixels[x, y]))
            in_gutter = white / total > 0.72
            if in_gutter and start is None:
                start = x
            elif not in_gutter and start is not None:
                if x - start >= 1:
                    runs.append((start, x))
                start = None
        if start is not None and outer - start >= 1:
            runs.append((start, outer))
        expected = [width / 4, width / 2, 3 * width / 4]
        edge_limit = width
    else:
        outer = height
        inner_positions = range(0, width, 8)
        total = len(range(0, width, 8))
        for y in range(height):
            white = sum(1 for x in inner_positions if is_white(pixels[x, y]))
            in_gutter = white / total > 0.72
            if in_gutter and start is None:
                start = y
            elif not in_gutter and start is not None:
                if y - start >= 1:
                    runs.append((start, y))
                start = None
        if start is not None and outer - start >= 1:
            runs.append((start, outer))
        expected = [height / 4, height / 2, 3 * height / 4]
        edge_limit = height

    candidates = [
        run for run in runs
        if run[0] > 4 and run[1] < edge_limit - 4 and (run[1] - run[0]) <= 24
    ]
    selected = []
    for target in expected:
        nearest = min(
            candidates,
            key=lambda run: abs(((run[0] + run[1]) / 2) - target),
            default=None,
        )
        if nearest is None or abs(((nearest[0] + nearest[1]) / 2) - target) > 80:
            return None
        selected.append(nearest)

    selected = sorted(set(selected))
    return selected if len(selected) == 3 else None


def bright_divider_runs(image, axis):
    width, height = image.size
    gray = ImageOps.grayscale(image)
    expected = [width / 4, width / 2, 3 * width / 4] if axis == "x" else [height / 4, height / 2, 3 * height / 4]
    limit = width if axis == "x" else height
    search_radius = round(limit * 0.045)
    selected = []

    for target in expected:
        start = max(4, round(target - search_radius))
        end = min(limit - 4, round(target + search_radius))
        scores = []
        for position in range(start, end + 1):
            region = gray.crop((position, 0, position + 1, height)) if axis == "x" else gray.crop((0, position, width, position + 1))
            scores.append((ImageStat.Stat(region).mean[0], position))

        score, position = max(scores)
        if score < 205:
            return None
        selected.append((position, position + 1))

    return selected if len(set(selected)) == 3 else None


def cell_boxes(image):
    width, height = image.size
    x_runs = gutter_runs(image, "x") or bright_divider_runs(image, "x")
    y_runs = gutter_runs(image, "y") or bright_divider_runs(image, "y")

    if not x_runs or not y_runs:
        x_edges = [round(i * width / 4) for i in range(5)]
        y_edges = [round(i * height / 4) for i in range(5)]
        return [
            [
                (x_edges[col], y_edges[row], x_edges[col + 1], y_edges[row + 1])
                for col in range(4)
            ]
            for row in range(4)
        ]

    x_boxes = [
        (0, x_runs[0][0]),
        (x_runs[0][1], x_runs[1][0]),
        (x_runs[1][1], x_runs[2][0]),
        (x_runs[2][1], width),
    ]
    y_boxes = [
        (0, y_runs[0][0]),
        (y_runs[0][1], y_runs[1][0]),
        (y_runs[1][1], y_runs[2][0]),
        (y_runs[2][1], height),
    ]

    return [
        [
            (x_boxes[col][0], y_boxes[row][0], x_boxes[col][1], y_boxes[row][1])
            for col in range(4)
        ]
        for row in range(4)
    ]


def inset_box(box, inset=6):
    left, top, right, bottom = box
    return (left + inset, top + inset, right - inset, bottom - inset)


def resize_cover(image, size):
    target_w, target_h = size
    width, height = image.size
    scale = max(target_w / width, target_h / height)
    resized = image.resize((round(width * scale), round(height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def mirror_score(image, boxes, col):
    left = image.crop(boxes[1][col])
    right = image.crop(boxes[2][col])
    mirrored_right = ImageOps.mirror(right)
    a = ImageOps.grayscale(left).resize((96, 96), Image.Resampling.LANCZOS)
    b = ImageOps.grayscale(mirrored_right).resize((96, 96), Image.Resampling.LANCZOS)
    diff = ImageChops.difference(a, b)
    return ImageStat.Stat(diff).mean[0]


def process_board(profile_dir, board_path, strict):
    combo = board_path.stem
    image = Image.open(board_path).convert("RGB")
    boxes = cell_boxes(image)

    board_edge_white = outer_white_ratio(image)
    mirror_scores = [mirror_score(image, boxes, col) for col in range(4)]
    if strict and board_edge_white > 0.65:
        raise ValueError(f"{board_path.name}: outer white ratio too high ({board_edge_white:.3f})")
    if strict and min(mirror_scores) < 28:
        raise ValueError(f"{board_path.name}: left/right profile may be mirrored ({mirror_scores})")

    preview_dir = profile_dir / "recommendation-previews"
    final_dir = profile_dir / "final-selections"
    final_view_dir = profile_dir / "final-views"
    preview_dir.mkdir(parents=True, exist_ok=True)
    final_dir.mkdir(parents=True, exist_ok=True)
    final_view_dir.mkdir(parents=True, exist_ok=True)

    warnings = []
    for col, variant in enumerate(VARIANTS):
        front = resize_cover(image.crop(inset_box(boxes[0][col])), (768, 1152))
        preview_path = preview_dir / f"{combo}-{variant}.png"
        front.save(preview_path, optimize=True)

        for row, view_name in enumerate(VIEW_NAMES):
            view = resize_cover(image.crop(inset_box(boxes[row][col])), (768, 1152))
            edge_white = outer_white_ratio(view)
            if strict and edge_white > 0.65:
                raise ValueError(f"{combo}-{variant}-{view_name}: cropped edge white ratio too high ({edge_white:.3f})")
            if edge_white > 0.25:
                warnings.append(f"{combo}-{variant}-{view_name}: edge white {edge_white:.3f}")
            view.save(final_view_dir / f"{combo}-{variant}-{view_name}.png", optimize=True)

        gap = 6
        cell_size = (512, 768)
        final = Image.new("RGB", (cell_size[0] * 2 + gap, cell_size[1] * 2 + gap), (246, 242, 238))
        positions = [(0, 0), (cell_size[0] + gap, 0), (0, cell_size[1] + gap), (cell_size[0] + gap, cell_size[1] + gap)]
        for row, position in enumerate(positions):
            view = resize_cover(image.crop(inset_box(boxes[row][col])), cell_size)
            final.paste(view, position)
        final.save(final_dir / f"{combo}-{variant}.png", optimize=True)

    print(f"Processed {board_path.name}")
    print(f"  outer_white_ratio={board_edge_white:.4f}")
    print("  mirror_scores=" + ", ".join(f"{score:.2f}" for score in mirror_scores))
    if warnings:
        print("  warnings:")
        for warning in warnings:
            print(f"    - {warning}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("profile", help="profile asset id, for example sofia or lya")
    parser.add_argument("--strict", action="store_true", help="fail on border or mirror-like profile issues")
    args = parser.parse_args()

    profile_dir = ROOT / "public" / "demo-profiles" / args.profile
    board_dir = profile_dir / "combination-boards"
    boards = sorted(board_dir.glob("*.png"))
    if not boards:
        raise SystemExit(f"No boards found in {board_dir}")

    for board in boards:
        process_board(profile_dir, board, args.strict)

    print(f"Processed boards: {len(boards)}")
    print(f"Previews: {len(list((profile_dir / 'recommendation-previews').glob('*.png')))}")
    print(f"Final selections: {len(list((profile_dir / 'final-selections').glob('*.png')))}")
    print(f"Final views: {len(list((profile_dir / 'final-views').glob('*.png')))}")


if __name__ == "__main__":
    main()
