from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public" / "demo-profiles"
SHEET = Path(r"C:\Users\ysche\.codex\generated_images\01a02af0-1b45-7a63-b5f7-91d92cfce98d\call_FQKriMuQFCKrRBpiRsCyY5Wi.png")
SOFIA_LOOKS_SHEET = Path(r"C:\Users\ysche\.codex\generated_images\01a02af0-1b45-7a63-b5f7-91d92cfce98d\call_WjZRsfZ9FklO7RV7rlRYlfJV.png")

LENGTHS = ["short", "medium", "long", "any"]
MAINTENANCE = ["low", "medium", "high"]
LIFESTYLES = ["classic", "modern", "bold"]
VARIANTS = ["primary", "soft", "structured", "signature"]


def ensure_dirs():
    for name in ["sofia", "lya", "elena", "marc", "sam"]:
        (PUBLIC / name).mkdir(parents=True, exist_ok=True)
    (PUBLIC / "sofia" / "looks").mkdir(parents=True, exist_ok=True)


def crop_contact_sheet():
    if not SHEET.exists():
        return

    sheet = Image.open(SHEET).convert("RGB")
    width, height = sheet.size
    mid_x, mid_y = width // 2, height // 2
    crops = {
        "lya": (0, 0, mid_x, mid_y),
        "elena": (mid_x, 0, width, mid_y),
        "marc": (0, mid_y, mid_x, height),
        "sam": (mid_x, mid_y, width, height),
    }

    for name, box in crops.items():
        portrait = sheet.crop(box)
        portrait.save(PUBLIC / name / "source.png")


def palette_for(lifestyle, maintenance, variant):
    palettes = {
        "classic": [(43, 28, 22), (70, 45, 32), (112, 78, 54)],
        "modern": [(31, 24, 22), (89, 62, 44), (139, 100, 64)],
        "bold": [(22, 19, 24), (92, 64, 83), (171, 116, 92)],
    }
    base, mid, light = palettes[lifestyle]
    if maintenance == "low":
        light = tuple(max(0, value - 8) for value in light)
    if maintenance == "high":
        light = tuple(min(255, value + 18) for value in light)
    if variant == "soft":
        mid = tuple(min(255, value + 14) for value in mid)
    if variant == "signature":
        light = (190, 126, 76)
    return base, mid, light


