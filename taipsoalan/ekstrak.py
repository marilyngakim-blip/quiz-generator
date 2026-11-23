"""Input (PDF/DOC/DOCX) → imej halaman → Claude (vision) → JSON berstruktur.

Fungsi utama:
  sediakan_pdf(fail, kerja)        .doc/.docx → PDF (LibreOffice); PDF dikekalkan
  render_halaman(pdf, kerja, dpi)  PDF → PNG setiap muka surat (pdftoppm)
  ekstrak(imej, ...)               Claude → dict ikut skema (lihat skema.py)
"""
from __future__ import annotations

import base64
import glob
import io
import json
import os
import re
import shutil
import subprocess

from PIL import Image

import alat
import semak
from skema import PROMPT_SISTEM, normalkan

MODEL_LALAI = "claude-opus-5-5"


# ---- input ------------------------------------------------------------------

def sediakan_pdf(fail: str, kerja: str) -> str:
    os.makedirs(kerja, exist_ok=True)
    ext = os.path.splitext(fail)[1].lower()
    if ext == ".pdf":
        return fail
    if ext == ".doc":
        fail = semak.tukar(fail, "docx", kerja)  # .doc → .docx dahulu
        ext = ".docx"
    if ext in (".docx", ".odt", ".rtf"):
        return semak.tukar(fail, "pdf", kerja)
    raise ValueError(f"Jenis fail tidak disokong: {ext}")


def render_halaman(pdf: str, kerja: str, dpi: int = 170) -> list[str]:
    folder = os.path.join(kerja, "halaman")
    os.makedirs(folder, exist_ok=True)
    sedia = sorted(glob.glob(os.path.join(folder, "h-*.png")))
    if sedia and os.path.exists(os.path.join(folder, f".dpi{dpi}")):
        return sedia
    for f in glob.glob(os.path.join(folder, "*")):
        os.remove(f)
    subprocess.run([alat.wajib("pdftoppm"), "-png", "-r", str(dpi), pdf, os.path.join(folder, "h")],
                   check=True)
    open(os.path.join(folder, f".dpi{dpi}"), "w").close()
    fail = sorted(glob.glob(os.path.join(folder, "h-*.png")))
    for f in fail:  # simpan dpi dalam metadata (untuk saiz gambar_hiasan)
        Image.open(f).convert("RGB").save(f, dpi=(dpi, dpi))
    return fail


def _jpeg_b64(laluan: str, maks_px: int = 1900) -> str:
    """Kelabu + JPEG supaya muat had saiz permintaan (32 MB)."""
    im = Image.open(laluan).convert("L")
    if max(im.size) > maks_px:
        im.thumbnail((maks_px, maks_px))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=85)
    return base64.standard_b64encode(buf.getvalue()).decode()


# ---- Claude -----------------------------------------------------------------

def _hurai_json(teks: str) -> dict:
    teks = teks.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", teks, re.S)
    if m:
        teks = m.group(1)
    a, b = teks.find("{"), teks.rfind("}")
    if a < 0 or b < 0:
        raise ValueError("Tiada JSON dalam jawapan model")
    return json.loads(teks[a:b + 1])


