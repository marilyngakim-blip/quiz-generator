"""graf_berpemberat — graf (rangkaian) dengan bucu dan tepi berpemberat.

{
  "jenis": "graf_berpemberat",
  "bucu": [{"nama": "A", "x": 0, "y": 0, "kedudukan": "kiri"}, ...],
  "tepi": [{"dari": "A", "ke": "B", "pemberat": "5", "berarah": false, "sisi": 1}],
  "lebar_cm": 9
}
Koordinat bucu dalam unit sebarang; dinormalkan ke lebar_cm.
"""
import numpy as np

from . import asas


def lukis(spec, laluan, **_):
    bucu = {b["nama"]: (float(b["x"]), float(b["y"])) for b in spec["bucu"]}
    xs = np.array([p[0] for p in bucu.values()])
    ys = np.array([p[1] for p in bucu.values()])
    W = float(spec.get("lebar_cm", 9))
    jx = (xs.max() - xs.min()) or 1
    jy = (ys.max() - ys.min()) or 1
    H = float(spec.get("tinggi_cm", max(2.5, W * jy / jx)))
    fig = asas.rajah_cm(W, H)
    ax = fig.add_axes([0.08, 0.1, 0.84, 0.8])
    ax.set_xlim(xs.min() - 0.05 * jx, xs.max() + 0.05 * jx)
    ax.set_ylim(ys.min() - 0.05 * jy, ys.max() + 0.05 * jy)
    ax.axis("off")
    for t in spec.get("tepi", []):
        p0, p1 = bucu[t["dari"]], bucu[t["ke"]]
        lengkung = float(t.get("lengkung", 0))
        if lengkung:
            from matplotlib.patches import FancyArrowPatch
            ax.add_patch(FancyArrowPatch(p0, p1, connectionstyle=f"arc3,rad={lengkung}",
                                         arrowstyle="-|>" if t.get("berarah") else "-",
                                         mutation_scale=16, lw=2.0, color="black", zorder=3))
            mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
            dx, dy = p1[0] - p0[0], p1[1] - p0[1]
            lx, ly = mx + lengkung * dy, my - lengkung * dx
            if t.get("pemberat") not in (None, ""):
                ax.text(lx, ly, asas.mt(t["pemberat"]), ha="center", va="center", zorder=8,
                        bbox=asas.KOTAK_PUTIH)
            continue
        ax.plot([p0[0], p1[0]], [p0[1], p1[1]], color="black", lw=2.0, zorder=3)
        if t.get("berarah"):
            ax.annotate("", xy=(p0[0] + (p1[0] - p0[0]) * 0.58, p0[1] + (p1[1] - p0[1]) * 0.58),
                        xytext=(p0[0] + (p1[0] - p0[0]) * 0.42, p0[1] + (p1[1] - p0[1]) * 0.42),
                        arrowprops=dict(arrowstyle="-|>", color="black", lw=2,
                                        mutation_scale=16), zorder=4)
        if t.get("pemberat") not in (None, ""):
            asas.label_normal(ax, p0, p1, t["pemberat"], jarak_pt=8, t=float(t.get("t", 0.5)),
                              sisi=int(t.get("sisi", 1)))
    for b in spec["bucu"]:
        x, y = bucu[b["nama"]]
        ax.plot([x], [y], "o", color="black", ms=7, zorder=6)
        kd = b.get("kedudukan")
        if not kd:
            cx, cy = xs.mean(), ys.mean()
            kd = ("atas" if y >= cy else "bawah") + ("_kanan" if x >= cx else "_kiri")
        asas.label_titik(ax, x, y, b["nama"], kd, jarak_pt=8, titik=False, putih=False)
    return asas.simpan(fig, laluan)
