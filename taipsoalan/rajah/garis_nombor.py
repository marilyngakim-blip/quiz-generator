"""garis_nombor — garis nombor dengan titik (bulat penuh/kosong) dan selang.

{"jenis": "garis_nombor", "julat": [-3, 5], "tick": 1,
 "titik": [{"x": 2, "jenis": "kosong", "label": ""}],
 "selang": [{"dari": -1, "ke": 3, "tutup_kiri": true, "tutup_kanan": false},
            {"dari": 3, "ke": "+", "tutup_kiri": false}],   # "+" / "-" = ke infiniti
 "label": [{"x": 1, "teks": "*k*"}],
 "lebar_cm": 10}
"""
from . import asas


def lukis(spec, laluan, **_):
    a, b = map(float, spec.get("julat", [-5, 5]))
    W = float(spec.get("lebar_cm", 10))
    sel = spec.get("selang", []) or []
    H = float(spec.get("tinggi_cm", 1.8 + 0.45 * len(sel)))
    fig = asas.rajah_cm(W, H)
    ax = fig.add_axes([0.04, 1.1 / H, 0.92, 1 - 1.2 / H])
    pad = (b - a) * 0.06
    ax.set_xlim(a - pad, b + pad)
    ax.set_ylim(0, 1 + 0.6 * len(sel))
    ax.axis("off")
    ax.annotate("", xy=(b + pad, 0.3), xytext=(a - pad, 0.3),
                arrowprops=dict(arrowstyle="<|-|>", lw=1.6, color="black", mutation_scale=14))
    for v in asas.julat_tick(a, b, float(spec.get("tick", 1))):
        ax.plot([v, v], [0.15, 0.45], color="black", lw=1.4)
        ax.text(v, 0.0, asas._nombor(v), ha="center", va="top")
    for l in spec.get("label", []) or []:
        ax.plot([l["x"]] * 2, [0.15, 0.45], color="black", lw=1.4)
        ax.text(float(l["x"]), 0.0, asas.mt(l["teks"]), ha="center", va="top")
    for i, s in enumerate(sel):
        y = 0.9 + 0.6 * i
        x0 = a - pad if s["dari"] in ("-", "-inf") else float(s["dari"])
        x1 = b + pad if s["ke"] in ("+", "inf") else float(s["ke"])
        ax.plot([x0, x0], [0.3, y], color="black", lw=1.2, ls=(0, (3, 2))) if s["dari"] not in ("-", "-inf") else None
        ax.plot([x1, x1], [0.3, y], color="black", lw=1.2, ls=(0, (3, 2))) if s["ke"] not in ("+", "inf") else None
        gaya = "-|>" if s["ke"] in ("+", "inf") else "<|-" if s["dari"] in ("-", "-inf") else "-"
        ax.annotate("", xy=(x1, y), xytext=(x0, y),
                    arrowprops=dict(arrowstyle=gaya, lw=2.2, color="black", mutation_scale=14))
        for x, tutup, ada in ((x0, s.get("tutup_kiri", True), s["dari"] not in ("-", "-inf")),
                              (x1, s.get("tutup_kanan", True), s["ke"] not in ("+", "inf"))):
            if ada:
                ax.plot([x], [y], "o", ms=9, mec="black", mew=1.8,
                        mfc="black" if tutup else "white", zorder=5)
    for t in spec.get("titik", []) or []:
        ax.plot([t["x"]], [0.3], "o", ms=9, mec="black", mew=1.8,
                mfc="white" if t.get("jenis") == "kosong" else "black", zorder=5)
        if t.get("label"):
            ax.text(float(t["x"]), 0.6, asas.mt(t["label"]), ha="center", va="bottom")
    return asas.simpan(fig, laluan)
