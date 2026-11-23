"""Perkataan + kedudukan bagi setiap halaman — offline.

  * PDF teks / DOCX → lapisan teks PDF (pdftotext -bbox), tepat dan pantas.
  * PDF imbasan     → Tesseract OCR (bahasa msa+eng), output TSV.
Semua koordinat dalam piksel imej halaman yang dirender (dpi sama).
"""
from __future__ import annotations

import csv
import functools
import html
import io
import re
import subprocess
from dataclasses import dataclass

import alat


@dataclass
class Perkataan:
    x0: float
    y0: float
    x1: float
    y1: float
    teks: str
    yakin: float = 100.0

    @property
    def cx(self):
        return (self.x0 + self.x1) / 2

    @property
    def cy(self):
        return (self.y0 + self.y1) / 2

    @property
    def h(self):
        return self.y1 - self.y0


@functools.lru_cache(maxsize=1)
def bahasa_ada() -> tuple[str, ...]:
    exe = alat.cari("tesseract")
    if not exe:
        return ()
    r = subprocess.run([exe, "--list-langs"], capture_output=True, text=True, errors="replace")
    baris = (r.stdout + r.stderr).splitlines()
    return tuple(b.strip() for b in baris[1:] if b.strip() and " " not in b.strip())


def ocr_imej(laluan_png: str, psm: int = 3) -> list[Perkataan]:
    exe = alat.wajib("tesseract")
    langs = [b for b in ("msa", "eng") if b in bahasa_ada()] or ["eng"]
    r = subprocess.run([exe, laluan_png, "-", "-l", "+".join(langs), "--psm", str(psm), "tsv"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise RuntimeError(f"Tesseract gagal: {r.stderr[-400:]}")
    out = []
    for row in csv.DictReader(io.StringIO(r.stdout), delimiter="\t", quoting=csv.QUOTE_NONE):
        t = (row.get("text") or "").strip()
        if not t or row.get("level") != "5":
            continue
        try:
            x, y, w, h = (int(row[k]) for k in ("left", "top", "width", "height"))
            c = float(row.get("conf", 0))
        except (TypeError, ValueError):
            continue
        out.append(Perkataan(x, y, x + w, y + h, t, c))
    return out


def ocr_lajur_nombor(laluan_png: str, x0: int, x1: int) -> list[Perkataan]:
    """OCR kedua untuk lajur nombor soalan (digit tunggal kerap terlepas pada OCR biasa).

    Cari jalur menegak yang ada dakwat dalam lajur kiri, kemudian OCR setiap tompok
    (dibesarkan, mod satu baris, digit sahaja).
    """
    import os
    import tempfile

    import numpy as np
    from PIL import Image

    im = Image.open(laluan_png).convert("L")
    x0, x1 = max(0, int(x0)), min(im.width, int(x1))
    if x1 - x0 < 10:
        return []
    a = np.asarray(im.crop((x0, 0, x1, im.height))) < 140
    ada = a.sum(axis=1) >= 2
    jalur, mula = [], None
    for y, v in enumerate(list(ada) + [False]):
        if v and mula is None:
            mula = y
        elif not v and mula is not None:
            if 8 <= y - mula <= 120:
                jalur.append((mula, y))
            mula = None
    exe = alat.wajib("tesseract")
    out = []
    with tempfile.TemporaryDirectory() as d:
        for k, (ya, yb) in enumerate(jalur[:40]):
            kol = np.where(a[ya:yb].any(axis=0))[0]
            xa, xb = int(kol.min()), int(kol.max()) + 1
            m = 12
            potong = im.crop((x0 + xa - m, ya - m, x0 + xb + m, yb + m))
            potong = potong.resize((potong.width * 2, potong.height * 2))
            p = os.path.join(d, f"n{k}.png")
            potong.save(p)
            r = subprocess.run([exe, p, "-", "--psm", "7", "-c",
                                "tessedit_char_whitelist=0123456789"],
                               capture_output=True, text=True, encoding="utf-8", errors="replace")
            t = r.stdout.strip()
            if re.fullmatch(r"\d{1,2}", t):
                out.append(Perkataan(x0 + xa, ya, x0 + xb, yb, t, 90.0))
    return out


_HAL = re.compile(r'<page width="([\d.]+)" height="([\d.]+)">(.*?)</page>', re.S)
_PKT = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>',
                  re.S)


def lapisan_teks(pdf: str, dpi: int) -> list[list[Perkataan]]:
    """Perkataan daripada lapisan teks PDF (kosong bagi halaman imbasan)."""
    r = subprocess.run([alat.wajib("pdftotext"), "-bbox", "-enc", "UTF-8", pdf, "-"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    halaman = []
    k = dpi / 72.0
    for m in _HAL.finditer(r.stdout):
        hal = []
        for w in _PKT.finditer(m.group(3)):
            x0, y0, x1, y1 = (float(w.group(i)) * k for i in range(1, 5))
            hal.append(Perkataan(x0, y0, x1, y1, html.unescape(w.group(5))))
        halaman.append(hal)
    return halaman


def perkataan_halaman(pdf: str, imej: list[str], dpi: int, log=print,
                      paksa_ocr: bool = False) -> tuple[list[list[Perkataan]], list[str]]:
    """Pulang (perkataan setiap halaman, kaedah setiap halaman: 'teks' / 'ocr')."""
    lapisan = [] if paksa_ocr else lapisan_teks(pdf, dpi)
    semua, kaedah = [], []
    for i, png in enumerate(imej):
        hal = lapisan[i] if i < len(lapisan) else []
        if len("".join(p.teks for p in hal)) >= 40:
            semua.append(hal)
            kaedah.append("teks")
        else:
            log(f"  OCR halaman {i + 1}/{len(imej)}...")
            semua.append(ocr_imej(png))
            kaedah.append("ocr")
    return semua, kaedah
