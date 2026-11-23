"""plot_kotak — plot kotak (box plot) mendatar.

{"jenis": "plot_kotak", "min": 12, "q1": 18, "median": 24, "q3": 30, "maks": 41,
 "julat": [10, 45], "tick": 5, "label_x": "Jisim (kg)", "lebar_cm": 11,
 "label_nilai": false}
Boleh beri beberapa kotak: "kotak": [{"label": "Kelas A", "min": ..}, ...]
"""
from matplotlib.patches import Rectangle

from . import asas


def lukis(spec, laluan, **_):
    kotak = spec.get("kotak") or [spec]
    a, b = map(float, spec.get("julat", [min(k["min"] for k in kotak), max(k["maks"] for k in kotak)]))
    W = float(spec.get("lebar_cm", 11))
    H = float(spec.get("tinggi_cm", 1.6 + 1.3 * len(kotak)))
    fig = asas.rajah_cm(W, H)
    kiri = 0.18 if any(k.get("label") for k in kotak) else 0.05
    ax = fig.add_axes([kiri, 1.2 / H, 0.95 - kiri, 1 - 1.3 / H])
    ax.set_xlim(a, b)
    ax.set_ylim(0, len(kotak))
    for i, k in enumerate(kotak):
        y = len(kotak) - i - 0.5
        h = 0.5
        ax.add_patch(Rectangle((k["q1"], y - h / 2), k["q3"] - k["q1"], h, fill=False, lw=2.0,
                               zorder=4))
        ax.plot([k["median"]] * 2, [y - h / 2, y + h / 2], color="black", lw=2.4, zorder=5)
        ax.plot([k["min"], k["q1"]], [y, y], color="black", lw=2.0)
        ax.plot([k["q3"], k["maks"]], [y, y], color="black", lw=2.0)
        for v in (k["min"], k["maks"]):
            ax.plot([v, v], [y - h / 4, y + h / 4], color="black", lw=2.0)
        if k.get("label"):
            ax.text(a - (b - a) * 0.02, y, asas.mt(k["label"]), ha="right", va="center")
    for s in ("left", "top", "right"):
        ax.spines[s].set_visible(False)
    ax.set_yticks([])
    asas.letak_tick(ax, asas.julat_tick(a, b, float(spec.get("tick", 5))), None,
                    buang_sifar=False, latar_putih=False)
    if spec.get("label_x"):
        ax.set_xlabel(asas.mt(spec["label_x"]), labelpad=4)
    return asas.simpan(fig, laluan)
