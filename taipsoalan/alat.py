"""Cari program luar (LibreOffice, Poppler, Tesseract) — Windows, macOS dan Linux.

Di Windows, program ini selalunya tidak berada dalam PATH, jadi lokasi pemasangan
biasa (termasuk pakej winget) turut dicari. Boleh juga ditetapkan melalui
pemboleh ubah persekitaran: TAIPSOALAN_SOFFICE, TAIPSOALAN_POPPLER (folder bin),
TAIPSOALAN_TESSERACT.
"""
from __future__ import annotations

import functools
import glob
import os
import shutil
import sys

WINDOWS = sys.platform.startswith("win")


def _calon_windows(nama: str) -> list[str]:
    pf = [os.environ.get(k, "") for k in ("ProgramFiles", "ProgramFiles(x86)", "ProgramW6432")]
    pf = [p for p in pf if p] or [r"C:\Program Files", r"C:\Program Files (x86)"]
    lapp = os.environ.get("LOCALAPPDATA", "")
    corak = []
    if nama == "soffice":
        corak += [os.path.join(p, "LibreOffice", "program", "soffice.exe") for p in pf]
    elif nama == "tesseract":
        corak += [os.path.join(p, "Tesseract-OCR", "tesseract.exe") for p in pf]
        corak += [os.path.join(lapp, "Programs", "Tesseract-OCR", "tesseract.exe")]
    else:  # poppler: pdftoppm, pdfinfo, pdftotext
        exe = nama + ".exe"
        corak += [os.path.join(lapp, "Microsoft", "WinGet", "Packages", "*oppler*", "**", exe)]
        corak += [os.path.join(p, "*oppler*", "**", exe) for p in pf]
        corak += [os.path.join("C:\\", "*oppler*", "**", exe)]
        corak += [os.path.join(os.path.expanduser("~"), "*oppler*", "**", exe)]
    hasil = []
    for c in corak:
        hasil += sorted(glob.glob(c, recursive=True), reverse=True)
    return hasil


@functools.lru_cache(maxsize=None)
def cari(nama: str) -> str | None:
    env = {"soffice": "TAIPSOALAN_SOFFICE", "tesseract": "TAIPSOALAN_TESSERACT"}.get(nama)
    if env and os.environ.get(env) and os.path.exists(os.environ[env]):
        return os.environ[env]
    if nama in ("pdftoppm", "pdfinfo", "pdftotext") and os.environ.get("TAIPSOALAN_POPPLER"):
        p = os.path.join(os.environ["TAIPSOALAN_POPPLER"], nama + (".exe" if WINDOWS else ""))
        if os.path.exists(p):
            return p
    for n in ([nama, "libreoffice"] if nama == "soffice" else [nama]):
        p = shutil.which(n)
        if p:
            return p
    if WINDOWS:
        c = _calon_windows(nama)
        if c:
            return c[0]
    if sys.platform == "darwin" and nama == "soffice":
        p = "/Applications/LibreOffice.app/Contents/MacOS/soffice"
        if os.path.exists(p):
            return p
    return None


PANDUAN = {
    "soffice": "LibreOffice (https://www.libreoffice.org) — Windows: winget install "
               "TheDocumentFoundation.LibreOffice",
    "pdftoppm": "Poppler — Windows: winget install oschwartz10612.Poppler",
    "pdfinfo": "Poppler — Windows: winget install oschwartz10612.Poppler",
    "pdftotext": "Poppler — Windows: winget install oschwartz10612.Poppler",
    "tesseract": "Tesseract OCR — Windows: winget install UB-Mannheim.TesseractOCR "
                 "(tandakan bahasa 'Malay' semasa pemasangan)",
}


def wajib(nama: str) -> str:
    p = cari(nama)
    if not p:
        raise RuntimeError(f"Program '{nama}' tidak dijumpai. Pasang: {PANDUAN.get(nama, nama)}")
    return p


def semak_semua(perlu_ocr: bool = True) -> list[str]:
    """Pulang senarai masalah pemasangan (kosong = semua ada)."""
    masalah = []
    senarai = ["soffice", "pdftoppm", "pdfinfo", "pdftotext"] + (["tesseract"] if perlu_ocr else [])
    for n in senarai:
        if not cari(n):
            masalah.append(f"{n} tiada — {PANDUAN[n]}")
    if perlu_ocr and cari("tesseract"):
        from ocr import bahasa_ada
        if "msa" not in bahasa_ada():
            masalah.append("Tesseract tiada bahasa Melayu (msa) — pasang semula dan tandakan "
                           "'Malay', atau salin msa.traineddata ke folder tessdata")
    return masalah
