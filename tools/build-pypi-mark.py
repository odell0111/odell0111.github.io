#!/usr/bin/env python3
"""
Turn the vendor `assets/PyPI.svg` into the grayscale `#i-pypi` symbol.

    python tools/build-pypi-mark.py

Writes `assets/pypi-mark.svg`, which is pasted into the icon sprite in
`index.html`. Re-run it if the vendor file is ever replaced.

Why this exists at all
----------------------
`assets/PyPI.svg` is an Inkscape export of the real PyPI logo: 114 paths, each
carrying a ~700-character `style` attribute, wrapped in 21 groups. Inline as
shipped it is 53 KB, which is not a reasonable price for a 16-pixel icon.

Two things had to change to use it here:

1. **Size.** Every transform in the file is `translate(...)scale(...)`, and
   every path command is a move, a line or a close -- no curves, no arcs. That
   means a uniform scale plus a translate can be baked straight into the
   coordinates, and 4,770 characters of transform go with them.

2. **Colour.** The logo is a two-material isometric object -- a blue shape and a
   yellow one -- sitting on a near-white "ghost" grid. Matching the original by
   luminance alone would collapse the blue and the yellow into the same gray,
   and at the size this renders at that contrast is the *only* thing that
   survives: the mark would read as one undifferentiated blob. So the mapping
   keeps the lightness order of the original (ghost lightest, then yellow, then
   blue darkest) and expresses it as opacity over `currentColor`. The mark then
   follows whatever colour and theme it is dropped into, which a baked-in gray
   could not do -- a fixed mid-gray works on the light theme and disappears on
   the dark one.

Eleven fills reach this script. Three (#e9e9ff, #afafde, #353564) are dropped
because they paint nothing in the original -- see DROP. One (#fff) is painted as
the page rather than as ink -- see PAGE. One (#a29d86) is the group default and
never appears as a fill at all. The remaining six become opacities, and they are
solved against the backdrop each face actually sits on rather than against a
white page -- see OPACITY, which is where both traps are written down.

What comes out is 57 paths and 2 circles instead of 114 and 21 groups, and the
result renders within 1.7/255 of the original per face at 658px, with no pixel
differing by more than 128. The residual is the vendor file's `#ccc` hairline
stroke, which is not carried over: it is 0.073 units wide against a 65.8-unit
viewBox, so it is 0.02px at the size this ships at and would do nothing but
break the mark's currentColor.
"""

import re
import xml.etree.ElementTree as ET
from pathlib import Path

NS = "{http://www.w3.org/2000/svg}"
ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "PyPI.svg"
OUT = ROOT / "assets" / "pypi-mark.svg"

# fill -> opacity of currentColor.
#
# The target for each face is whatever a plain `filter: grayscale(1)` of the
# original gives it -- the usual 0.2126R + 0.7152G + 0.0722B on the 0-255
# values -- and the ink is the link accent #4f46e5, whose own weighted value is
# 83.4. Over a flat white page that would be a = (255 - target) / 171.6.
#
# These are not those numbers. The faces sit on top of one another, so a face
# composites over whatever was painted under it, not over the page: the ghost's
# left face lands on the page but the blue cube's right face lands on a ghost
# face. Solving against a white page leaves every stacked face 5-9/255 too
# dark, which is small but measurable and in the same direction for all of
# them. So each value below was solved against its own *measured* backdrop --
# render, read what is actually behind that fill, solve
# a' = a + (target - result) / (ink - backdrop), re-render. The backdrops are a
# property of the artwork, not of the render size, so this does not overfit to
# any particular zoom.
#
# Two traps, both hit on the way here:
#
# * Solve in *encoded sRGB*, not linear light. That is the space alpha
#   compositing actually happens in. Solving in linear light gives the blue
#   (target 111) an opacity of 0.95, which renders near-black and collapses the
#   whole mark into one mass with the yellow nowhere to stand.
# * Do not assume the order of the ramps. Per material it is right face
#   lightest, then top, then left -- the ghost runs #f7f7f4 / #efeeea, and the
#   blue and yellow cubes shade the same way. Get it backwards and the ghost's
#   shading contradicts the cubes it sits behind.
OPACITY = {
    "#f7f7f4": 0.046,  # ghost top      (brightest face in the original)
    "#efeeea": 0.093,  # ghost left
    "#ffd242": 0.215,  # yellow right
    "#ffc91d": 0.270,  # yellow top
    "#3775a9": 0.813,  # blue right     (the logo's dominant mass)
    "#2f6491": 0.919,  # blue top
    "#a29d86": 0.500,  # group default — never used as a fill, so never painted
}

