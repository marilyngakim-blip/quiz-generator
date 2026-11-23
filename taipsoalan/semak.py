"""Semakan akhir: PDF, kiraan muka surat, contact sheet, semakan automatik, laporan."""
from __future__ import annotations

import glob
import math
import os
import re
import shutil
import subprocess
import tempfile

from PIL import Image, ImageDraw

_PROFIL_LO = os.path.join(os.path.expanduser("~"), ".cache", "taipsoalan", "lo_profil")


def soffice() -> str:
    for n in ("soffice", "libreoffice"):
        if shutil.which(n):
            return n
    raise RuntimeError("LibreOffice (soffice) tidak dijumpai")


def lo_ada_math() -> bool:
    """Modul Math LibreOffice diperlukan untuk memaparkan persamaan OMML dalam PDF."""
    try:
        exe = os.path.realpath(shutil.which(soffice()))
    except RuntimeError:
        return False
    prog = os.path.dirname(exe)
    return bool(glob.glob(os.path.join(prog, "libsmlo.so")) or glob.glob(
        os.path.join(prog, "*sm*.dll")) or glob.glob(os.path.join(prog, "..", "Frameworks",
                                                                   "libsmlo.dylib")))


def tukar(fail: str, format_: str, folder: str) -> str:
    """Tukar fail dengan LibreOffice headless. Pulang laluan fail keluaran."""
    os.makedirs(folder, exist_ok=True)
    os.makedirs(_PROFIL_LO, exist_ok=True)
    cmd = [soffice(), f"-env:UserInstallation=file://{_PROFIL_LO}", "--headless",
           "--convert-to", format_, "--outdir", folder, fail]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    asas = os.path.splitext(os.path.basename(fail))[0]
    ext = format_.split(":")[0]
    keluar = os.path.join(folder, f"{asas}.{ext}")
    if not os.path.exists(keluar):
        raise RuntimeError(f"Penukaran gagal: {r.stderr or r.stdout}")
    return keluar


def ke_pdf(docx: str, folder: str | None = None) -> str:
    return tukar(docx, "pdf", folder or os.path.dirname(os.path.abspath(docx)))


def kira_muka(pdf: str) -> int:
    out = subprocess.run(["pdfinfo", pdf], capture_output=True, text=True, check=True).stdout
    return int(re.search(r"^Pages:\s+(\d+)", out, re.M).group(1))


def teks_halaman(pdf: str) -> list[str]:
    out = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True,
                         check=True).stdout
    hal = out.split("\f")
    if hal and not hal[-1].strip():
        hal = hal[:-1]
    return hal


def render(pdf: str, folder: str, dpi: int, awalan: str = "h") -> list[str]:
    os.makedirs(folder, exist_ok=True)
    for f in glob.glob(os.path.join(folder, f"{awalan}-*.png")):
        os.remove(f)
    subprocess.run(["pdftoppm", "-png", "-r", str(dpi), pdf, os.path.join(folder, awalan)],
                   check=True)
    return sorted(glob.glob(os.path.join(folder, f"{awalan}-*.png")))


