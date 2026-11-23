"""Ekstrak OFFLINE & PERCUMA: PDF (imbasan atau teks) / DOC / DOCX → JSON skema TaipSoalan.

Langkah:
  1. Perkataan + kedudukan: lapisan teks PDF, atau Tesseract OCR (msa+eng) untuk imbasan.
  2. Kawasan rajah: dakwat yang bukan teks dikumpul → kotak rajah (gambar_hiasan,
     dipotong & dibersihkan dari halaman asal; guru boleh tukar kepada rajah dilukis semula).
  3. Perkataan → baris (ikut kedudukan menegak), buang pengepala/pengaki & Bahasa Inggeris.
  4. Struktur: Bahagian → nombor soalan → (a) → (i), "[x markah]", "Jawapan:", kapsyen.
Hasil perlu disemak guru (Streamlit) — OCR boleh tersilap pada persamaan.
"""
from __future__ import annotations

import re
from collections import deque
from dataclasses import dataclass, field

import numpy as np
from PIL import Image

from ocr import Perkataan, ocr_lajur_nombor, perkataan_halaman
from skema import normalkan

# ---- kosa kata untuk mengesan Bahasa Inggeris --------------------------------------
ENG = set("""the of and is are in find calculate state shows show diagram table answer answers
questions question given value values which that this graph graphs using use draw each section
marks mark all complete following space provided determine hence on at to an by from with its it
for be has have there their what how many number shortest distance degree vertex vertices
equation point points line lines straight area probability chosen randomly student students
shaded region sets coordinates coordinate image under transformation describe fully reflection
rotation translation enlargement solve inverse speed time minimum maximum axis between two three
only not both same total mean mode interquartile frequency shown below above represent represents
hours minutes weighted network tree tables diagrams paper write your answers working shade
complete calculate whose where when then than form express simplest given shows find answer
road roads towns town cities city spanning weight weights least travelled car cars moves move
moving uniform rate period seconds second length width height volume angle angles circle
radius diameter respectively if into such smallest largest her his she he they them you
was were will would can could should must may so as or but no yes do does did done paid pay pays
every month months year years annual policy insured insurance life face states allocation claim
medical hospital cost costs treatment compensation company admitted covered under owner bought
purchased buys buy sells sold price discount profit loss interest saving savings loan rate
tax income expenses expenditure budget person people man woman boy girl friend friends school
class teacher pupils marks calculated nearest decimal places significant figures correct
represent graph scale vertical horizontal according based shown complete completes construct
plot plots straight curve value values its own other another first second third last next
following figure figures given answer""".split())
MSA = set("""yang dan ialah di bagi nilai hitung cari nyatakan rajah jadual menunjukkan jawab
semua soalan dalam bahagian ini itu pada dengan daripada kepada untuk tentukan lukis lengkapkan
persamaan titik garis lurus graf kebarangkalian murid jarak masa laju koordinat imej penjelmaan
huraikan selengkapnya pantulan putaran translasi pembesaran selesaikan matriks songsang paksi
simetri antara dua tiga hanya tidak sama jumlah julat kekerapan ditunjukkan bawah atas mewakili
jam minit adalah sebuah seorang satu setiap berikut ruang jawapan disediakan markah apabila jika
diberi ke dari oleh akan boleh hendaklah gunakan guna skala kertas luas isi padu sudut segi empat
bulatan jejari diameter terpendek darjah bucu pokok rentas berpemberat bandar jalan raya kereta
bergerak seragam tempoh saat panjang lebar tinggi isipadu lorek set semesta kumpulan kelab
lelaki perempuan dipilih secara rawak kedua-dua pertama kedua plot kotak mod median kuartil
buku dibaca sebulan ketaksamaan linear wakilkan nombor memuaskan sesuai anda persilangan pintasan
minimum maksimum simetri fungsi kuadratik kubik ceraian menggunakan bahawa iaitu maka nyata""".split())
ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"]

ABAI = [r"^SULIT\b", r"^\d{4}\s*/\s*\d", r"Lihat\s+(halaman|sebelah)", r"See\s+next\s+page",
        r"HALAMAN\s+KOSONG", r"BLANK\s+PAGE", r"Kegunaan\s+Pemeriksa", r"Examiner'?s?\s+Use",
        r"^\[?\s*Lihat", r"^©", r"Hak\s+Cipta", r"^KERTAS\s+(TAMAT|SOALAN\s+TAMAT)",
        r"END\s+OF\s+(QUESTION\s+)?PAPER", r"^\W{1,3}$"]
