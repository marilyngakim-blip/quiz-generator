"""graf_garis_lurus — satu atau lebih garis lurus pada satah, dengan grid pilihan.

{
  "jenis": "graf_garis_lurus",
  "julat_x": [-2, 6], "julat_y": [-3, 8],
  "garis": [
     {"persamaan": "2x + 1", "label": "*y* = 2*x* + 1"},
     {"dua_titik": [[0, 6], [6, 0]], "label": "PQ", "putus": true},
     {"menegak": 3, "label": "*x* = 3"}
  ],
  "titik": [...], "grid": true, "grid_besar": 1,
  "tick_x": 1, "tick_y": 1,                   # langkah, atau senarai
  "lebar_cm": 9, "tinggi_cm": 9
}
"""
import numpy as np

from . import asas


def _tick(v, a, b):
    if isinstance(v, (int, float)):
        return asas.julat_tick(a, b, float(v))
    return v


def lukis(spec, laluan, **_):
    x0, x1 = map(float, spec.get("julat_x", [-5, 5]))
    y0, y1 = map(float, spec.get("julat_y", [-5, 5]))
    W = float(spec.get("lebar_cm", 9))
    H = float(spec.get("tinggi_cm", W * (y1 - y0) / (x1 - x0)))
    fig = asas.rajah_cm(W, H)
    ax = fig.add_axes([0.1, 0.1, 0.8, 0.8])
    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)
    if spec.get("grid", True):
        g = float(spec.get("grid_besar", 1))
        asas.grid(ax, g, g, spec.get("grid_kecil"), spec.get("grid_kecil"))
    for gs in spec.get("garis", []):
        ls = (0, (5, 3)) if gs.get("putus") else "-"
        if "menegak" in gs:
            xv = float(gs["menegak"])
            p0, p1 = (xv, y0), (xv, y1)
        elif "dua_titik" in gs:
            (a, b), (c, d) = gs["dua_titik"]
            if gs.get("segmen"):
                p0, p1 = (a, b), (c, d)
            else:
                m = (d - b) / (c - a) if c != a else None
                if m is None:
                    p0, p1 = (a, y0), (a, y1)
                else:
                    p0, p1 = (x0, b + m * (x0 - a)), (x1, b + m * (x1 - a))
        else:
            if "persamaan" in gs:
                f = asas.fungsi(gs["persamaan"])
            else:
                m, c = float(gs.get("m", 1)), float(gs.get("c", 0))
                f = lambda x, m=m, c=c: m * np.asarray(x) + c  # noqa: E731
            xa, xb = gs.get("julat_x", [x0, x1])
            p0 = (xa, float(f(np.array([xa]))[0]))
            p1 = (xb, float(f(np.array([xb]))[0]))
        k = asas.keratan(p0, p1, x0, x1, y0, y1)
        if k is None:
            continue
        p0, p1 = k
        ax.plot([p0[0], p1[0]], [p0[1], p1[1]], color="black", lw=asas.LW_GRAF, ls=ls,
                zorder=4)
        if gs.get("label"):
            asas.label_normal(ax, p0, p1, gs["label"], t=float(gs.get("kedudukan_label", 0.92)),
                              sisi=int(gs.get("sisi", 1)))
    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)
    asas.letak_tick(ax, _tick(spec.get("tick_x", 1), x0, x1), _tick(spec.get("tick_y", 1), y0, y1))
    asas.paksi_asal(ax, spec.get("label_x", "*x*"), spec.get("label_y", "*y*"))
    asas.lukis_tambahan(ax, spec)
    return asas.simpan(fig, laluan)
