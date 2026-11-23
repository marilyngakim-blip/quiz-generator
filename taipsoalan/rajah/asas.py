"""Gaya dan fungsi bantu bersama untuk semua rajah.

Prinsip:
  * Rajah dilukis pada SAIZ SEBENAR (figsize = cm/2.54) dan dimasukkan ke Word
    pada lebar fizikal yang sama, jadi saiz fon dalam rajah = saiz pt sebenar.
  * Semua garisan hitam.  Grid besar hitam (lw 1.1), grid kecil kelabu gelap
    (0.55, lw 0.35).  Nombor & label 13–14 pt tebal; pemboleh ubah condong.
  * PNG disimpan sebagai RGB.
"""
from __future__ import annotations

import logging
import math
import os
import re

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib import rcParams  # noqa: E402
from PIL import Image  # noqa: E402

from teks import ke_mathtext  # noqa: E402

logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)

CM = 1 / 2.54
DPI = 300
SAIZ_FON = 13
LW_GRAF = 2.4
LW_PAKSI = 1.3
LW_GRID_BESAR = 1.1
LW_GRID_KECIL = 0.35
WARNA_GRID_KECIL = "0.55"
KOTAK_PUTIH = dict(boxstyle="square,pad=0.12", fc="white", ec="none")

_SERIF = ["Times New Roman", "Liberation Serif", "Nimbus Roman", "DejaVu Serif"]


def _fon_ada(nama: str) -> bool:
    from matplotlib import font_manager
    return any(f.name == nama for f in font_manager.fontManager.ttflist)


def gaya(saiz: float = SAIZ_FON):
    utama = next((f for f in _SERIF if _fon_ada(f)), "DejaVu Serif")
    rcParams.update({
        "font.family": "serif",
        "font.serif": _SERIF,
        "font.size": saiz,
        "font.weight": "bold",
        "axes.labelweight": "bold",
        "axes.labelsize": saiz,
        "xtick.labelsize": saiz,
        "ytick.labelsize": saiz,
        "mathtext.fontset": "custom",
        "mathtext.rm": f"{utama}:bold",
        "mathtext.it": f"{utama}:italic:bold",
        "mathtext.bf": f"{utama}:bold",
        "mathtext.bfit": f"{utama}:italic:bold",
        "mathtext.default": "bf",
        "axes.linewidth": LW_PAKSI,
        "axes.edgecolor": "black",
        "axes.unicode_minus": True,
        "xtick.color": "black",
        "ytick.color": "black",
        "xtick.major.width": LW_PAKSI,
        "ytick.major.width": LW_PAKSI,
        "xtick.major.size": 4,
        "ytick.major.size": 4,
        "lines.color": "black",
        "hatch.color": "black",
        "hatch.linewidth": 0.9,
        "text.color": "black",
        "savefig.facecolor": "white",
        "figure.facecolor": "white",
    })


gaya()


def mt(s) -> str:
    """Label markup → mathtext (pemboleh ubah condong, saiz & tebal sama)."""
    return ke_mathtext("" if s is None else str(s))


def rajah_cm(lebar_cm: float, tinggi_cm: float):
    fig = plt.figure(figsize=(lebar_cm * CM, tinggi_cm * CM), dpi=DPI)
    return fig


def paksi_cm(fig, kiri_cm, bawah_cm, lebar_cm, tinggi_cm):
    """Tambah paksi pada kedudukan tepat dalam cm (bukan pecahan)."""
    W, H = fig.get_size_inches() / CM
    return fig.add_axes([kiri_cm / W, bawah_cm / H, lebar_cm / W, tinggi_cm / H])


def simpan(fig, laluan: str, ketat: bool = True, pad_cm: float = 0.1) -> tuple[float, float]:
    """Simpan PNG RGB 300 dpi. Pulangkan (lebar_cm, tinggi_cm) fizikal sebenar."""
    os.makedirs(os.path.dirname(laluan) or ".", exist_ok=True)
    kw = dict(dpi=DPI, facecolor="white")
    if ketat:
        kw.update(bbox_inches="tight", pad_inches=pad_cm * CM)
    fig.savefig(laluan, **kw)
    plt.close(fig)
    im = Image.open(laluan).convert("RGB")
    im.save(laluan, dpi=(DPI, DPI))
    return im.width / DPI * 2.54, im.height / DPI * 2.54


# ---- nilai & persamaan --------------------------------------------------------

_NS = {k: getattr(np, k) for k in ("sin", "cos", "tan", "sqrt", "exp", "log", "log10",
                                   "abs", "pi", "e", "arcsin", "arccos", "arctan")}
_NS["ln"] = np.log