HALAMAN_ABAI = [r"MAKLUMAT\s+UNTUK\s+CALON", r"INFORMATION\s+FOR\s+CANDIDATES",
                r"JANGAN\s+BUKA", r"RUMUS\s+MATEMATIK", r"MATHEMATICAL\s+FORMULA",
                r"Arahan\s+Kepada\s+Calon", r"Nama\s*:?.*Tingkatan"]
RE_MARKAH = re.compile(r"[\[(]\s*(\d{1,2})\s*mar[kh]\w*\s*[\])]", re.I)
RE_MARKAH_ENG = re.compile(r"[\[(]\s*\d{1,2}\s*marks?\s*[\])]", re.I)
RE_KAPSYEN = re.compile(r"^(Rajah|Jadual)\s*(\d{1,2}(\.\d)?)\s*$", re.I)
RE_LABEL = re.compile(r"^\(\s*([a-hA-H]|i{1,3}|iv|vi{0,3}|ix|x)\s*\)\s*")
RE_BAHAGIAN = re.compile(r"^Bahagian\s+([A-C])\b", re.I)
RE_JAWAPAN = re.compile(r"^(Jawapan|Answer)\s*(/\s*Answer)?\s*[:;.]?\s*$", re.I)


@dataclass
class Baris:
    perkataan: list
    y0: float = 0
    y1: float = 0
    x0: float = 0
    x1: float = 0
    yakin_rendah: int = 0
    teks: str = ""
    condong: bool = False

    def kemas(self):
        self.perkataan.sort(key=lambda p: p.x0)
        self.y0 = min(p.y0 for p in self.perkataan)
        self.y1 = max(p.y1 for p in self.perkataan)
        self.x0 = min(p.x0 for p in self.perkataan)
        self.x1 = max(p.x1 for p in self.perkataan)
        self.teks = " ".join(p.teks for p in self.perkataan)
        self.yakin_rendah = sum(1 for p in self.perkataan if p.yakin < 60)
        return self


@dataclass
class Kawasan:
    x0: int
    y0: int
    x1: int
    y1: int
    kapsyen: str = ""
    perkataan: list = field(default_factory=list)


# ---- 1. kawasan rajah ------------------------------------------------------------

