"""satah_cartes — satah Cartes bergrid dengan poligon (penjelmaan, koordinat).

{
  "jenis": "satah_cartes",
  "julat_x": [-6, 6], "julat_y": [-4, 6], "unit_cm": 0.8,
  "poligon": [{"bucu": [[1,1],[3,1],[3,4]], "label_bucu": ["A","B","C"],
               "lorek": true, "label": "P", "putus": false}],
  "titik": [{"x": 2, "y": 3, "label": "M"}],
  "garis": [{"dua_titik": [[0,-4],[0,6]], "label": "...", "putus": true}],
  "tick": 2, "grid": true
}
Poligon dilukis di atas grid (zorder) dan label bucu dianjak keluar dari sentroid.
"""
import numpy as np

from . import asas


def lukis(spec, laluan, **_):
    x0, x1 = map(float, spec.get("julat_x", [-6, 6]))
    y0, y1 = map(float, spec.get("julat_y", [-6, 6]))
    u = float(spec.get("unit_cm", min(0.9, 14 / (x1 - x0))))
    W, H = (x1 - x0) * u, (y1 - y0) * u
    fig = asas.rajah_cm(W + 2.0, H + 2.0)
    ax = asas.paksi_cm(fig, 1.0, 1.0, W, H)
    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)
    ax.set_aspect("equal")
    if spec.get("grid", True):
        asas.grid(ax, 1, 1)
    tick = spec.get("tick", 2)
    asas.letak_tick(ax, asas.julat_tick(x0, x1, tick), asas.julat_tick(y0, y1, tick))
    asas.paksi_asal(ax, spec.get("label_x", "*x*"), spec.get("label_y", "*y*"))
    for pg in spec.get("poligon", []):
        b = np.array(pg["bucu"], dtype=float)
        tutup = np.vstack([b, b[:1]])
        ls = (0, (5, 3)) if pg.get("putus") else "-"
        if pg.get("lorek"):
            ax.fill(b[:, 0], b[:, 1], facecolor="0.8", edgecolor="none", zorder=4.5)
        ax.plot(tutup[:, 0], tutup[:, 1], color="black", lw=2.2, ls=ls, zorder=5)
        c = b.mean(axis=0)
        for (x, y), nama in zip(b, pg.get("label_bucu", []) or []):
            if not nama:
                continue
            d = np.array([x, y]) - c
            n = np.hypot(*d) or 1
            dx, dy = d / n
            ax.annotate(asas.mt(nama), xy=(x, y), xytext=(dx * 11, dy * 11),
                        textcoords="offset points", ha="center", va="center", zorder=10,
                        bbox=asas.KOTAK_PUTIH)
        if pg.get("label"):
            ax.text(c[0], c[1], asas.mt(pg["label"]), ha="center", va="center", zorder=10,
                    bbox=asas.KOTAK_PUTIH)
    for g in spec.get("garis", []) or []:
        (a, b_), (c_, d) = g["dua_titik"]
        ls = (0, (5, 3)) if g.get("putus") else "-"
        ax.plot([a, c_], [b_, d], color="black", lw=1.8, ls=ls, zorder=4.8)
        if g.get("label"):
            asas.label_normal(ax, (a, b_), (c_, d), g["label"], t=float(g.get("kedudukan_label", 0.9)))
    asas.lukis_tambahan(ax, spec)
    return asas.simpan(fig, laluan)