def fungsi(persamaan: str):
    """'2x^2 - 3x + 1' / 'y = 2*x+1' → fungsi numpy f(x)."""
    s = str(persamaan).strip()
    s = re.sub(r"^\s*[yY]\s*=", "", s)
    s = s.replace("^", "**").replace("−", "-").replace("×", "*").replace("÷", "/")
    s = re.sub(r"(\d)\s*([a-zA-Z(])", r"\1*\2", s)
    s = re.sub(r"\)\s*([a-zA-Z0-9(])", r")*\1", s)
    s = re.sub(r"\bx\s*\(", "x*(", s)
    kod = compile(s, "<persamaan>", "eval")
    for nama in kod.co_names:
        if nama not in _NS and nama != "x":
            raise ValueError(f"nama tidak dibenarkan dalam persamaan: {nama}")

    def f(x):
        with np.errstate(all="ignore"):
            y = eval(kod, {"__builtins__": {}}, {**_NS, "x": x})
        return np.broadcast_to(np.asarray(y, dtype=float), np.shape(x)).copy()

    return f


def tick_senarai(tick):
    """[1, 2, {"nilai": 10, "label": "*t*"}] → (nilai[], label[])."""
    nilai, label = [], []
    for t in tick or []:
        if isinstance(t, dict):
            nilai.append(float(t["nilai"]))
            label.append(mt(t.get("label", _nombor(t["nilai"]))))
        else:
            nilai.append(float(t))
            label.append(_nombor(t))
    return nilai, label


def _nombor(v) -> str:
    v = float(v)
    s = f"{v:g}" if abs(v - round(v)) > 1e-9 else str(int(round(v)))
    return s.replace("-", "−")


def julat_tick(a, b, langkah):
    if not langkah:
        return []
    n0 = math.ceil(a / langkah - 1e-9)
    n1 = math.floor(b / langkah + 1e-9)
    return [round(n * langkah, 10) for n in range(n0, n1 + 1)]


# ---- paksi & grid ------------------------------------------------------------

def paksi_asal(ax, label_x="*x*", label_y="*y*", tanda_o=True, anak_panah=True):
    """Paksi melalui asalan dengan anak panah, label di hujung, 'O' di asalan."""
    x0, x1 = ax.get_xlim()
    y0, y1 = ax.get_ylim()
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.spines["left"].set_position(("data", 0) if x0 <= 0 <= x1 else ("axes", 0))
    ax.spines["bottom"].set_position(("data", 0) if y0 <= 0 <= y1 else ("axes", 0))
    ax.spines["left"].set_zorder(4)
    ax.spines["bottom"].set_zorder(4)
    xa = 0 if x0 <= 0 <= x1 else x0
    ya = 0 if y0 <= 0 <= y1 else y0
    if anak_panah:
        ax.plot(1, ya, ">", color="black", ms=7, transform=ax.get_yaxis_transform(),
                clip_on=False, zorder=5)
        ax.plot(xa, 1, "^", color="black", ms=7, transform=ax.get_xaxis_transform(),
                clip_on=False, zorder=5)
    if label_x:
        ax.annotate(mt(label_x), xy=(1, ya), xycoords=ax.get_yaxis_transform(),
                    xytext=(9, 0), textcoords="offset points", ha="left", va="center")
    if label_y:
        ax.annotate(mt(label_y), xy=(xa, 1), xycoords=ax.get_xaxis_transform(),
                    xytext=(0, 9), textcoords="offset points", ha="center", va="bottom")
    if tanda_o and x0 <= 0 <= x1 and y0 <= 0 <= y1:
        ax.annotate("O", xy=(0, 0), xytext=(-5, -5), textcoords="offset points",
                    ha="right", va="top", zorder=6)


def letak_tick(ax, tick_x=None, tick_y=None, buang_sifar=True, latar_putih=True):
    """Letak tick (senarai nombor atau {nilai,label}).

    Dengan latar_putih, nombor dilukis sebagai teks sendiri (zorder tinggi, latar
    putih) supaya grid/garisan graf tidak menutup nombor atau tanda negatif.
    Panggil SELEPAS set_xlim/set_ylim.
    """
    x0, x1 = ax.get_xlim()
    y0, y1 = ax.get_ylim()
    ya = 0 if y0 <= 0 <= y1 else y0
    xa = 0 if x0 <= 0 <= x1 else x0

    def tapis(tick):
        v, l = tick_senarai(tick)
        if buang_sifar:
            pasangan = [(a, b) for a, b in zip(v, l) if abs(a) > 1e-12]
            v, l = [p[0] for p in pasangan], [p[1] for p in pasangan]
        return list(v), list(l)

    if tick_x is not None:
        v, l = tapis(tick_x)
        ax.set_xticks(v)
        ax.set_xticklabels([] if latar_putih else l)
        if latar_putih:
            for a_, b_ in zip(v, l):
                ax.annotate(b_, xy=(a_, ya), xytext=(0, -6), textcoords="offset points",
                            ha="center", va="top", zorder=7, bbox=KOTAK_PUTIH,
                            annotation_clip=False)
    if tick_y is not None:
        v, l = tapis(tick_y)
        ax.set_yticks(v)
        ax.set_yticklabels([] if latar_putih else l)
        if latar_putih:
            for a_, b_ in zip(v, l):
                ax.annotate(b_, xy=(xa, a_), xytext=(-6, 0), textcoords="offset points",
                            ha="right", va="center", zorder=7, bbox=KOTAK_PUTIH,
                            annotation_clip=False)
    for lbl in ax.get_xticklabels() + ax.get_yticklabels():
        lbl.set_fontweight("bold")
        lbl.set_fontsize(SAIZ_FON)
    ax.tick_params(direction="inout", length=6, width=LW_PAKSI, pad=3)


