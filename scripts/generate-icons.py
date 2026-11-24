"""Generate My Money's app icon set (replaces the Expo template icons).

    python scripts/generate-icons.py

Mark: a white wallet with a mint card tucked behind it, on the brand's deep evergreen.
Drawn at 4x and downsampled for clean edges. Colors match src/ui/theme.ts (hero / primary).
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent / 'assets' / 'images'
HERO = (12, 59, 49, 255)      # tokens.hero  #0C3B31
MINT = (69, 201, 161, 255)    # dark primary #45C9A1
WHITE = (255, 255, 255, 255)
SS = 4                        # supersampling factor


def rounded(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def draw_mark(size, mark_scale, *, card=MINT, body=WHITE, clasp=HERO, dot=MINT, monochrome=False):
    """Draw the wallet mark centered on a transparent canvas of `size` px.

    `mark_scale` is the mark's width as a fraction of the canvas.
    """
    s = size * SS
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    w = s * mark_scale            # mark width
    x0 = (s - w) / 2
    y0 = (s - w * 0.86) / 2       # mark is a little shorter than wide
    u = w / 100                   # 1 unit = 1% of mark width

    # Card peeking out behind the wallet.
    rounded(d, (x0 + 9 * u, y0, x0 + 81 * u, y0 + 34 * u), 9 * u, WHITE if monochrome else card)
    if monochrome:
        # Gap so the card reads as a separate shape in a single color.
        rounded(d, (x0 - 2 * u, y0 + 17 * u, x0 + 102 * u, y0 + 23 * u), 0, (0, 0, 0, 0))
    # Wallet body.
    rounded(d, (x0, y0 + 20 * u, x0 + 100 * u, y0 + 86 * u), 14 * u, body)
    # Clasp tab and its coin.
    if monochrome:
        rounded(d, (x0 + 62 * u, y0 + 42 * u, x0 + 100 * u, y0 + 64 * u), 11 * u, (0, 0, 0, 0))
        cx, cy, r = x0 + 75 * u, y0 + 53 * u, 5 * u
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=WHITE)
    else:
        rounded(d, (x0 + 62 * u, y0 + 42 * u, x0 + 100 * u, y0 + 64 * u), 11 * u, clasp)
        cx, cy, r = x0 + 75 * u, y0 + 53 * u, 5 * u
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=dot)
    return img.resize((size, size), Image.LANCZOS)


def solid(size, color):
    return Image.new('RGBA', (size, size), color)


def full_icon(size, rounded_corners=False):
    s = size * SS
    base = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    if rounded_corners:
        d.rounded_rectangle((0, 0, s - 1, s - 1), radius=s * 0.22, fill=HERO)
    else:
        d.rectangle((0, 0, s, s), fill=HERO)
    base = base.resize((size, size), Image.LANCZOS)
    base.alpha_composite(draw_mark(size, 0.56))
    return base


def main():
    full_icon(1024).save(ROOT / 'icon.png')
    full_icon(48, rounded_corners=True).save(ROOT / 'favicon.png')
    # Adaptive icon: the launcher masks to ~66% of the canvas, so keep the mark inside it.
    draw_mark(512, 0.46).save(ROOT / 'android-icon-foreground.png')
    solid(512, HERO).save(ROOT / 'android-icon-background.png')
    draw_mark(432, 0.46, monochrome=True).save(ROOT / 'android-icon-monochrome.png')
    # Splash: mark only; the background color comes from app.config.ts.
    draw_mark(512, 0.9).save(ROOT / 'splash-icon.png')
    print('icons written to', ROOT)


if __name__ == '__main__':
    main()
