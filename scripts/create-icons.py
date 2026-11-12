"""Regenerate original geometric icons. Optional authoring tool; not needed to build."""
from pathlib import Path
from PIL import Image, ImageDraw

destination = Path(__file__).resolve().parents[1] / "hub/public/icons"
destination.mkdir(parents=True, exist_ok=True)
for size in (192, 512):
    image = Image.new("RGB", (512, 512), "#225b43")
    draw = ImageDraw.Draw(image)
    draw.ellipse((95, 125, 365, 405), fill="#f9f5e9")
    draw.polygon([(112, 225), (80, 190), (144, 175), (145, 113), (193, 147), (239, 85), (265, 150), (333, 110), (330, 179), (381, 187), (346, 230)], fill="#f9f5e9")
    draw.ellipse((232, 226, 421, 382), fill="#edb184")
    draw.ellipse((337, 269, 352, 289), fill="#233d32")
    draw.ellipse((396, 298, 432, 330), fill="#233d32")
    draw.ellipse((320, 310, 355, 330), fill="#db8262")
    draw.ellipse((161, 377, 218, 399), fill="#edb184")
    draw.ellipse((302, 373, 359, 395), fill="#edb184")
    image.resize((size, size), Image.Resampling.LANCZOS).save(destination / f"icon-{size}.png")