# Fills painted as the page rather than as ink.
#
# #fff is the ghost cubes' right faces and the two specular dots. It cannot be
# an opacity: at a=0 it is invisible instead of white, and it has to be
# *lighter* than its backdrop, which compositing ink can never be. It also does
# real work in the original -- it occludes the dark back faces behind it -- so
# dropping it is not neutral either.
#
# Painting it in the surface colour does both jobs: it reads white on the light
# theme, reads as the page on the dark one, and covers what is behind it. The
# property is set alongside the icon rather than baked in, so it is one line to
# move if the mark is ever used on a different surface.
PAGE = {"#fff"}

# Fills dropped outright rather than mapped to an opacity.
#
# These are the back and bottom faces of the ghost cubes. In the original they
# are opaque and hidden behind the faces in front, so they never show -- but
# they only stay hidden because the faces covering them are *also* opaque. Here
# the covering faces are 5-10% alpha, so an opaque face behind one shows
# straight through it and the whole ghost grid goes dark. Mapping them to a low
# opacity instead does not help: they would still be painted, and the point is
# that they must not be.
#
# Dropping them was measured, not assumed. Rendering the vendor file with each
# one's fill removed changes the image by a mean of 0.0004/255 over 12 pixels,
# every one of them antialiasing at an edge -- they are genuinely covered. (The
# docstring above used to claim the same of #fff. That one is false: removing
# #fff moves 21,099 pixels, so it is kept and mapped like anything else.)
DROP = {"#e9e9ff", "#afafde", "#353564"}

TRANSFORM = re.compile(
    r"translate\(\s*([-\d.eE]+)[\s,]+([-\d.eE]+)\s*\)\s*scale\(\s*([-\d.eE]+)\s*\)"
)
NUM = re.compile(r"[A-Za-z]|-?\d*\.?\d+(?:[eE][-+]?\d+)?")


def parse_uniform(transform):
    """(scale, tx, ty) for translate(...)scale(...), or None if it is not one."""
    m = TRANSFORM.fullmatch(transform.strip())
    if not m:
        return None
    tx, ty, s = (float(g) for g in m.groups())
    return s, tx, ty


def absolutise(d, s, tx, ty):
    """Bake translate + uniform scale into the coordinates.

    Only moves, lines and closes appear in this file, so relative deltas scale
    by `s` and absolute points scale and shift. Starting from the transformed
    origin is what makes the relative commands come out right: a relative move
    from an already-transformed point stays correct, because a delta is
    unaffected by the translation.
    """
    tokens = NUM.findall(d)
    out = []
    x, y = tx, ty
    cmd = None
    first_pair = True
    i = 0
    while i < len(tokens):
        if tokens[i].isalpha():
            cmd = tokens[i]
            i += 1
            first_pair = True
            if cmd in "zZ":
                out.append("Z")
                continue
        if cmd is None:
            raise ValueError("path data begins without a command")
        n = 1 if cmd in "vVhH" else 2
        if i + n > len(tokens):
            raise ValueError(f"truncated path data near {tokens[i:i + n]}")
        vals = [float(v) for v in tokens[i:i + n]]
        i += n

        rel = cmd.islower()
        if cmd in "vV":
            y = y + vals[0] * s if rel else vals[0] * s + ty
        elif cmd in "hH":
            x = x + vals[0] * s if rel else vals[0] * s + tx
        elif cmd in "lLmM":
            dx, dy = vals
            if rel:
                x, y = x + dx * s, y + dy * s
            else:
                x, y = dx * s + tx, dy * s + ty
        else:
            raise ValueError("unexpected path command " + cmd)

        # After the first pair a moveto behaves as a lineto.
        out.append(f"{'M' if cmd in 'mM' and first_pair else 'L'}{x:.2f} {y:.2f}")
        first_pair = False
    return "".join(out)


def paint(colour):
    """The paint attribute for a fill: page colour, or ink at an opacity."""
    if colour in PAGE:
        return 'fill="var(--pypi-page,#fff)"'
    return f'fill-opacity="{OPACITY[colour]}"'


