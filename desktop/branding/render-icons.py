"""Regenerate checked-in icons from app-icon.svg with rsvg-convert and Pillow."""

from io import BytesIO
from pathlib import Path
from subprocess import check_output

from PIL import Image

HERE = Path(__file__).resolve().parent
SVG = HERE / "app-icon.svg"
STORE_LOGOS = {
    44: "Square44x44Logo.png",
    50: "StoreLogo.png",
    150: "Square150x150Logo.png",
}


def render(size):
    return check_output(["rsvg-convert", "-w", str(size), "-h", str(size), str(SVG)])


def main():
    resolutions = (16, 24, 32, 48, 64, 128, 256, 512, 1024)
    images = {
        size: Image.open(BytesIO(render(size))).convert("RGBA")
        for size in resolutions
    }
    # Supply explicitly rasterized frames so small sizes stay sharp.
    images[1024].save(
        HERE / "SecurityScanHub.icns",
        append_images=[images[size] for size in (32, 64, 128, 256, 512)],
    )
    images[256].save(
        HERE / "app-icon.ico",
        sizes=[(size, size) for size in resolutions if size <= 256],
        append_images=[images[size] for size in resolutions if size < 256],
    )
    for size, filename in STORE_LOGOS.items():
        (HERE / filename).write_bytes(render(size))


if __name__ == "__main__":
    main()
