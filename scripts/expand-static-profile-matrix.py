import argparse
import importlib.util
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public" / "demo-profiles"

LENGTHS = ("short", "medium", "long", "any")
MAINTENANCE = ("low", "medium", "high")
LIFESTYLES = ("classic", "modern", "bold")

LENGTH_EFFECT = {
    "short": {"zoom": 1.035, "shift_y": 0.0, "sharp": 1.04},
    "medium": {"zoom": 1.0, "shift_y": -0.018, "sharp": 1.0},
    "long": {"zoom": 0.965, "shift_y": -0.035, "sharp": 0.98},
    "any": {"zoom": 0.992, "shift_y": -0.012, "sharp": 1.02},
}

MAINTENANCE_EFFECT = {
    "low": {"contrast": 0.98, "brightness": 0.985, "color": 0.98, "sharp": 0.96, "blur": 0.18},
    "medium": {"contrast": 1.03, "brightness": 1.015, "color": 1.02, "sharp": 1.06, "blur": 0.0},
    "high": {"contrast": 1.08, "brightness": 1.035, "color": 1.04, "sharp": 1.16, "blur": 0.0},
}

LIFESTYLE_EFFECT = {
    "classic": {"contrast": 1.0, "brightness": 1.0, "color": 0.98, "shift_x": 0.0},
    "modern": {"contrast": 1.04, "brightness": 1.02, "color": 1.02, "shift_x": 0.012},
    "bold": {"contrast": 1.1, "brightness": 1.0, "color": 1.08, "shift_x": -0.015},
}

VARIANT_OFFSETS = {
    0: {"zoom": 1.0, "shift_x": -0.006, "shift_y": 0.0, "rotate": -0.25},
    1: {"zoom": 0.985, "shift_x": 0.012, "shift_y": -0.008, "rotate": 0.35},
    2: {"zoom": 1.012, "shift_x": -0.012, "shift_y": 0.008, "rotate": -0.45},
    3: {"zoom": 0.972, "shift_x": 0.018, "shift_y": -0.014, "rotate": 0.5},
}


