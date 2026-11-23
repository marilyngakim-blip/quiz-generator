"""gambar_hiasan — potong gambar terus dari imej halaman asal.

{"jenis": "gambar_hiasan", "halaman": 3, "kotak": [0.12, 0.40, 0.55, 0.62],
 "lebar_cm": 6, "ambang": 175}
kotak = [x0, y0, x1, y1] sebagai pecahan (0–1) lebar/tinggi halaman, dari bucu kiri atas.
Imej ditukar ke skala kelabu; piksel > ambang diputihkan (latar bersih untuk fotostat).
"""
from PIL import Image, ImageOps



def lukis(spec, laluan, imej_halaman=None, **_):
    if not imej_halaman:
        raise ValueError("gambar_hiasan memerlukan imej halaman asal")
    h = int(spec.get("halaman", 1))
    if not (1 <= h <= len(imej_halaman)):
        raise ValueError(f"halaman {h} tiada")
    im = Image.open(imej_halaman[h - 1])
    W, H = im.size
    x0, y0, x1, y1 = spec.get("kotak", [0, 0, 1, 1])
    if max(x0, y0, x1, y1) > 1.0001:  # piksel
        kotak = (int(x0), int(y0), int(x1), int(y1))
    else:
        kotak = (int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H))
    g = ImageOps.grayscale(im.crop(kotak))
    ambang = int(spec.get("ambang", 175))
    g = g.point(lambda p: 255 if p > ambang else p)
    g = g.convert("RGB")
    dpi_asal = float(spec.get("dpi_asal", im.info.get("dpi", (170, 170))[0] or 170))
    g.save(laluan, dpi=(dpi_asal, dpi_asal))
    lebar_cm = float(spec.get("lebar_cm", g.width / dpi_asal * 2.54))
    return lebar_cm, lebar_cm * g.height / g.width