def grid(ax, besar_x, besar_y, kecil_x=None, kecil_y=None):
    """Grid besar hitam & grid kecil kelabu, dilukis sebagai garisan (zorder rendah)."""
    x0, x1 = ax.get_xlim()
    y0, y1 = ax.get_ylim()
    if kecil_x:
        for x in julat_tick(x0, x1, kecil_x):
            ax.axvline(x, color=WARNA_GRID_KECIL, lw=LW_GRID_KECIL, zorder=0.5)
    if kecil_y:
        for y in julat_tick(y0, y1, kecil_y):
            ax.axhline(y, color=WARNA_GRID_KECIL, lw=LW_GRID_KECIL, zorder=0.5)
    if besar_x:
        for x in julat_tick(x0, x1, besar_x):
            ax.axvline(x, color="black", lw=LW_GRID_BESAR, zorder=0.6)
    if besar_y:
        for y in julat_tick(y0, y1, besar_y):
            ax.axhline(y, color="black", lw=LW_GRID_BESAR, zorder=0.6)


def label_normal(ax, p0, p1, teks, jarak_pt=12, t=0.5, sisi=1, **kw):
    """Label di sisi garis p0→p1, dianjak ikut arah normal (dalam ruang paparan),
    supaya label tidak bertindih dengan garis."""
    (x0, y0), (x1, y1) = p0, p1
    xm, ym = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
    d0 = ax.transData.transform((x0, y0))
    d1 = ax.transData.transform((x1, y1))
    dx, dy = d1 - d0
    n = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / n, dx / n
    if ny < 0 or (abs(ny) < 1e-9 and nx < 0):
        nx, ny = -nx, -ny
    nx, ny = nx * sisi, ny * sisi
    ha = "left" if nx > 0.35 else "right" if nx < -0.35 else "center"
    va = "bottom" if ny > 0.35 else "top" if ny < -0.35 else "center"
    kw.setdefault("bbox", KOTAK_PUTIH)
    return ax.annotate(mt(teks), xy=(xm, ym), xytext=(nx * jarak_pt, ny * jarak_pt),
                       textcoords="offset points", ha=ha, va=va, zorder=8, **kw)


ARAH = {"kanan": (1, 0), "kiri": (-1, 0), "atas": (0, 1), "bawah": (0, -1),
        "atas_kanan": (0.75, 0.75), "atas_kiri": (-0.75, 0.75),
        "bawah_kanan": (0.75, -0.75), "bawah_kiri": (-0.75, -0.75)}


def label_titik(ax, x, y, teks, kedudukan="atas_kanan", jarak_pt=7, titik=True, putih=True):
    if titik:
        ax.plot([x], [y], "o", color="black", ms=5, zorder=9)
    if not teks:
        return
    nx, ny = ARAH.get(kedudukan, ARAH["atas_kanan"])
    ha = "left" if nx > 0.3 else "right" if nx < -0.3 else "center"
    va = "bottom" if ny > 0.3 else "top" if ny < -0.3 else "center"
    ax.annotate(mt(teks), xy=(x, y), xytext=(nx * jarak_pt, ny * jarak_pt),
                textcoords="offset points", ha=ha, va=va, zorder=10,
                bbox=KOTAK_PUTIH if putih else None)


def keratan(p0, p1, x0, x1, y0, y1):
    """Kerat segmen p0→p1 kepada segi empat (Liang–Barsky). Pulang None jika di luar."""
    (ax_, ay), (bx, by) = p0, p1
    dx, dy = bx - ax_, by - ay
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, ax_ - x0), (dx, x1 - ax_), (-dy, ay - y0), (dy, y1 - ay)):
        if abs(p) < 1e-12:
            if q < 0:
                return None
            continue
        r = q / p
        if p < 0:
            t0 = max(t0, r)
        else:
            t1 = min(t1, r)
        if t0 > t1:
            return None
    return (ax_ + t0 * dx, ay + t0 * dy), (ax_ + t1 * dx, ay + t1 * dy)


def garis_putus(ax, dari, ke, lw=1.2):
    ax.plot([dari[0], ke[0]], [dari[1], ke[1]], ls=(0, (4, 3)), color="black", lw=lw, zorder=3)


def lukis_tambahan(ax, spec):
    """Elemen sepunya: titik bertanda & garis putus-putus."""
    for g in spec.get("garis_putus", []) or []:
        if isinstance(g, dict):
            garis_putus(ax, g["dari"], g["ke"])
    for t in spec.get("titik", []) or []:
        label_titik(ax, float(t["x"]), float(t["y"]), t.get("label", ""),
                    t.get("kedudukan", "atas_kanan"), titik=t.get("tanda", True))
