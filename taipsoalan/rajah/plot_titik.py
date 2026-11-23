"""plot_titik — plot titik (dot plot).

{"jenis": "plot_titik", "nilai": [2, 3, 3, 4, 4, 4, 7], "julat": [0, 10], "tick": 1,
 "label_x": "Bilangan buku", "lebar_cm": 10}
"""
from collections import Counter

from . import asas


def lukis(spec, laluan, **_):
    a, b = map(float, spec.get("julat", [min(spec["nilai"]), max(spec["nilai"])]))
    kira = Counter(float(v) for v in spec["nilai"])
    maks = max(kira.values()) if kira else 1
    W = float(spec.get("lebar_cm", 10))
    jarak = float(spec.get("jarak_titik_cm", 0.45))
    H = float(spec.get("tinggi_cm", 1.6 + maks * jarak))
    fig = asas.rajah_cm(W, H)
    ax = fig.add_axes([0.05, 1.3 / H, 0.9, 1 - 1.4 / H])
    lebar_data = (b - a) * 1.1
    skala = lebar_data / (0.9 * W)  # unit data per cm
    ax.set_xlim(a - (b - a) * 0.05, b + (b - a) * 0.05)
    ax.set_ylim(0, maks * jarak + 0.2)
    for v, n in kira.items():
        for k in range(n):
            ax.plot([v], [jarak * (k + 0.5)], "o", color="black", ms=8, zorder=4)
    for s in ("left", "top", "right"):
        ax.spines[s].set_visible(False)
    ax.set_yticks([])
    asas.letak_tick(ax, asas.julat_tick(a, b, float(spec.get("tick", 1))), None,
                    buang_sifar=False, latar_putih=False)
    if spec.get("label_x"):
        ax.set_xlabel(asas.mt(spec["label_x"]), labelpad=4)
    _ = skala
    return asas.simpan(fig, laluan)