def contact_sheet(pdf: str, keluar: str, dpi: int = 30, lajur: int = 5) -> str:
    """Semua muka surat sebagai imej kecil dalam satu helaian, bernombor."""
    with tempfile.TemporaryDirectory() as d:
        fail = render(pdf, d, dpi)
        ims = [Image.open(f).convert("RGB") for f in fail]
        w = max(i.width for i in ims)
        h = max(i.height for i in ims)
        baris = math.ceil(len(ims) / lajur)
        pad = 12
        kanvas = Image.new("RGB", (lajur * (w + pad) + pad, baris * (h + pad + 18) + pad), "#d0d0d0")
        dr = ImageDraw.Draw(kanvas)
        for k, im in enumerate(ims):
            x = pad + (k % lajur) * (w + pad)
            y = pad + (k // lajur) * (h + pad + 18)
            kanvas.paste(im, (x, y + 18))
            dr.rectangle([x - 1, y + 17, x + im.width, y + 18 + im.height], outline="black")
            dr.text((x + 2, y + 2), f"{k + 1}", fill="black")
        kanvas.save(keluar)
    return keluar


def dua_sehelai(pdf: str, folder: str, dpi: int = 55) -> list[str]:
    """Render 2 muka surat sebelah-menyebelah (~55 dpi) — semak nombor masih terbaca
    bila dicetak 2 muka surat sehelai."""
    os.makedirs(folder, exist_ok=True)
    keluar = []
    with tempfile.TemporaryDirectory() as d:
        fail = render(pdf, d, dpi)
        for i in range(0, len(fail), 2):
            a = Image.open(fail[i]).convert("RGB")
            b = Image.open(fail[i + 1]).convert("RGB") if i + 1 < len(fail) else Image.new(
                "RGB", a.size, "white")
            k = Image.new("RGB", (a.width + b.width + 6, max(a.height, b.height)), "#888")
            k.paste(a, (0, 0))
            k.paste(b, (a.width + 6, 0))
            f = os.path.join(folder, f"helaian_{i // 2 + 1:02d}.png")
            k.save(f)
            keluar.append(f)
    return keluar


def _normal(s: str) -> str:
    return re.sub(r"[\s   ]+", "", s).replace("−", "-").lower()


def semak_auto(pdf: str, manifest: dict | None = None, sasaran: int | None = None) -> list[str]:
    """Semakan automatik. Pulang senarai isu (kosong = lulus)."""
    isu = []
    hal = teks_halaman(pdf)
    n = len(hal)
    if sasaran and n != sasaran:
        isu.append(f"Jumlah muka surat {n}, sasaran {sasaran}.")
    # [x markah] di atas muka surat tanpa soalannya
    for i, t in enumerate(hal[1:], start=2):
        baris = [b.strip() for b in t.splitlines() if b.strip()]
        if baris and re.fullmatch(r"\[\s*\d+(\.\d+)?\s*markah\s*\]", baris[0]):
            isu.append(f"Muka surat {i}: '{baris[0]}' terpisah daripada soalannya (di atas halaman).")
        if baris and re.fullmatch(r"Jawapan\s*:", baris[0]):
            isu.append(f"Muka surat {i}: 'Jawapan:' bermula di atas halaman tanpa soalan.")
    # jadual terpecah: sel pertama & terakhir mesti pada muka surat sama
    if manifest:
        norm = [_normal(t) for t in hal]
        for j in manifest.get("jadual", []):
            a, b = _normal(j["pertama"]), _normal(j["akhir"])
            if len(a) < 2 or len(b) < 1:
                continue
            ha = [k for k, t in enumerate(norm) if a in t]
            hb = [k for k, t in enumerate(norm) if b in t]
            if ha and hb and not any(x in hb for x in ha):
                isu.append(f"Jadual '{j.get('kapsyen') or j['pertama']}' mungkin terpecah antara "
                           f"muka surat {ha[0] + 1} dan {hb[0] + 1}.")
    # halaman kosong (kecuali halaman kertas graf yang disisip)
    kosong = [i for i, t in enumerate(hal, start=1) if len(t.strip()) <= 3]
    if len(kosong) > (manifest or {}).get("kertas_graf_disisip", 0):
        for i in kosong:
            isu.append(f"Muka surat {i} tiada teks (kertas graf/rajah sahaja atau halaman kosong).")
    return isu


def laporan(laluan: str, *, pdf: str, data: dict, manifest: dict, isu: list[str],
            sasaran: int | None = None, faktor: dict | None = None,
            nota_sasaran: str | None = None) -> str:
    n = kira_muka(pdf)
    b = ["# Laporan TaipSoalan", "",
         f"- Fail PDF: `{os.path.basename(pdf)}`",
         f"- Jumlah muka surat: **{n}**" + (f" (sasaran {sasaran})" if sasaran else "")]
    if faktor:
        b.append(f"- Faktor ruang jawapan: {faktor.get('ruang', 1):.2f}; "
                 f"faktor rajah: {faktor.get('rajah', 1):.2f}")
    if nota_sasaran:
        b.append(f"- Sasaran muka surat: {nota_sasaran}")
    bil_soalan = sum(len(x.get("soalan", [])) for x in data.get("bahagian", []))
    b += [f"- Bilangan bahagian: {len(data.get('bahagian', []))}; bilangan soalan: {bil_soalan}", ""]
    b += ["## Semakan markah", ""]
    for bh in data.get("bahagian", []):
        per_soalan = [_jumlah_markah(s) for s in bh.get("soalan", [])]
        pilih_satu = re.search(r"satu\b", teks_arahan(bh.get("arahan")), re.I)
        jumlah = max(per_soalan, default=0) if pilih_satu else sum(per_soalan)
        nyata = bh.get("markah")
        tanda = ""
        if nyata and abs(float(nyata) - jumlah) > 1e-9:
            tanda = " ⚠ TIDAK SEPADAN"
        jenis = "markah soalan terbesar (jawab satu)" if pilih_satu else "jumlah ceraian"
        b.append(f"- {bh.get('nama')}: markah dinyatakan {nyata}, {jenis} {jumlah:g}{tanda}")
    b += ["", "## Pembetulan taip", ""]
    b += [f"- {p}" for p in data.get("pembetulan", [])] or ["- (tiada)"]
    b += ["", "## Bahagian yang hilang / tidak disertakan", ""]
    hilang = list(data.get("hilang", []))
    for x in manifest.get("kertas_graf_tidak_disisip", []):
        hilang.append(f"Kertas graf untuk {x} tidak disertakan (hanya nota 'Jawab pada kertas graf').")
    hilang += _nombor_lompat(data)
    b += [f"- {h}" for h in hilang] or ["- (tiada dikesan)"]
    b += ["", "## Semakan automatik", ""]
    b += [f"- ⚠ {i}" for i in isu] or ["- ✓ Tiada jadual terpecah, tiada '[x markah]' terpisah, "
                                      "jumlah muka surat betul."]
    if manifest.get("amaran"):
        b += ["", "## Amaran semasa membina", ""] + [f"- {a}" for a in manifest["amaran"]]
    teks = "\n".join(b) + "\n"
    with open(laluan, "w", encoding="utf-8") as f:
        f.write(teks)
    return teks


def teks_arahan(a) -> str:
    from teks import teks_biasa
    return teks_biasa(a or "")


def _jumlah_markah(node) -> float:
    c = node.get("ceraian") or []
    if c:
        return sum(_jumlah_markah(x) for x in c)
    try:
        return float(node.get("markah") or 0)
    except (TypeError, ValueError):
        return 0.0


def _nombor_lompat(data) -> list[str]:
    no = []
    for bh in data.get("bahagian", []):
        for s in bh.get("soalan", []):
            try:
                no.append(int(s.get("no")))
            except (TypeError, ValueError):
                pass
    out = []
    for a, b in zip(no, no[1:]):
        if b > a + 1:
            out.append(f"Soalan {a + 1}–{b - 1} tiada dalam hasil ekstrak.")
    return out
