from pathlib import Path
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOFIA_DIR = ROOT / "public" / "demo-profiles" / "sofia"
BOARD_DIR = SOFIA_DIR / "combination-boards"
PREVIEW_DIR = SOFIA_DIR / "recommendation-previews"
FINAL_DIR = SOFIA_DIR / "final-selections"
FINAL_VIEW_DIR = SOFIA_DIR / "final-views"

VARIANTS = ("primary", "soft", "structured", "signature")
VIEW_NAMES = ("front", "left", "right", "back")


def is_white(pixel):
    r, g, b = pixel[:3]
    return r > 245 and g > 245 and b > 245


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
            score = white / total
            in_gutter = score > 0.82
            if in_gutter and start is None:
                start = x
            elif not in_gutter and start is not None:
                if x - start >= 2:
                    runs.append((start, x))
                start = None
        if start is not None and outer - start >= 2:
            runs.append((start, outer))
        expected = [width / 4, width / 2, 3 * width / 4]
        edge_limit = width
    else:
        outer = height
        inner_positions = range(0, width, 8)
        total = len(range(0, width, 8))
        for y in range(height):
            white = sum(1 for x in inner_positions if is_white(pixels[x, y]))
            score = white / total
            in_gutter = score > 0.82
            if in_gutter and start is None:
                start = y
            elif not in_gutter and start is not None:
                if y - start >= 2:
                    runs.append((start, y))
                start = None
        if start is not None and outer - start >= 2:
            runs.append((start, outer))
        expected = [height / 4, height / 2, 3 * height / 4]
        edge_limit = height

    candidates = [
        run for run in runs
        if run[0] > 8 and run[1] < edge_limit - 8 and (run[1] - run[0]) <= 24
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


def cell_boxes(image):
    width, height = image.size
    x_runs = gutter_runs(image, "x")
    y_runs = gutter_runs(image, "y")

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


def resize_cover(image, size):
    target_w, target_h = size
    width, height = image.size
    scale = max(target_w / width, target_h / height)
    resized = image.resize((round(width * scale), round(height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def process_board(board_path):
    combo = board_path.stem
    image = Image.open(board_path).convert("RGB")
    boxes = cell_boxes(image)

    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    FINAL_DIR.mkdir(parents=True, exist_ok=True)
    FINAL_VIEW_DIR.mkdir(parents=True, exist_ok=True)

    for col, variant in enumerate(VARIANTS):
        front = image.crop(boxes[0][col])
        resize_cover(front, (768, 1152)).save(PREVIEW_DIR / f"{combo}-{variant}.png", optimize=True)

        for row, view_name in enumerate(VIEW_NAMES):
            view = image.crop(boxes[row][col])
            resize_cover(view, (768, 1152)).save(FINAL_VIEW_DIR / f"{combo}-{variant}-{view_name}.png", optimize=True)

        gap = 6
        cell_size = (512, 768)
        final = Image.new("RGB", (cell_size[0] * 2 + gap, cell_size[1] * 2 + gap), (246, 242, 238))
        positions = [(0, 0), (cell_size[0] + gap, 0), (0, cell_size[1] + gap), (cell_size[0] + gap, cell_size[1] + gap)]
        for row, position in enumerate(positions):
            view = resize_cover(image.crop(boxes[row][col]), cell_size)
            final.paste(view, position)
        final.save(FINAL_DIR / f"{combo}-{variant}.png", optimize=True)


def main():
    boards = sorted(BOARD_DIR.glob("*.png"))
    if not boards:
        raise SystemExit(f"No boards found in {BOARD_DIR}")

    for board in boards:
        process_board(board)

    print(f"Processed {len(boards)} boards")
    print(f"Previews: {len(list(PREVIEW_DIR.glob('*.png')))}")
    print(f"Final selections: {len(list(FINAL_DIR.glob('*.png')))}")
    print(f"Final views: {len(list(FINAL_VIEW_DIR.glob('*.png')))}")


if __name__ == "__main__":
    main()
