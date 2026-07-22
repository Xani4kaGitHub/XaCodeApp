from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "installer-assets"

# Windows uses different icon sizes in the title bar, taskbar, shortcuts,
# notifications and the installer. A multi-size ICO prevents it from falling
# back to Electron's default icon at small resolutions.
app_icon = Image.open(ROOT / "xacode.png").convert("RGBA")
app_icon.save(
    OUT / "xacode.ico",
    format="ICO",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
