"""venn — gambar rajah Venn 2 atau 3 set.

{
  "jenis": "venn",
  "set": [{"label": "P"}, {"label": "Q"}, {"label": "R"}],
  "nilai": {"P": "5", "Q": "3", "PQ": "2", "PQR": "1", "luar": "4"},  # kunci = set yang mengandungi rantau
  "xi": "ξ",                       # label set semesta
  "lorek": ["PQ"],                 # rantau berlorek (kunci sama dengan "nilai")
  "lebar_cm": 8, "tinggi_cm": 5.5
}
Rantau: gabungan label set yang rantau itu berada di dalamnya, "luar" untuk luar semua set.
"""
import itertools

import numpy as np
from matplotlib.patches import Circle, Rectangle

from . import asas


def _susun(n, W, H):
    if n == 2:
        r = min(H * 0.36, W * 0.24)
        return [(W / 2 - r * 0.62, H * 0.48), (W / 2 + r * 0.62, H * 0.48)], r
    r = min(H * 0.27, W * 0.2)
    cx, cy = W / 2, H * 0.47
    return [(cx - r * 0.6, cy + r * 0.35), (cx + r * 0.6, cy + r * 0.35), (cx, cy - r * 0.62)], r


def _kunci(label_set, dalam):
    return "".join(l for l, d in zip(label_set, dalam) if d) or "luar"


def lukis(spec, laluan, **_):
    W = float(spec.get("lebar_cm", 8))
    H = float(spec.get("tinggi_cm", 5.5))
    labels = [str(s["label"]) for s in spec["set"]]
    n = len(labels)
    pusat, r = _susun(n, W, H)
    fig = asas.rajah_cm(W, H)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, W)
    ax.set_ylim(0, H)
    ax.set_aspect("equal")
    ax.axis("off")
    m = 0.15
    ax.add_patch(Rectangle((m, m), W - 2 * m, H - 2 * m, fill=False, lw=1.8, zorder=5))
    ax.text(m + 0.2, H - m - 0.15, asas.mt(spec.get("xi", "ξ")), ha="left", va="top")
    # lorek
    lorek = {frozenset(str(k)) if k != "luar" else frozenset(["luar"])
             for k in (spec.get("lorek", []) or [])}
    if lorek:
        gx, gy = np.meshgrid(np.linspace(m, W - m, 700), np.linspace(m, H - m, 500))
        mask = np.zeros_like(gx, dtype=bool)
        dalam = [((gx - cx) ** 2 + (gy - cy) ** 2) <= r * r for cx, cy in pusat]
        for kombo in itertools.product([False, True], repeat=n):
            kk = _kunci(labels, kombo)
            if (frozenset(["luar"]) if kk == "luar" else frozenset(kk)) in lorek:
                k = np.ones_like(gx, dtype=bool)
                for d, ya in zip(dalam, kombo):
                    k &= d if ya else ~d
                mask |= k
        ax.contourf(gx, gy, mask.astype(float), levels=[0.5, 1.5], colors="none",
                    hatches=["////"], zorder=2)
    for (cx, cy), lb in zip(pusat, labels):
        ax.add_patch(Circle((cx, cy), r, fill=False, lw=2.2, zorder=6))
    # label set
    for i, ((cx, cy), lb) in enumerate(zip(pusat, labels)):
        if n == 2:
            pos = (cx + (-1 if i == 0 else 1) * r * 0.78, cy + r * 0.82)
        else:
            pos = [(cx - r * 0.8, cy + r * 0.85), (cx + r * 0.8, cy + r * 0.85),
                   (cx + r * 1.0, cy - r * 0.75)][i]
        ax.text(*pos, asas.mt(lb), ha="center", va="center", zorder=8)
    # nilai dalam rantau: titik berat rantau dikira secara berangka
    gx, gy = np.meshgrid(np.linspace(m, W - m, 400), np.linspace(m, H - m, 300))
    dalam = [((gx - cx) ** 2 + (gy - cy) ** 2) <= r * r for cx, cy in pusat]
    for kunci, nilai in (spec.get("nilai") or {}).items():
        if nilai in (None, ""):
            continue
        if kunci == "luar":
            pos = (W - m - 0.5, m + 0.4)
        else:
            k = np.ones_like(gx, dtype=bool)
            for lb, d in zip(labels, dalam):
                k &= d if lb in kunci else ~d
            if not k.any():
                continue
            # titik paling jauh dari sempadan (anggaran): purata titik
            pos = (gx[k].mean(), gy[k].mean())
        ax.text(*pos, asas.mt(nilai), ha="center", va="center", zorder=9, bbox=asas.KOTAK_PUTIH)
    return asas.simpan(fig, laluan)