def kawasan_rajah(png: str, perkataan: list[Perkataan], dpi: int,
                  zon: tuple[float, float] = (0.0, 1.0)) -> list[Kawasan]:
    im = np.asarray(Image.open(png).convert("L"))
    H, W = im.shape
    dakwat = im < 150
    dakwat[:int(zon[0] * H)] = False   # pengepala
    dakwat[int(zon[1] * H):] = False   # pengaki & tera air
    cm = dpi / 2.54
    # padam teks berkeyakinan tinggi (huruf); label kecil dalam graf tinggal sebagai dakwat lemah
    for p in perkataan:
        if _sampah(p.teks):   # titik/bulatan rajah yang dibaca OCR sebagai "e", "@"
            continue
        if p.yakin >= 30 and p.h < 0.8 * cm:
            dakwat[max(0, int(p.y0) - 2):int(p.y1) + 2, max(0, int(p.x0) - 2):int(p.x1) + 2] = False
    B = max(4, dpi // 25)  # sel ~1 mm
    gh, gw = H // B, W // B
    g = dakwat[:gh * B, :gw * B].reshape(gh, B, gw, B).sum(axis=(1, 3)) >= 2
    r = max(1, round(0.3 * cm / B))  # sambung bahagian rajah yang berdekatan (~3 mm)
    gd = g.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            gd |= np.roll(np.roll(g, dy, axis=0), dx, axis=1)
    dilihat = np.zeros_like(gd)
    hasil = []
    for y in range(gh):
        for x in range(gw):
            if not gd[y, x] or dilihat[y, x]:
                continue
            q = deque([(y, x)])
            dilihat[y, x] = True
            ys, xs = [y, y], [x, x]
            while q:
                cy, cx = q.popleft()
                ys[0], ys[1] = min(ys[0], cy), max(ys[1], cy)
                xs[0], xs[1] = min(xs[0], cx), max(xs[1], cx)
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < gh and 0 <= nx < gw and gd[ny, nx] and not dilihat[ny, nx]:
                        dilihat[ny, nx] = True
                        q.append((ny, nx))
            x0, x1 = (xs[0] + r) * B, (xs[1] - r + 1) * B
            y0, y1 = (ys[0] + r) * B, (ys[1] - r + 1) * B
            w, h = x1 - x0, y1 - y0
            kecil_tengah = (w >= 0.7 * cm and h >= 0.9 * cm and w < 5 * cm
                            and abs((x0 + x1) / 2 - W / 2) < 0.2 * W)
            if (w < 2.0 * cm or h < (0.6 * cm if w >= 5 * cm else 1.2 * cm)) and not kecil_tengah:
                continue  # (rajah lebar & rendah dibenarkan: garis nombor)
            if w > 0.95 * W and h > 0.9 * H:  # bingkai halaman
                continue
            if w > 0.6 * W and h > 0.6 * H:   # kertas graf saiz penuh (dijana semula)
                continue
            ketumpatan = dakwat[y0:y1, x0:x1].mean()
            if ketumpatan < 0.002:
                continue
            k_ = Kawasan(x0, y0, x1, y1)
            if kecil_tengah and (w < 2.0 * cm or h < 1.2 * cm):
                k_.persamaan = True   # vektor/pecahan papar yang tidak dibaca OCR
                k_.teks = ""
            hasil.append(k_)
    # perkataan di dalam / bersebelahan kawasan = label rajah
    kapsyen_y = [(p.y0, p.y1) for p in perkataan
                 if re.fullmatch(r"(Rajah|Jadual|Diagram|Table)", p.teks, re.I)]
    # perkataan dalam baris teks panjang (ayat soalan) tidak boleh diserap dari luar kawasan
    bil_baris = {}
    for b in jadikan_baris(list(perkataan)):
        for q in b.perkataan:
            bil_baris[id(q)] = len(b.perkataan)
    for k in hasil:
        m = 0.6 * cm
        for _ulang in range(4):  # ulang: kawasan membesar apabila label diserap
            sebelum = (k.x0, k.y0, k.x1, k.y1)
            for p in perkataan:
                if any(p is q for q in k.perkataan):
                    continue
                if any(min(a1, p.y1) - max(a0, p.y0) > 0 for a0, a1 in kapsyen_y) and not (
                        k.x0 <= p.cx <= k.x1 and k.y0 <= p.cy <= k.y1 - 0.3 * cm):
                    continue  # baris kapsyen "Rajah 3" bukan sebahagian rajah
                dalam = k.x0 <= p.cx <= k.x1 and k.y0 <= p.cy <= k.y1
                if not dalam and bil_baris.get(id(p), 1) > 3:
                    continue
                if not dalam and re.match(r"^(Jawapan|Answer|\[|\(\d|\(?[a-h]\)|Rajah|Jadual)",
                                          p.teks, re.I):
                    continue
                sisi = k.y0 <= p.cy <= k.y1 and (k.x0 - 1.2 * cm <= p.cx <= k.x1 + 1.2 * cm)
                dekat = k.x0 - m <= p.cx <= k.x1 + m and k.y0 - m <= p.cy <= k.y1 + m
                bawah = k.x0 <= p.cx <= k.x1 and k.y1 <= p.cy <= k.y1 + m
                if dekat or sisi:
                    if dalam or sisi or bawah or len(p.teks) <= 8:
                        k.perkataan.append(p)
                        k.x0, k.y0 = min(k.x0, int(p.x0)), min(k.y0, int(p.y0))
                        k.x1, k.y1 = max(k.x1, int(p.x1)), max(k.y1, int(p.y1))
            if (k.x0, k.y0, k.x1, k.y1) == sebelum:
                break
    return hasil


# ---- 2. baris ----------------------------------------------------------------------

def jadikan_baris(perkataan: list[Perkataan]) -> list[Baris]:
    baris: list[Baris] = []
    for p in sorted(perkataan, key=lambda p: p.cy):
        terbaik, skor = None, 0.0
        for b in baris[-6:]:
            y0 = min(q.y0 for q in b.perkataan)
            y1 = max(q.y1 for q in b.perkataan)
            tindih = min(y1, p.y1) - max(y0, p.y0)
            s = tindih / max(1, min(p.h, y1 - y0))
            if s > 0.45 and s > skor:
                terbaik, skor = b, s
        if terbaik:
            terbaik.perkataan.append(p)
        else:
            baris.append(Baris([p]))
    return sorted((b.kemas() for b in baris), key=lambda b: b.y0)


# ---- 3. pembersihan teks -------------------------------------------------------------

def _perkataan(teks):
    return re.findall(r"[A-Za-z][A-Za-z'-]+", teks.lower())


def bahasa_inggeris(teks: str, condong: bool = False) -> bool:
    if condong:
        w = _perkataan(teks)
        m = sum(1 for x in w if x in MSA)
        e = sum(1 for x in w if x in ENG)
        if not (m >= 2 and m > e + 1):
            return True
    if re.match(r"^\s*(Diagram|Table|Section|Answer|Question)s?\b", teks, re.I):
        return True
    if RE_MARKAH_ENG.fullmatch(teks.strip()):
        return True
    w = _perkataan(teks)
    e = sum(1 for x in w if x in ENG)
    m = sum(1 for x in w if x in MSA)
    if e >= 2 and e > m:
        return True
    return e >= 2 and m == 0 and len(w) <= 3


def baiki_ocr(t: str) -> str:
    t = t.replace("—", "−").replace("–", "−")
    t = re.sub(r"\s-\s", " − ", t)
    t = re.sub(r"(?<=\s)-(?=\d)", "−", t)
    t = re.sub(r"\b([a-z])\?(?=[\s,.)=+−-]|$)", r"\1²", t)   # x? → x² (superskrip hilang)
    t = re.sub(r"\b([a-z])°(?=[\s,.)=+−]|$)", r"\1²", t)
    t = re.sub(r"\b([a-z])([23])(?=\s*[−+=<>)]|\s*$|[.,;])",
               lambda m: m.group(1) + {"2": "²", "3": "³"}[m.group(2)], t)   # x3 → x³
    t = t.replace("§", "ξ")
    t = re.sub(r"(?<=\d)[Oo](?=\d)", "0", t)
    t = re.sub(r"(?<=[A-Z′')])\s*[nN]\s*(?=[A-Z(])", " ∩ ", t)   # PnQ → P ∩ Q
    t = re.sub(r"(?<=[A-Z′')])\s*U\s*(?=[A-Z(])", " ∪ ", t)   # P U Q → P ∪ Q
    t = re.sub(r"^[•°·«»*®©eo]\s+(?=\S)", "- ", t)           # titik senarai
    t = t.replace("|", "l") if re.search(r"[a-z]\|[a-z]", t) else t
    t = re.sub(r"\s{2,}", " ", t).strip()
    return t


def condongkan(t: str) -> str:
    """Pemboleh ubah huruf kecil tunggal → *x* (tidak termasuk label (a) dan unit)."""
    def ganti(m):
        sebelum = t[max(0, m.start() - 2):m.start()]
        huruf = m.group(1)
        if re.match(r"\d\s", sebelum) and huruf in "msgj":  # unit: 120 m, 5 s, 3 j
            return huruf
        return f"*{huruf}*"
    return re.sub(r"(?<![A-Za-z*(/_])([a-z])(?![A-Za-z*)_])", ganti, t)


# ---- 4. struktur -------------------------------------------------------------------

class Penyusun:
    def __init__(self, log=print):
        self.log = log
        self.data = {"tajuk": "", "bahagian": [], "pembetulan": [], "hilang": [],
                     "catatan_ocr": []}
        self.bahagian = None
        self.soalan = None
        self.ceraian = None   # (a)
        self.sub = None       # (i)
        self.no_akhir = 0
        self.jawapan_dilihat = False
        self.y_akhir = None
        self.tinggi_baris = 30
        self.kapsyen_tertunda = ""
        self.inggeris_dibuang = 0
        self.dalam_inggeris = False
        self.persamaan_akhir = None

    def nod(self):
        return self.sub or self.ceraian or self.soalan

    def _pastikan_bahagian(self):
        if self.bahagian is None:
            self.bahagian = {"nama": "Bahagian A", "markah": None, "arahan": "", "soalan": []}
            self.data["bahagian"].append(self.bahagian)

    def _tambah_teks(self, nod, teks, baris):
        if not teks:
            return
        teks = condongkan(teks)
        sedia = nod.get("teks", "")
        if not sedia:
            nod["teks"] = teks
        else:
            jurang = (baris.y0 - self.y_akhir) if self.y_akhir is not None else 0
            pemisah = "\n" if (jurang > 1.1 * self.tinggi_baris or teks.startswith("- ")) else " "
            nod["teks"] = sedia + pemisah + teks

    def label_baharu(self, lab: str, halaman: int):
        lab_k = lab.lower()
        roman = lab_k in ROMAN and not (lab_k == "i" and (
            self.ceraian is None or self.ceraian["label"] == "(h)"))
        if roman:
            induk = self.ceraian or self.soalan
            self.sub = {"label": f"({lab_k})", "teks": "", "rajah": [], "ceraian": []}
            induk.setdefault("ceraian", []).append(self.sub)
        else:
            self.ceraian = {"label": f"({lab_k})", "teks": "", "rajah": [], "ceraian": []}
            self.sub = None
            self.soalan["ceraian"].append(self.ceraian)
        self.jawapan_dilihat = False

    def proses_baris(self, b: Baris, halaman: int, kiri: float, cm: float):
        teks = baiki_ocr(b.teks)
        if not teks or any(re.search(p, teks, re.I) for p in ABAI):
            return
        # nombor halaman di tengah bawah
        if re.fullmatch(r"\d{1,2}", teks) and abs((b.x0 + b.x1) / 2 - kiri - 8.7 * cm) < 2 * cm:
            return
        if bahasa_inggeris(teks, getattr(b, "condong", False)):
            self.inggeris_dibuang += 1
            self.dalam_inggeris = True
            return
        self.dalam_inggeris = False
        teks = RE_MARKAH_ENG.sub("", teks).strip()
        self.tinggi_baris = 0.8 * self.tinggi_baris + 0.2 * max(10, b.y1 - b.y0)
        m = RE_BAHAGIAN.match(teks)
        if m:
            self.bahagian = {"nama": f"Bahagian {m.group(1).upper()}", "markah": None,
                             "arahan": "", "soalan": []}
            self.data["bahagian"].append(self.bahagian)
            self.soalan = self.ceraian = self.sub = None
            return
        mk = RE_MARKAH.search(teks)
        markah = int(mk.group(1)) if mk else None
        if mk:
            teks = RE_MARKAH.sub("", teks).strip()
        # markah & arahan bahagian (sebelum soalan pertama bahagian itu)
        tengah = abs((b.x0 + b.x1) / 2 - (kiri + 8.7 * cm)) < 3 * cm
        if self.bahagian is not None and not self.bahagian["soalan"]:
            if markah is not None and not teks and tengah:
                self.bahagian["markah"] = markah
                return
            if re.match(r"^Jawab\b", teks, re.I):
                a = self.bahagian["arahan"]
                self.bahagian["arahan"] = (a + " " if a else "") + teks
                return
        if RE_JAWAPAN.match(teks):
            self.jawapan_dilihat = True
            return
        if RE_KAPSYEN.match(teks):
            self.kapsyen_tertunda = RE_KAPSYEN.match(teks).group(0).title()
            self._lekat_kapsyen()
            return
        teks = re.sub(r"^\(\s*6\s*\)", "(b)", teks)   # OCR: (b) → (6)
        # label ruang jawapan "(a) (i)", "(ii)" selepas "Jawapan:" — bukan ceraian baharu
        if self.jawapan_dilihat and re.fullmatch(
                r"(\s*\(\s*([a-hA-H]|i{1,3}|iv|vi{0,3}|ix|x)\s*\)\s*)+", teks):
            return
        # nombor soalan di lajur kiri
        m = re.match(r"^(\d{1,2})\b\s*(.*)$", teks)
        baki_ok = m and (not m.group(2) or m.group(2)[0].isupper() or m.group(2)[0] == "(")
        if m and baki_ok and b.x0 < kiri + 0.5 * cm:
            n = int(m.group(1))
            if (self.no_akhir == 0 and n <= 3) or n == self.no_akhir + 1 or (
                    n == self.no_akhir + 2 and b.x0 < kiri - 0.3 * cm):
                self._pastikan_bahagian()
                self.soalan = {"no": n, "teks": "", "halaman": [halaman], "rajah": [],
                               "jadual": [], "ceraian": []}
                self.bahagian["soalan"].append(self.soalan)
                self.ceraian = self.sub = None
                self.no_akhir = n
                self.jawapan_dilihat = False
                teks = m.group(2)
                self.y_akhir = None
        if self.soalan is None:
            if not self.data["bahagian"] and tengah and len(teks) < 60:
                t0 = self.data["tajuk"]
                self.data["tajuk"] = (t0 + "\n" if t0 else "") + teks
            return
        if halaman not in self.soalan["halaman"]:
            self.soalan["halaman"].append(halaman)
        while True:
            ml = RE_LABEL.match(teks)
            if not ml:
                break
            self.label_baharu(ml.group(1), halaman)
            teks = teks[ml.end():]
            self.y_akhir = None
        nod = self.nod()
        if b.yakin_rendah:
            self.data["catatan_ocr"].append(
                f"Soalan {self.soalan['no']}{(self.ceraian or {}).get('label', '')}: "
                f"{b.yakin_rendah} perkataan kurang pasti — \"{teks[:50]}\"")
        if teks:
            self._tambah_teks(nod, teks, b)
            self.y_akhir = b.y1
        if markah is not None:
            nod["markah"] = markah

    def _lekat_kapsyen(self):
        nod = self.nod()
        if nod and nod.get("rajah") and not nod["rajah"][-1].get("kapsyen"):
            nod["rajah"][-1]["kapsyen"] = self.kapsyen_tertunda
            self.kapsyen_tertunda = ""

    def proses_kawasan(self, k: Kawasan, halaman: int, W: int, H: int, dpi: int):
        nod = self.nod()
        if nod is None:
            return
        spec = {"jenis": "gambar_hiasan", "halaman": halaman,
                "kotak": [round(k.x0 / W, 4), round(k.y0 / H, 4), round(k.x1 / W, 4),
                          round(k.y1 / H, 4)],
                "lebar_cm": min(16.0, round((k.x1 - k.x0) / dpi * 2.54, 2)), "ambang": 175,
                "dpi_asal": dpi}
        if getattr(k, "persamaan", False):
            kunci = re.sub(r"\s+", "", getattr(k, "teks", ""))
            if self.dalam_inggeris or (kunci and kunci == self.persamaan_akhir):
                return  # persamaan versi Bahasa Inggeris / berganda
            self.persamaan_akhir = kunci
            spec["catatan"] = "persamaan — boleh ditukar kepada {\"latex\": ...}"
            spec["ambang"] = 165
            nod.setdefault("rajah", []).append(spec)
            return
        if self.kapsyen_tertunda:
            spec["kapsyen"] = self.kapsyen_tertunda
            self.kapsyen_tertunda = ""
        nod.setdefault("rajah", []).append(spec)
        if self.jawapan_dilihat:
            nod["ruang_jawapan"] = "rajah"

    def siap(self) -> dict:
        def bersih(n):
            n["teks"] = re.sub(r"[ \t]+", " ", n.get("teks", "")).strip()
            for k in ("rajah", "jadual", "ceraian"):
                if not n.get(k):
                    n.pop(k, None)
            for c in n.get("ceraian", []):
                bersih(c)
            if re.search(r"kertas\s+graf", n["teks"], re.I) and not n.get("ceraian"):
                n["ruang_jawapan"] = "kertas_graf"
                n["kertas_graf"] = {"jenis": "kertas_graf", "lebar_cm": 16, "tinggi_cm": 22,
                                    "kecil_mm": 2, "besar_cm": 1}
        for bh in self.data["bahagian"]:
            for s in bh["soalan"]:
                bersih(s)
        if self.inggeris_dibuang:
            self.data["catatan_ocr"].insert(0, f"{self.inggeris_dibuang} baris Bahasa Inggeris dibuang.")
        self.data["tajuk"] = self.data["tajuk"] or "MATEMATIK\nKertas 2"
        return self.data


def _kemas_kawasan(kaw, baris, cm, W, H):
    """Jangan biar potongan rajah mengambil baris ayat di atas/bawahnya; tambah jidar kecil."""
    m = int(0.2 * cm)
    for k in kaw:
        k.x0, k.x1 = max(0, k.x0 - m), min(W, k.x1 + m)
        k.y0, k.y1 = max(0, k.y0 - m), min(H, k.y1 + m)
        for b in baris:
            kapsyen = re.match(r"\s*(Rajah|Jadual|Diagram|Table)\s*\d", b.teks, re.I)
            if len(b.perkataan) <= 3 and not kapsyen:
                continue
            if not (b.x1 > k.x0 and b.x0 < k.x1):
                continue
            if b.y0 < k.y0 + 0.5 * cm and b.y1 > k.y0:   # ayat bertindih di bahagian atas
                k.y0 = int(b.y1) + 2
            if b.y1 > k.y1 - 0.5 * cm and b.y0 < k.y1:   # ayat bertindih di bahagian bawah
                k.y1 = int(b.y0) - 2


def _kiri_teks(baris, cm) -> float:
    """Tepi kiri teks badan (bukan lajur nombor soalan)."""
    xs = sorted(b.x0 for b in baris if len(b.teks) > 15 and not re.match(r"\d{1,2}\s", b.teks))
    if not xs:
        return 2.0 * cm
    return xs[max(0, len(xs) // 10)]


def _persamaan_papar(baris, kaw, kiri, W, cm):
    """Baris persamaan di tengah (matriks, pecahan) → potongan imej, bukan teks OCR rosak."""
    simpan, kumpulan, semasa = [], [], []
    for b in baris:
        perkataan_msa = sum(1 for x in _perkataan(b.teks) if x in MSA or x in ENG)
        tengah = b.x0 > kiri + 2.5 * cm and b.x1 < W - 2.0 * cm
        padat = re.sub(r"\s", "", b.teks)
        nisbah_huruf = sum(c.isalpha() for c in padat) / max(1, len(padat))
        simbol = len(padat) < 40 and perkataan_msa == 0 and nisbah_huruf < 0.7 \
            and re.search(r"[\d=+\-−×÷()\[\]/<>]", padat) \
            and not RE_LABEL.match(b.teks) and not RE_MARKAH.search(b.teks) \
            and not RE_KAPSYEN.match(b.teks) and not RE_BAHAGIAN.match(b.teks) \
            and not re.fullmatch(r"\d{1,2}", b.teks.strip())
        sebelah_rajah = any(min(b.y1, k.y1) > max(b.y0, k.y0) for k in kaw)
        if tengah and simbol and not sebelah_rajah:
            if semasa and b.y0 - semasa[-1].y1 > 0.6 * cm:
                kumpulan.append(semasa)
                semasa = []
            semasa.append(b)
        else:
            if semasa:
                kumpulan.append(semasa)
                semasa = []
            simpan.append(b)
    if semasa:
        kumpulan.append(semasa)
    for g in kumpulan:
        m = int(0.15 * cm)
        k = Kawasan(int(min(b.x0 for b in g)) - m, int(min(b.y0 for b in g)) - m,
                    int(max(b.x1 for b in g)) + m, int(max(b.y1 for b in g)) + m)
        k.persamaan = True
        k.teks = " ".join(b.teks for b in g)
        kaw.append(k)
    return simpan, kaw


def skor_condong(dakwat: np.ndarray, b: "Baris") -> float:
    """< ~0.88 = tulisan condong (italik). Bandingkan ketajaman profil lajur selepas
    ricih ke kanan vs ke kiri: huruf condong menjadi tegak (tajam) pada satu arah sahaja."""
    c = dakwat[int(b.y0):int(b.y1), int(b.x0):int(b.x1)]
    h, w = c.shape
    if h < 8 or w < 40 or c.sum() < 50:
        return 1.0

    def tajam(s):
        pad = int(abs(s) * h) + 2
        prof = np.zeros(w + 2 * pad)
        for r in range(h):
            off = pad + int(round(s * (h - 1 - r)))
            prof[off:off + w] += c[r]
        return float((prof ** 2).sum())
    a = max(tajam(x) for x in (0.15, 0.2, 0.25))
    b_ = max(tajam(-x) for x in (0.15, 0.2, 0.25))
    return a / max(b_, 1e-9)


AMBANG_CONDONG = 0.88
ZON_ATAS, ZON_BAWAH = 0.065, 0.915   # pengepala / pengaki (pecahan tinggi halaman)


def _sampah(t: str) -> bool:
    """Baris hingar OCR daripada titik/bulatan rajah: "e", "ee @", "oe ee e ."."""
    tok = t.split()
    return bool(tok) and all(re.fullmatch(r"[eocEOC@.,°•·*©®'\"~-]{1,4}", x) for x in tok)


def _kunci_ulang(t: str) -> str:
    return re.sub(r"[\W\d_]+", "", t.lower())[:40]


def ekstrak_offline(pdf: str, imej: list[str], dpi: int, log=print, paksa_ocr=False) -> dict:
    semua, kaedah = perkataan_halaman(pdf, imej, dpi, log=log, paksa_ocr=paksa_ocr)
    cm = dpi / 2.54
    p = Penyusun(log)
    # ---- laluan 1: baris & kawasan setiap halaman
    halaman = []
    for i, (png, pk) in enumerate(zip(imej, semua)):
        h = i + 1
        teks_hal = " ".join(x.teks for x in pk)
        if any(re.search(r, teks_hal, re.I) for r in HALAMAN_ABAI) and not re.search(
                r"Bahagian\s+[A-C]\b.*\b1\b", teks_hal):
            if re.search(r"Kertas\s*2", teks_hal, re.I) and not p.data["tajuk"]:
                p.data["tajuk"] = "MATEMATIK\nKertas 2"
            log(f"  halaman {h}: kulit/maklumat calon/rumus — diabaikan")
            continue
        if len(teks_hal.strip()) < 5:
            log(f"  halaman {h}: kosong — diabaikan")
            continue
        W, H = Image.open(png).size
        # buang pengepala, pengaki & tera air (zon atas/bawah halaman)
        pk = [x for x in pk if ZON_ATAS * H < x.cy < ZON_BAWAH * H
              and not re.search(r"TELEGRAM|WHATSAPP|@\w|https?:|www\.|t\.me", x.teks, re.I)]
        kaw = kawasan_rajah(png, pk, dpi, zon=(ZON_ATAS, ZON_BAWAH))
        dalam = {id(x) for k in kaw for x in k.perkataan}
        baris = jadikan_baris([x for x in pk if id(x) not in dalam])
        kiri = _kiri_teks(baris, cm)
        if kaedah[i] == "ocr":
            # nombor soalan di lajur kiri: OCR kedua (digit sahaja)
            baru = [x for x in ocr_lajur_nombor(png, kiri - 1.8 * cm, kiri - 0.15 * cm)
                    if ZON_ATAS * H < x.cy < ZON_BAWAH * H and
                    not any(min(x.x1, q.x1) > max(x.x0, q.x0) and
                            min(x.y1, q.y1) > max(x.y0, q.y0) for q in pk)]
            if baru:
                pk = pk + baru
                baris = jadikan_baris([x for x in pk if id(x) not in dalam])
        dakwat = (np.asarray(Image.open(png).convert("L")) < 140).astype(np.float32)
        for b in baris:
            # hanya baris ayat (≥ 2 perkataan ≥ 3 huruf); baris simbol/persamaan tidak diuji
            b.condong = len(re.findall(r"[A-Za-z]{3,}", b.teks)) >= 2 and \
                skor_condong(dakwat, b) < AMBANG_CONDONG
            b.zon_tepi = b.y0 < 0.15 * H or b.y1 > 0.85 * H
        halaman.append((h, png, baris, kaw, kiri, W, H, kaedah[i]))
    # ---- teks yang berulang pada banyak halaman (pengepala/pengaki seperti "MRSM 2026 K2")
    kiraan = {}
    for h, _, baris, *_ in halaman:
        for kk in {_kunci_ulang(b.teks) for b in baris
                   if getattr(b, "zon_tepi", False) and len(_kunci_ulang(b.teks)) >= 4}:
            kiraan[kk] = kiraan.get(kk, 0) + 1
    had = max(3, int(0.3 * len(halaman)))
    ulang = {kk for kk, n in kiraan.items() if n >= had
             and not re.match(r"(jawapan|answer|jawab|markah|marks|rajah|jadual|diagram|table|"
                              r"bahagian|section)", kk)}
    # ---- laluan 2: struktur
    for h, png, baris, kaw, kiri, W, H, kae in halaman:
        baris = [b for b in baris if not (getattr(b, "zon_tepi", False)
                                          and _kunci_ulang(b.teks) in ulang)
                 and not _sampah(b.teks)]
        _kemas_kawasan(kaw, baris, cm, W, H)
        baris, kaw = _persamaan_papar(baris, kaw, kiri, W, cm)
        item = [(b.y0, 0, b) for b in baris] + [(k.y0, 1, k) for k in kaw]
        for _, jenis, obj in sorted(item, key=lambda t: (t[0], t[1])):
            if jenis == 0:
                p.proses_baris(obj, h, kiri, cm)
            else:
                p.proses_kawasan(obj, h, W, H, dpi)
        log(f"  halaman {h}: {len(baris)} baris, {len(kaw)} rajah ({kae})")
    data, amaran = normalkan(p.siap())
    for a in amaran:
        log(f"  amaran: {a}")
    return data