def load_slicer():
    spec = importlib.util.spec_from_file_location(
        "slice_profile_boards",
        ROOT / "scripts" / "slice-profile-boards.py",
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SLICER = load_slicer()


def resize_cover(image, size, center=(0.5, 0.5)):
    target_w, target_h = size
    width, height = image.size
    scale = max(target_w / width, target_h / height)
    resized = image.resize((round(width * scale), round(height * scale)), Image.Resampling.LANCZOS)
    max_left = max(0, resized.width - target_w)
    max_top = max(0, resized.height - target_h)
    left = round(max_left * center[0])
    top = round(max_top * center[1])
    return resized.crop((left, top, left + target_w, top + target_h))


def choose_seed(profile_dir, profile, length, lifestyle):
    board_dir = profile_dir / "combination-boards"
    preferred = [
        board_dir / f"{length}-low-{lifestyle}.png",
        board_dir / f"short-low-{lifestyle}.png",
    ]
    if profile == "marc":
        preferred += [
            board_dir / "short-low-modern.png",
            board_dir / "short-low-classic.png",
        ]
    else:
        preferred += [
            board_dir / "short-low-classic.png",
        ]

    for path in preferred:
        if path.exists():
            return path

    raise FileNotFoundError(f"No seed board found for {profile}")


def sam_palette(lifestyle, maintenance, col):
    palettes = {
        "classic": ((42, 28, 18), (82, 55, 35), (126, 88, 55)),
        "modern": ((30, 23, 20), (72, 50, 34), (150, 103, 60)),
        "bold": ((24, 19, 20), (70, 45, 36), (178, 108, 61)),
    }
    base, mid, light = palettes[lifestyle]
    if maintenance == "low":
        mid = tuple(max(0, value - 7) for value in mid)
        light = tuple(max(0, value - 12) for value in light)
    elif maintenance == "high":
        mid = tuple(min(255, value + 10) for value in mid)
        light = tuple(min(255, value + 18) for value in light)
    if col == 1:
        light = tuple(min(255, value + 10) for value in light)
    elif col == 3:
        base = tuple(max(0, value - 8) for value in base)
        light = tuple(min(255, value + 20) for value in light)
    return base, mid, light


def sam_mask(cell_size, length, maintenance, lifestyle, col, row):
    width, height = cell_size
    mask = Image.new("L", cell_size, 0)
    draw = ImageDraw.Draw(mask)
    blur = {"low": 4.2, "medium": 2.4, "high": 1.2}[maintenance]
    depth = {
        "short": 0.39,
        "medium": 0.48,
        "long": 0.63,
        "any": 0.52,
    }[length]
    volume = {
        "classic": 0.0,
        "modern": 0.035,
        "bold": 0.06,
    }[lifestyle] + (0.025 if col in (1, 3) else 0.0)

    if row == 0:
        top = round(height * 0.055)
        left = round(width * (0.17 - volume))
        right = round(width * (0.86 + volume))
        bottom = round(height * (0.33 + volume * 0.55))
        draw.ellipse((left, top, right, bottom), fill=205)

        side_bottom = round(height * depth)
        side_width = round(width * (0.10 + volume))
        draw.rounded_rectangle(
            (left + round(width * 0.02), round(height * 0.20), left + side_width, side_bottom),
            radius=round(width * 0.09),
            fill=170,
        )
        draw.rounded_rectangle(
            (right - side_width, round(height * 0.20), right - round(width * 0.02), side_bottom),
            radius=round(width * 0.09),
            fill=170,
        )

        if lifestyle == "classic":
            draw.polygon(
                [
                    (round(width * 0.30), round(height * 0.21)),
                    (round(width * 0.52), round(height * 0.15)),
                    (round(width * 0.79), round(height * 0.24)),
                    (round(width * 0.68), round(height * 0.29)),
                    (round(width * 0.36), round(height * 0.28)),
                ],
                fill=0,
            )
        elif lifestyle == "modern":
            draw.polygon(
                [
                    (round(width * 0.22), round(height * 0.24)),
                    (round(width * 0.58), round(height * 0.12)),
                    (round(width * 0.88), round(height * 0.26)),
                    (round(width * 0.72), round(height * 0.31)),
                    (round(width * 0.27), round(height * 0.30)),
                ],
                fill=55,
            )
        else:
            for offset in (-0.22, -0.08, 0.08, 0.22):
                x = round(width * (0.52 + offset))
                draw.polygon(
                    [
                        (x - round(width * 0.08), round(height * 0.21)),
                        (x + round(width * 0.02), round(height * 0.08)),
                        (x + round(width * 0.12), round(height * 0.23)),
                    ],
                    fill=180,
                )

    elif row in (1, 2):
        faces_left = row == 1
        back = 0.61 if faces_left else 0.39
        front = 0.32 if faces_left else 0.68
        top = round(height * 0.065)
        bottom = round(height * depth)
        draw.ellipse(
            (
                round(width * (min(front, back) - 0.16 - volume)),
                top,
                round(width * (max(front, back) + 0.24 + volume)),
                round(height * (0.38 + volume)),
            ),
            fill=200,
        )
        nape_left = round(width * (back - (0.02 if faces_left else 0.24) - volume))
        nape_right = round(width * (back + (0.24 if faces_left else 0.02) + volume))
        draw.rounded_rectangle(
            (min(nape_left, nape_right), round(height * 0.20), max(nape_left, nape_right), bottom),
            radius=round(width * 0.12),
            fill=168,
        )
        if lifestyle == "bold":
            spike_direction = 1 if faces_left else -1
            for i in range(5):
                x = round(width * (back - 0.18 + i * 0.07))
                draw.polygon(
                    [
                        (x, round(height * 0.17)),
                        (x + spike_direction * round(width * 0.08), round(height * 0.07)),
                        (x + round(width * 0.11), round(height * 0.22)),
                    ],
                    fill=178,
                )
        elif lifestyle == "modern":
            sweep = 1 if faces_left else -1
            draw.polygon(
                [
                    (round(width * back), round(height * 0.10)),
                    (round(width * (back + sweep * 0.22)), round(height * 0.17)),
                    (round(width * (back + sweep * 0.10)), round(height * 0.28)),
                    (round(width * (back - sweep * 0.16)), round(height * 0.25)),
                ],
                fill=70,
            )

    else:
        top = round(height * 0.055)
        bottom = round(height * depth)
        left = round(width * (0.19 - volume))
        right = round(width * (0.82 + volume))
        draw.ellipse((left, top, right, round(height * 0.39)), fill=210)
        draw.rounded_rectangle(
            (left + round(width * 0.03), round(height * 0.23), right - round(width * 0.03), bottom),
            radius=round(width * 0.16),
            fill=176,
        )
        if length == "short":
            draw.rounded_rectangle(
                (round(width * 0.30), round(height * 0.40), round(width * 0.70), round(height * 0.57)),
                radius=round(width * 0.10),
                fill=0,
            )
        if lifestyle == "bold":
            for offset in (-0.24, -0.10, 0.06, 0.22):
                x = round(width * (0.52 + offset))
                draw.polygon(
                    [
                        (x - round(width * 0.07), round(height * 0.20)),
                        (x + round(width * 0.02), round(height * 0.07)),
                        (x + round(width * 0.10), round(height * 0.23)),
                    ],
                    fill=180,
                )

    return mask.filter(ImageFilter.GaussianBlur(blur))


def apply_sam_distinction(cell, length, maintenance, lifestyle, col, row):
    width, height = cell.size
    base, mid, light = sam_palette(lifestyle, maintenance, col)
    mask = sam_mask(cell.size, length, maintenance, lifestyle, col, row)

    hair = Image.new("RGBA", cell.size, (0, 0, 0, 0))
    hair_draw = ImageDraw.Draw(hair)
    for y in range(height):
        ratio = y / max(1, height - 1)
        color = tuple(round(base[i] * (1 - ratio) + mid[i] * ratio) for i in range(3))
        hair_draw.line((0, y, width, y), fill=(*color, 138))
    hair.putalpha(mask.point(lambda value: round(value * 0.76)))

    texture = Image.new("RGBA", cell.size, (0, 0, 0, 0))
    texture_draw = ImageDraw.Draw(texture)
    strand_alpha = {"low": 42, "medium": 62, "high": 86}[maintenance]
    sweep = -1 if lifestyle == "classic" else 1 if lifestyle == "modern" else 0
    for index in range(10):
        x0 = round(width * (0.20 + index * 0.065))
        x1 = x0 + round(width * (0.10 + 0.02 * (col % 2)))
        if row in (1, 2):
            x1 += round(width * (0.14 if row == 1 else -0.14))
        y0 = round(height * (0.10 + (index % 3) * 0.018))
        y1 = round(height * (0.30 + {"short": 0.03, "medium": 0.12, "long": 0.22, "any": 0.15}[length]))
        mid_x = round((x0 + x1) / 2 + width * 0.07 * sweep)
        texture_draw.line(
            [(x0, y0), (mid_x, round((y0 + y1) / 2)), (x1, y1)],
            fill=(*light, strand_alpha),
            width=3 if lifestyle == "bold" or maintenance == "high" else 2,
            joint="curve",
        )

    texture.putalpha(Image.composite(Image.new("L", cell.size, 150), Image.new("L", cell.size, 0), mask))
    combined = Image.alpha_composite(cell.convert("RGBA"), hair)
    combined = Image.alpha_composite(combined, texture)
    return combined.convert("RGB")


def transformed_cell(cell, profile, length, maintenance, lifestyle, col, row):
    length_effect = LENGTH_EFFECT[length]
    maintenance_effect = MAINTENANCE_EFFECT[maintenance]
    lifestyle_effect = LIFESTYLE_EFFECT[lifestyle]
    variant = VARIANT_OFFSETS[col]

    width, height = cell.size
    zoom = length_effect["zoom"] * variant["zoom"]
    crop_w = min(width, max(16, round(width / zoom)))
    crop_h = min(height, max(16, round(height / zoom)))

    center_x = 0.5 + lifestyle_effect["shift_x"] + variant["shift_x"]
    center_y = 0.5 + length_effect["shift_y"] + variant["shift_y"]
    if row == 3:
        center_y += 0.012
    center_x = max(0.08, min(0.92, center_x))
    center_y = max(0.08, min(0.92, center_y))

    left = round((width - crop_w) * center_x)
    top = round((height - crop_h) * center_y)
    working = cell.crop((left, top, left + crop_w, top + crop_h)).resize((width, height), Image.Resampling.LANCZOS)

    rotate = variant["rotate"]
    if row in (1, 2):
        rotate *= -1
    if rotate:
        working = working.rotate(
            rotate,
            resample=Image.Resampling.BICUBIC,
            expand=False,
            fillcolor=(210, 206, 200),
        )

    working = ImageEnhance.Contrast(working).enhance(maintenance_effect["contrast"] * lifestyle_effect["contrast"])
    working = ImageEnhance.Brightness(working).enhance(maintenance_effect["brightness"] * lifestyle_effect["brightness"])
    working = ImageEnhance.Color(working).enhance(maintenance_effect["color"] * lifestyle_effect["color"])
    working = ImageEnhance.Sharpness(working).enhance(
        maintenance_effect["sharp"] * length_effect["sharp"]
    )

    if maintenance_effect["blur"]:
        working = working.filter(ImageFilter.GaussianBlur(maintenance_effect["blur"]))

    if profile == "sam":
        working = apply_sam_distinction(working, length, maintenance, lifestyle, col, row)

    return working


def generate_profile(profile, force):
    profile_dir = PUBLIC / profile
    board_dir = profile_dir / "combination-boards"
    board_dir.mkdir(parents=True, exist_ok=True)
    source_boards = {}
    for length in LENGTHS:
        for lifestyle in LIFESTYLES:
            seed_path = choose_seed(profile_dir, profile, length, lifestyle)
            source_boards[(length, lifestyle)] = Image.open(seed_path).convert("RGB")

    generated = []
    kept = []
    for length in LENGTHS:
        for maintenance in MAINTENANCE:
            for lifestyle in LIFESTYLES:
                output = board_dir / f"{length}-{maintenance}-{lifestyle}.png"
                if output.exists() and not force:
                    kept.append(output.name)
                    continue

                image = source_boards[(length, lifestyle)].copy()
                boxes = SLICER.cell_boxes(image)
                board = image.copy()

                for row in range(4):
                    for col in range(4):
                        box = boxes[row][col]
                        left, top, right, bottom = box
                        cell = image.crop(box)
                        board.paste(
                            transformed_cell(cell, profile, length, maintenance, lifestyle, col, row),
                            (left, top),
                        )

                board.save(output, optimize=True)
                generated.append(output.name)

    print(f"{profile}: generated {len(generated)}, kept {len(kept)}")
    if generated:
        print("generated:")
        for name in generated:
            print(f"  - {name}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("profiles", nargs="+", choices=("marc", "sam"))
    parser.add_argument("--force", action="store_true", help="regenerate existing boards too")
    args = parser.parse_args()

    for profile in args.profiles:
        generate_profile(profile, args.force)


if __name__ == "__main__":
    main()