def draw_texture(draw, cx, top, width, base_y, color, alpha, variant):
    spread = int(width * 0.42)
    step = max(10, spread // 8)
    for offset in range(-spread, spread + 1, step):
        start_x = cx + offset
        end_x = cx + int(offset * 0.78)
        control = -18 if offset < 0 else 18
        draw.line(
            [
                (start_x, top + 28),
                (cx + offset // 3 + control, top + 82),
                (end_x, base_y - 18),
            ],
            fill=(*color, alpha),
            width=4 if variant == "structured" else 3,
            joint="curve",
        )


def hair_mask(size, length, lifestyle, maintenance, variant):
    w, h = size
    cx = w // 2
    top = int(h * 0.165)
    hairline = int(h * 0.285)
    shoulder = int(h * 0.79)
    width = int(w * 0.47)
    side = int(width * (0.66 if length == "short" else 0.78))

    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)

    # Top mass: keep the face readable and never cover the eyes.
    draw.ellipse((cx - side, top, cx + side, hairline + 98), fill=218)

    if length == "short":
        draw.rounded_rectangle((cx - side + 10, hairline + 8, cx - side + 48, hairline + 94), radius=24, fill=146)
        draw.rounded_rectangle((cx + side - 48, hairline + 8, cx + side - 10, hairline + 94), radius=24, fill=146)
    elif length == "medium":
        draw.rounded_rectangle((cx - side - 16, hairline + 16, cx - side + 66, shoulder - 130), radius=44, fill=186)
        draw.rounded_rectangle((cx + side - 66, hairline + 16, cx + side + 16, shoulder - 130), radius=44, fill=186)
    elif length == "long":
        draw.rounded_rectangle((cx - side - 44, hairline + 18, cx - side + 86, shoulder), radius=58, fill=196)
        draw.rounded_rectangle((cx + side - 86, hairline + 18, cx + side + 44, shoulder), radius=58, fill=196)
    else:
        draw.rounded_rectangle((cx - side - 24, hairline + 16, cx - side + 72, shoulder - 80), radius=50, fill=180)
        draw.rounded_rectangle((cx + side - 72, hairline + 16, cx + side + 24, shoulder - 80), radius=50, fill=180)

    if lifestyle == "classic":
        draw.pieslice((cx - side + 42, top + 30, cx + side - 16, hairline + 118), 188, 354, fill=0)
    elif lifestyle == "modern":
        draw.polygon(
            [
                (cx - side + 20, hairline + 12),
                (cx - 25, top + 38),
                (cx + side - 4, hairline + 36),
                (cx + side - 15, hairline + 58),
                (cx - side + 4, hairline + 58),
            ],
            fill=0,
        )
    else:
        draw.polygon(
            [
                (cx - side + 6, hairline + 22),
                (cx - 4, top + 18),
                (cx + side + 18, hairline + 55),
                (cx + side - 24, hairline + 78),
                (cx - side + 18, hairline + 70),
            ],
            fill=0,
        )

    draw.rounded_rectangle((cx - int(width * 0.40), hairline + 8, cx + int(width * 0.40), h), radius=54, fill=0)

    if maintenance == "low":
        mask = mask.filter(ImageFilter.GaussianBlur(3.2))
    elif maintenance == "high":
        mask = mask.filter(ImageFilter.GaussianBlur(1.0))
    else:
        mask = mask.filter(ImageFilter.GaussianBlur(2.0))

    return mask


def create_look(source, length, maintenance, lifestyle, variant):
    image = source.copy().convert("RGBA")
    w, h = image.size
    cx = w // 2
    top = int(h * 0.165)
    hairline = int(h * 0.285)
    base_y = int(h * (0.42 if length == "short" else 0.64 if length == "medium" else 0.78))

    base, mid, light = palette_for(lifestyle, maintenance, variant)
    hair = Image.new("RGBA", image.size, (0, 0, 0, 0))
    hair_draw = ImageDraw.Draw(hair)

    for y in range(h):
        ratio = y / max(1, h)
        color = tuple(int(base[i] * (1 - ratio) + mid[i] * ratio) for i in range(3))
        hair_draw.line([(0, y), (w, y)], fill=(*color, 255))

    mask = hair_mask(image.size, length, lifestyle, maintenance, variant)
    hair.putalpha(mask)

    texture = Image.new("RGBA", image.size, (0, 0, 0, 0))
    texture_draw = ImageDraw.Draw(texture)
    draw_texture(texture_draw, cx, top, int(w * 0.52), base_y, light, 96 if maintenance == "high" else 66, variant)
    texture.putalpha(Image.composite(Image.new("L", image.size, 160), Image.new("L", image.size, 0), mask))

    combined = Image.alpha_composite(image, hair)
    combined = Image.alpha_composite(combined, texture)

    shine = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shine_draw = ImageDraw.Draw(shine)
    shine_draw.arc((cx - 190, top + 42, cx + 150, hairline + 70), 200, 332, fill=(*light, 94), width=5)
    if variant in {"structured", "signature"}:
        shine_draw.arc((cx - 120, top + 68, cx + 190, hairline + 118), 204, 326, fill=(*light, 76), width=4)
    combined = Image.alpha_composite(combined, shine)

    return combined.convert("RGB")


def portraitize(crop):
    target_w, target_h = 768, 960
    background = Image.new("RGB", (target_w, target_h), (216, 211, 204))
    fg = crop.copy()
    fg_w = target_w
    fg_h = round(fg.height * (fg_w / fg.width))
    fg = fg.resize((fg_w, fg_h), Image.Resampling.LANCZOS)
    paste_y = (target_h - fg_h) // 2
    background.paste(fg, (0, paste_y))
    return background


def generate_sofia_looks():
    if SOFIA_LOOKS_SHEET.exists():
        sheet = Image.open(SOFIA_LOOKS_SHEET).convert("RGB")
        width, height = sheet.size
        x_bounds = [0, round(width / 3), round(width * 2 / 3), width]
        y_bounds = [0, 298, 576, 842, height] if height == 1086 else [0, round(height * 0.274), round(height * 0.53), round(height * 0.775), height]
        for row, length in enumerate(LENGTHS):
            for col, lifestyle in enumerate(LIFESTYLES):
                left = x_bounds[col] + (3 if col else 0)
                top = y_bounds[row] + (3 if row else 0)
                right = x_bounds[col + 1] - 3
                bottom = y_bounds[row + 1] - 3
                crop = portraitize(sheet.crop((left, top, right, bottom)))
                for maintenance in MAINTENANCE:
                    for variant in VARIANTS:
                        filename = f"{length}-{maintenance}-{lifestyle}-{variant}.jpg"
                        crop.save(PUBLIC / "sofia" / "looks" / filename, quality=92, optimize=True)
        return

    source_path = PUBLIC / "sofia" / "source.png"
    source = Image.open(source_path).convert("RGB")
    source.thumbnail((768, 1152), Image.Resampling.LANCZOS)

    for length in LENGTHS:
        effective_length = "medium" if length == "any" else length
        for maintenance in MAINTENANCE:
            for lifestyle in LIFESTYLES:
                for variant in VARIANTS:
                    look = create_look(source, effective_length, maintenance, lifestyle, variant)
                    filename = f"{length}-{maintenance}-{lifestyle}-{variant}.jpg"
                    look.save(PUBLIC / "sofia" / "looks" / filename, quality=90, optimize=True)


def main():
    ensure_dirs()
    crop_contact_sheet()
    generate_sofia_looks()


if __name__ == "__main__":
    main()