def _panggil(client, model, kandungan, log, effort="high"):
    import anthropic

    kwargs = dict(
        model=model,
        max_tokens=64000,
        system=PROMPT_SISTEM,
        output_config={"effort": effort},
        messages=[{"role": "user", "content": kandungan}],
    )
    # Fallback pelayan jika model menolak (refusal) — hanya untuk model yang menyokongnya.
    if model.startswith(("claude-opus-5", "claude-sonnet-5-5", "claude-fable-5")):
        kwargs.update(betas=["server-side-fallback-2026-07-01"], fallbacks="default")
        ctx = client.beta.messages.stream(**kwargs)
    else:
        ctx = client.messages.stream(**kwargs)
    try:
        with ctx as stream:
            msg = stream.get_final_message()
    except anthropic.RateLimitError as e:
        raise RuntimeError(f"Had kadar API dicapai; cuba lagi sebentar ({e.message})") from e
    except anthropic.APIStatusError as e:
        raise RuntimeError(f"Ralat API {e.status_code}: {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise RuntimeError("Tidak dapat menghubungi API Claude (rangkaian)") from e
    if msg.stop_reason == "refusal":
        raise RuntimeError("Model menolak permintaan (refusal).")
    if msg.stop_reason == "max_tokens":
        log("  amaran: jawapan terpotong (max_tokens) — cuba --kumpulan lebih kecil")
    teks = "".join(b.text for b in msg.content if b.type == "text")
    u = msg.usage
    log(f"  token: masuk {u.input_tokens}, keluar {u.output_tokens}")
    return _hurai_json(teks)


def _gabung(utama: dict, baru: dict) -> dict:
    """Gabung hasil beberapa kumpulan halaman (soalan merentas sempadan digabung)."""
    if not utama:
        return baru
    utama.setdefault("tajuk", baru.get("tajuk"))
    for bh in baru.get("bahagian", []):
        sedia = next((x for x in utama["bahagian"] if x.get("nama") == bh.get("nama")), None)
        if sedia is None:
            if not bh.get("nama") and utama["bahagian"]:
                sedia = utama["bahagian"][-1]
            else:
                utama["bahagian"].append(bh)
                continue
        for k in ("markah", "arahan"):
            sedia.setdefault(k, bh.get(k))
        for s in bh.get("soalan", []):
            lama = next((x for x in sedia["soalan"] if str(x.get("no")) == str(s.get("no"))), None)
            if lama is None:
                sedia["soalan"].append(s)
                continue
            label_lama = {c.get("label") for c in lama.get("ceraian", [])}
            for c in s.get("ceraian", []):
                if c.get("label") not in label_lama:
                    lama.setdefault("ceraian", []).append(c)
            for k in ("rajah", "jadual"):
                lama.setdefault(k, [])
                lama[k] += [r for r in s.get(k, []) if r not in lama[k]]
    for k in ("pembetulan", "hilang"):
        utama.setdefault(k, [])
        utama[k] += [x for x in baru.get(k, []) if x not in utama[k]]
    return utama


def ekstrak(imej: list[str], model: str = MODEL_LALAI, kumpulan: int | None = None,
            log=print, effort: str = "high") -> dict:
    """Hantar imej halaman ke Claude dan pulangkan JSON yang telah dinormalkan."""
    import anthropic

    client = anthropic.Anthropic()
    n = len(imej)
    kumpulan = kumpulan or (n if n <= 20 else 12)
    hasil: dict = {}
    for mula in range(0, n, kumpulan):
        julat = range(mula, min(n, mula + kumpulan))
        log(f"Ekstrak halaman {julat.start + 1}–{julat.stop} daripada {n} ({model})...")
        kandungan = []
        for i in julat:
            kandungan.append({"type": "text", "text": f"Halaman {i + 1}:"})
            kandungan.append({"type": "image", "source": {
                "type": "base64", "media_type": "image/jpeg", "data": _jpeg_b64(imej[i])}})
        arahan = (f"Ini halaman {julat.start + 1} hingga {julat.stop} daripada {n} halaman "
                  "kertas soalan. Ekstrak kandungan ikut skema dan pulangkan JSON SAHAJA.")
        if hasil:
            akhir = hasil["bahagian"][-1]["soalan"][-1] if hasil.get("bahagian") and \
                hasil["bahagian"][-1].get("soalan") else None
            if akhir:
                labels = [c.get("label") for c in akhir.get("ceraian", [])]
                arahan += (f"\nKumpulan sebelum ini berakhir pada {hasil['bahagian'][-1]['nama']}, "
                           f"soalan {akhir.get('no')} (ceraian {labels}). Jika halaman pertama "
                           "menyambung soalan itu, gunakan nombor soalan yang sama dan hanya "
                           "sertakan ceraian baharu.")
        kandungan.append({"type": "text", "text": arahan})
        hasil = _gabung(hasil, _panggil(client, model, kandungan, log, effort))
    data, amaran = normalkan(hasil)
    for a in amaran:
        log(f"  amaran skema: {a}")
    return data


def simpan_json(data: dict, laluan: str):
    with open(laluan, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


def muat_json(laluan: str) -> dict:
    with open(laluan, encoding="utf-8") as f:
        return json.load(f)


def salin_input(fail: str, kerja: str) -> str:
    os.makedirs(kerja, exist_ok=True)
    dest = os.path.join(kerja, os.path.basename(fail))
    if os.path.abspath(dest) != os.path.abspath(fail):
        shutil.copy(fail, dest)
    return dest
