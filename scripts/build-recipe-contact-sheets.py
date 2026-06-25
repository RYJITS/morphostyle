import argparse
import json
import math
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def parse_args():
    parser = argparse.ArgumentParser(description="Build visual contact sheets for MorphoStyle recipe validation.")
    parser.add_argument("manifest", help="Path to recipe validation manifest.json")
    parser.add_argument("--thumb", type=int, default=220)
    parser.add_argument("--columns", type=int, default=3)
    return parser.parse_args()


def load_font(size, bold=False):
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


FONT_TITLE = load_font(19, True)
FONT_SUBTITLE = load_font(13, True)
FONT_BODY = load_font(11)
FONT_SMALL = load_font(10)


def draw_wrapped(draw, text, xy, width, font, fill, line_height):
    x, y = xy
    for paragraph in str(text).split("\n"):
        wrapped = textwrap.wrap(paragraph, width=max(12, int(width / 6)))
        for line in wrapped or [""]:
            draw.text((x, y), line, font=font, fill=fill)
            y += line_height
    return y


def load_thumb(image_path, size):
    image = Image.open(image_path).convert("RGB")
    image.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (size, size), "white")
    left = (size - image.width) // 2
    top = (size - image.height) // 2
    canvas.paste(image, (left, top))
    return canvas


def draw_case_card(draw, sheet, case, base_dir, x, y, card_w, card_h, thumb_size):
    radius = 16
    draw.rounded_rectangle((x, y, x + card_w, y + card_h), radius=radius, fill=(255, 255, 255), outline=(229, 231, 235), width=2)
    image_file = case.get("imageFile")
    if image_file:
        image_path = base_dir / image_file
        if image_path.exists():
            thumb = load_thumb(image_path, thumb_size)
            sheet.paste(thumb, (x + 18, y + 18))
        else:
            draw.rectangle((x + 18, y + 18, x + 18 + thumb_size, y + 18 + thumb_size), fill=(254, 226, 226))

    text_x = x + 18
    text_y = y + 18 + thumb_size + 12
    title = f"{case.get('family', '')} / {case.get('key', '')}"
    draw.text((text_x, text_y), title, font=FONT_SUBTITLE, fill=(17, 24, 39))
    text_y += 18
    style = case.get("style", {})
    recipe = case.get("recipe", {})
    draw_wrapped(draw, style.get("name", ""), (text_x, text_y), card_w - 36, FONT_TITLE, (0, 0, 0), 22)
    text_y += 25
    meta = f"{recipe.get('length', '')} | {recipe.get('maintenance', '')} | {recipe.get('lifestyle', '')} | {recipe.get('gender', '')}"
    draw_wrapped(draw, meta, (text_x, text_y), card_w - 36, FONT_SMALL, (190, 18, 60), 13)
    text_y += 16
    text_y = draw_wrapped(draw, style.get("description", ""), (text_x, text_y), card_w - 36, FONT_BODY, (80, 80, 80), 14)
    text_y += 4
    expected = "Attendu: " + ", ".join(case.get("expected", [])[:3])
    text_y = draw_wrapped(draw, expected, (text_x, text_y), card_w - 36, FONT_SMALL, (22, 101, 52), 13)
    avoid = "A eviter: " + ", ".join(case.get("avoid", [])[:3])
    draw_wrapped(draw, avoid, (text_x, text_y + 2), card_w - 36, FONT_SMALL, (127, 29, 29), 13)


def make_sheet(cases, base_dir, out_path, title, columns, thumb_size):
    card_w = max(320, thumb_size + 80)
    card_h = thumb_size + 205
    gap = 18
    header_h = 74
    rows = max(1, math.ceil(len(cases) / columns))
    width = columns * card_w + (columns + 1) * gap
    height = header_h + rows * card_h + (rows + 1) * gap
    sheet = Image.new("RGB", (width, height), (250, 250, 250))
    draw = ImageDraw.Draw(sheet)
    draw.text((gap, 18), title, font=FONT_TITLE, fill=(0, 0, 0))
    draw.text((gap, 45), f"{len(cases)} previews - verifier image, recette, texte descriptif", font=FONT_BODY, fill=(95, 95, 95))

    for index, case in enumerate(cases):
        row = index // columns
        col = index % columns
        x = gap + col * (card_w + gap)
        y = header_h + gap + row * (card_h + gap)
        draw_case_card(draw, sheet, case, base_dir, x, y, card_w, card_h, thumb_size)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path)


def main():
    args = parse_args()
    manifest_path = Path(args.manifest).resolve()
    base_dir = manifest_path.parent
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    cases = [case for case in manifest.get("cases", []) if case.get("ok")]

    by_family = {}
    for case in cases:
        by_family.setdefault(case.get("family", "unknown"), []).append(case)

    make_sheet(cases, base_dir, base_dir / "sheet-overview.png", f"MorphoStyle recipe validation - {manifest.get('runId', '')}", args.columns, args.thumb)
    for family, family_cases in sorted(by_family.items()):
        make_sheet(family_cases, base_dir, base_dir / f"sheet-{family}.png", f"Recipe family: {family}", min(args.columns, len(family_cases)), args.thumb)

    print(f"Created {len(by_family) + 1} contact sheets in {base_dir}")


if __name__ == "__main__":
    main()
