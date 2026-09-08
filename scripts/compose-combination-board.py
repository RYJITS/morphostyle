from pathlib import Path

from PIL import Image, ImageOps


PROFILE = "sofia"
LENGTH = "short"
MAINTENANCE = "low"
LIFESTYLE = "classic"
VARIANTS = ("primary", "soft", "structured", "signature")

ROOT = Path(__file__).resolve().parents[1]
PROFILE_DIR = ROOT / "public" / "demo-profiles" / PROFILE
OUT_DIR = PROFILE_DIR / "combination-boards"
OUT_DIR.mkdir(parents=True, exist_ok=True)

CELL_W = 360
CELL_H = 540
GAP = 8
BG = (246, 242, 238)


def fit_cell(image: Image.Image) -> Image.Image:
    return ImageOps.fit(image.convert("RGB"), (CELL_W, CELL_H), Image.Resampling.LANCZOS, centering=(0.5, 0.5))


def fit_recommendation(image: Image.Image) -> Image.Image:
    width, height = image.size
    left = int(width * 0.08)
    right = int(width * 0.92)
    top = int(height * 0.04)
    bottom = int(height * 0.9)
    return fit_cell(image.crop((left, top, right, bottom)))


def final_board_quadrants(path: Path) -> list[Image.Image]:
    image = Image.open(path).convert("RGB")
    width, height = image.size
    mid_x = width // 2
    mid_y = height // 2
    boxes = (
        (0, 0, mid_x, mid_y),
        (mid_x, 0, width, mid_y),
        (0, mid_y, mid_x, height),
        (mid_x, mid_y, width, height),
    )
    return [fit_cell(image.crop(box)) for box in boxes]


def main() -> None:
    board_w = (CELL_W * len(VARIANTS)) + (GAP * (len(VARIANTS) + 1))
    board_h = (CELL_H * 5) + (GAP * 6)
    board = Image.new("RGB", (board_w, board_h), BG)

    for col, variant in enumerate(VARIANTS):
        x = GAP + col * (CELL_W + GAP)
        final_path = PROFILE_DIR / "final-boards" / f"{LENGTH}-{MAINTENANCE}-{LIFESTYLE}-{variant}.png"

        quadrants = final_board_quadrants(final_path)
        preview = fit_recommendation(quadrants[0])
        board.paste(preview, (x, GAP))

        for row, quadrant in enumerate(quadrants, start=1):
            y = GAP + row * (CELL_H + GAP)
            board.paste(quadrant, (x, y))

    output = OUT_DIR / f"{LENGTH}-{MAINTENANCE}-{LIFESTYLE}.png"
    board.save(output, optimize=True)
    print(output)


if __name__ == "__main__":
    main()
