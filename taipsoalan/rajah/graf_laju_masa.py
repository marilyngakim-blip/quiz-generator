"""graf_laju_masa / graf_jarak_masa — graf gerakan (segmen garis lurus).

{
  "jenis": "graf_laju_masa",
  "titik": [[0, 0], [4, 12], [10, 12], [14, 0]],
  "label_x": "Masa (s)", "label_y": "Laju (m s⁻¹)",
  "tick_x": [4, 10, {"nilai": 14, "label": "*t*"}],
  "tick_y": [{"nilai": 12, "label": "*v*"}],
  "putus_ke_paksi": true,                 # garis putus dari bucu ke paksi bertick
  "label_segmen": [{"segmen": 1, "teks": "..."}],
  "titik_bertanda": [{"x": 4, "y": 12, "label": "A"}],
  "lebar_cm": 10, "tinggi_cm": 6
}
"""
import numpy as np

from . import asas


def lukis(spec, laluan, **_):
    W = float(spec.get("lebar_cm", 10))
    H = float(spec.get("tinggi_cm", 6))
    pts = np.array(spec["titik"], dtype=float)
    fig = asas.rajah_cm(W, H)
    ax = fig.add_axes([0.12, 0.2, 0.78, 0.68])
    ax.plot(pts[:, 0], pts[:, 1], color="black", lw=asas.LW_GRAF, zorder=4,
            solid_joinstyle="miter")
    xmax = max(pts[:, 0].max(), *(asas.tick_senarai(spec.get("tick_x"))[0] or [0]))
    ymax = max(pts[:, 1].max(), *(asas.tick_senarai(spec.get("tick_y"))[0] or [0]))
    ymin = min(0, pts[:, 1].min())
    ax.set_xlim(0, xmax * 1.1 or 1)
    ax.set_ylim(ymin - (0.08 * ymax if ymin < 0 else 0), ymax * 1.18 or 1)
    tx = spec.get("tick_x")
    ty = spec.get("tick_y")
    if tx is None:
        tx = sorted({float(p[0]) for p in pts if p[0] != 0})
    if ty is None:
        ty = sorted({float(p[1]) for p in pts if p[1] != 0})
    asas.letak_tick(ax, tx, ty)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_position(("data", 0))
    ax.plot(1, 0, ">", color="black", ms=7, transform=ax.get_yaxis_transform(), clip_on=False)
    ax.plot(0, 1, "^", color="black", ms=7, transform=ax.get_xaxis_transform(), clip_on=False)
    ax.annotate("O", xy=(0, 0), xytext=(-5, -5), textcoords="offset points", ha="right", va="top")
    # label paksi: "Masa (s)" di bawah nombor paksi; label-y di atas paksi
    ax.set_xlabel(asas.mt(spec.get("label_x", "Masa (s)")), labelpad=6)
    ax.xaxis.set_label_coords(1.0, -0.06 - 0.5 / H, transform=ax.transAxes)
    ax.xaxis.label.set_ha("right")
    ax.xaxis.label.set_va("top")
    ax.annotate(asas.mt(spec.get("label_y", "Laju (m s⁻¹)")), xy=(0, 1),
                xycoords=ax.get_xaxis_transform(), xytext=(0, 10),
                textcoords="offset points", ha="left", va="bottom")
    if spec.get("putus_ke_paksi", True):
        txv = set(asas.tick_senarai(tx)[0])
        tyv = set(asas.tick_senarai(ty)[0])
        for x, y in pts:
            if x in txv and y != 0 and x != 0:
                asas.garis_putus(ax, (x, 0), (x, y))
            if y in tyv and x != 0:
                asas.garis_putus(ax, (0, y), (x, y))
    for ls in spec.get("label_segmen", []) or []:
        i = int(ls["segmen"])
        asas.label_normal(ax, pts[i], pts[i + 1], ls["teks"], jarak_pt=10,
                          sisi=int(ls.get("sisi", 1)))
    asas.lukis_tambahan(ax, {"garis_putus": spec.get("garis_putus"),
                             "titik": spec.get("titik_bertanda")})
    return asas.simpan(fig, laluan)
