#!/usr/bin/env python3
"""Generate the portfolio's favicon and Open Graph share image.

Everything here is typographic on purpose: there is no photo of Odell on the
site, so the share card carries the name and the positioning line instead.

Usage:
    python tools/make-assets.py

Re-run this after the site moves off odell0111.github.io so the domain printed
on the share card stays correct (see SITE_LABEL below).
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# --- Configuration ----------------------------------------------------------

# Printed on the share card. Update when the portfolio gets its own domain.
SITE_LABEL = "odell0111.github.io"

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

W, H = 1200, 630

FONT_DIR = Path("C:/Windows/Fonts")
SANS_BOLD = FONT_DIR / "segoeuib.ttf"
SANS_REG = FONT_DIR / "segoeui.ttf"
MONO_REG = FONT_DIR / "consola.ttf"

# Palette, mirroring the CSS custom properties in styles/main.css.
BG = (11, 15, 23)
INK = (241, 245, 249)
MUTED = (148, 163, 184)
INDIGO = (99, 102, 241)
CYAN = (6, 182, 212)


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    """Load a TrueType font, falling back to Pillow's default if missing."""
    try:
        return ImageFont.truetype(str(path), size)
    except OSError:
        print(f"  ! {path.name} not found, using Pillow default", file=sys.stderr)
        return ImageFont.load_default(size)


def add_glow(
    base: Image.Image,
    centre: tuple[int, int],
    radius: int,
    colour: tuple[int, int, int],
    alpha: int,
) -> None:
    """Composite a soft radial bloom onto `base` (in place)."""
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    x, y = centre
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(*colour, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(radius / 2.2))
    base.alpha_composite(layer)


def build_og_image() -> Image.Image:
    card = Image.new("RGBA", (W, H), (*BG, 255))

    # Ambient blooms — the same indigo/cyan pairing the site uses.
    add_glow(card, (170, 90), 340, INDIGO, 88)
    add_glow(card, (1060, 560), 380, CYAN, 62)

    # Subtle centre lift so the type sits on something rather than flat colour.
    add_glow(card, (600, 315), 520, (30, 41, 59), 120)

    # Oversized ring echoing the favicon, to anchor the right side. Kept at low
    # contrast so it reads as texture and never competes with the type.
    ring = Image.new("RGBA", card.size, (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    cx, cy, r, stroke = 975, 305, 205, 18
    box = (cx - r, cy - r, cx + r, cy + r)
    rd.ellipse(box, outline=(*INDIGO, 46), width=stroke)
    rd.arc(box, start=-90, end=40, fill=(*CYAN, 120), width=stroke)
    card.alpha_composite(ring)

    draw = ImageDraw.Draw(card)
    margin = 88

    # Name.
    name_font = font(SANS_BOLD, 108)
    draw.text((margin, 150), "Odell", font=name_font, fill=INK)

    # Positioning line — the specific version, not "passionate programmer".
    role_font = font(SANS_BOLD, 40)
    draw.text(
        (margin, 288),
        "Software Developer",
        font=role_font,
        fill=INDIGO,
    )
    role2 = "Automation  ·  Systems Integration  ·  Reverse Engineering"
    draw.text((margin, 336), role2, font=font(SANS_REG, 30), fill=MUTED)

    # The line Odell asked to keep, set in mono so it reads as a terminal voice.
    quote_font = font(MONO_REG, 25)
    draw.text(
        (margin, 420),
        "I don't just consume APIs; I reverse engineer them.",
        font=quote_font,
        fill=CYAN,
    )

    # Hairline rule + domain. Stops short of the ring so the two don't collide.
    draw.line([(margin, 500), (730, 500)], fill=(51, 65, 85), width=2)
    draw.text((margin, 524), SITE_LABEL, font=font(MONO_REG, 26), fill=MUTED)

    return card.convert("RGB")


def build_favicon_png(size: int) -> Image.Image:
    """A font-independent 'O': a ring on a dark rounded square."""
    scale = 8  # supersample, then downscale for clean edges
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))

    # Rounded-square plate.
    plate = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    pd = ImageDraw.Draw(plate)
    pd.rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.22), fill=(*BG, 255))
    img.alpha_composite(plate)

    # Ring, drawn in indigo then overlaid with a cyan half to fake the gradient.
    ring = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    pad = s * 0.235
    width = int(s * 0.105)
    rd.ellipse((pad, pad, s - pad, s - pad), outline=(*INDIGO, 255), width=width)

    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).polygon([(0, 0), (s, 0), (0, s)], fill=255)
    ring.paste(Image.new("RGBA", (s, s), (*CYAN, 255)), (0, 0), mask)

    img.alpha_composite(ring)
    return img.resize((size, size), Image.LANCZOS)


def build_favicon_svg() -> str:
    return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Odell">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#06b6d4"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="#0b0f17"/>
  <circle cx="32" cy="32" r="15" fill="none" stroke="url(#g)" stroke-width="7"/>
</svg>
"""


def main() -> int:
    ASSETS.mkdir(parents=True, exist_ok=True)

    og = build_og_image()
    og_path = ASSETS / "og-image.png"
    og.save(og_path, "PNG", optimize=True)
    print(f"  wrote {og_path.relative_to(ROOT)}  ({og.width}x{og.height})")

    svg_path = ASSETS / "favicon.svg"
    svg_path.write_text(build_favicon_svg(), encoding="utf-8")
    print(f"  wrote {svg_path.relative_to(ROOT)}")

    for size, name in ((180, "favicon.png"), (32, "favicon-32.png")):
        icon = build_favicon_png(size)
        path = ASSETS / name
        icon.save(path, "PNG", optimize=True)
        print(f"  wrote {path.relative_to(ROOT)}  ({size}x{size})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