def main():
    tree = ET.parse(SRC)
    root = tree.getroot()

    # Finished markup, in document order. Paths and circles go in the same list
    # because the order between them is load-bearing too -- the specular dots
    # sit on top of the cubes, so hoisting them to the end would paint them
    # under the faces they are highlights on.
    ordered = []
    used = set()
    dropped = set()
    seen = 0
    n_circles = 0

    def walk(el, chain):
        nonlocal seen, n_circles, used
        for child in el:
            tag = child.tag.replace(NS, "")
            tr = child.get("transform")
            if tag == "g":
                walk(child, chain + ([tr] if tr else []))
            elif tag == "path":
                style = child.get("style") or ""
                found = re.search(r"fill:(#[0-9a-fA-F]{3,6})", style)
                if not found:
                    raise ValueError("path with no fill: " + style[:60])
                colour = found.group(1).lower()
                if colour in DROP:
                    dropped.add(colour)
                    continue
                if colour not in OPACITY and colour not in PAGE:
                    raise ValueError("unmapped fill " + colour)
                if colour in OPACITY:
                    used.add(OPACITY[colour])
                # Innermost first. A transform list applies the element's own
                # transform before its parent's, so the chain has to be walked
                # back out to the root -- composing it outermost-first gives the
                # translations the wrong scale and throws paths off-canvas.
                scale, tx, ty = 1.0, 0.0, 0.0
                for t in ([tr] if tr else []) + list(reversed(chain)):
                    parsed = parse_uniform(t)
                    if parsed is None:
                        raise ValueError("non-uniform transform on a path: " + t)
                    s, dx, dy = parsed
                    scale, tx, ty = scale * s, tx * s + dx, ty * s + dy
                ordered.append(
                    f'  <path {paint(colour)}'
                    f' d="{absolutise(child.get("d"), scale, tx, ty)}"/>'
                )
                seen += 1
            elif tag == "circle":
                style = child.get("style") or ""
                colour = re.search(r"fill:(#[0-9a-fA-F]{3,6})", style).group(1).lower()
                if colour in DROP:
                    dropped.add(colour)
                    continue
                # Kept as a circle: its own transform is scale+skew, which is
                # not uniform, so its geometry cannot be baked the way a
                # path's can. `transform` on the element still applies, and so
                # do the ancestor groups' -- they are re-emitted around it.
                ordered.append(
                    f'  <g {paint(colour)}'
                    f' transform="{" ".join(chain)}">'
                    f'<circle cx="{child.get("cx")}" cy="{child.get("cy")}"'
                    f' r="{child.get("r")}"'
                    f' transform="{child.get("transform")}"/></g>'
                )
                n_circles += 1
            else:
                raise ValueError("unexpected element " + tag)

    walk(root, [])

    # Two things this must not do, both of which look like tidyings:
    #
    # 1. Don't sort the elements by opacity. The cubes overlap -- every back
    #    face is covered by a front one -- so the order they are painted in is
    #    what decides which face is visible. Bucketing them into one group per
    #    opacity paints the densest fills last, on top of everything, and the
    #    whole mark collapses into a single opaque slab. `ordered` is in
    #    document order and is emitted untouched.
    #
    # 2. Don't concatenate elements into one `d`. The faces overlap and the
    #    nonzero fill rule cancels subpaths that wind in opposite directions,
    #    which punches a hole straight through the middle of the mark. Separate
    #    elements each fill on their own, exactly as they did in the original.
    #
    # Per element rather than per group because the six faces of a cube are
    # siblings with six different fills -- every opacity here is one element
    # wide, so there is nothing for grouping to merge.
    parts = ordered

    symbol = (
        '<symbol id="i-pypi" viewBox="0 0 65.812 58" fill="currentColor">\n'
        + "\n".join(parts)
        + "\n</symbol>\n"
    )
    OUT.write_text(
        "<!-- Generated from PyPI.svg by tools/build-pypi-mark.py — do not "
        "hand-edit.\n     The paths are flattened into viewBox space and the "
        "fills replaced with\n     opacity over currentColor. -->\n" + symbol,
        encoding="utf-8",
    )

    print(f"  flattened  {seen} paths, {n_circles} circles kept")
    print(f"  dropped    {len(dropped)} of {len(DROP)} known-invisible fills")
    print(f"  opacities  {sorted(used)}")
    unused = sorted(set(OPACITY.values()) - used)
    if unused:
        print(f"  unused     {unused}  (mapped but never painted)")
    print(f"  wrote      {OUT.relative_to(ROOT)}  ({len(symbol):,} bytes)")


if __name__ == "__main__":
    main()
