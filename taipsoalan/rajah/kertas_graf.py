"""kertas_graf — kertas graf SAIZ SEBENAR (tidak diskala ketika dimasukkan ke Word).

{
  "jenis": "kertas_graf",
  "lebar_cm": 16, "tinggi_cm": 22,         # saiz kertas
  "kecil_mm": 2, "besar_cm": 1,            # petak kecil & besar
  "skala_x": 2, "skala_y": 2,              # cm per unit  (contoh 2 cm = 1 unit)
  "julat_x": [-4, 3], "julat_y": [-10, 30], # julat paksi (pilihan; kosong = kertas graf kosong)
  "asal_cm": [9, 4],                        # kedudukan asalan dari bucu kiri bawah (auto jika tiada)
  "label_x": "*x*", "label_y": "*y*",
  "tick_x": 1, "tick_y": 5,                 # selang nombor paksi
  "garis": [{"persamaan": "...", "julat_x": [..]}, {"titik": [[x,y],...]}],
  "titik": [...]
}
Koordinat dilukis dalam cm supaya skala tepat.
"""
import numpy as np

from . import asas


def lukis(spec, laluan, **_):
    W = float(spec.get("lebar_cm", 16))
    H = float(spec.get("tinggi_cm", 22))
    kecil = float(spec.get("kecil_mm", 2)) / 10
    besar = float(spec.get("besar_cm", 1))
    fig = asas.rajah_cm(W, H)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, W)
    ax.set_ylim(0, H)
    ax.axis("off")
    for x in asas.julat_tick(0, W, kecil):
        ax.plot([x, x], [0, H], color=asas.WARNA_GRID_KECIL, lw=asas.LW_GRID_KECIL, zorder=0.5)
    for y in asas.julat_tick(0, H, kecil):
        ax.plot([0, W], [y, y], color=asas.WARNA_GRID_KECIL, lw=asas.LW_GRID_KECIL, zorder=0.5)
    for x in asas.julat_tick(0, W, besar):
        ax.plot([x, x], [0, H], color="black", lw=asas.LW_GRID_BESAR, zorder=0.6)
    for y in asas.julat_tick(0, H, besar):
        ax.plot([0, W], [y, y], color="black", lw=asas.LW_GRID_BESAR, zorder=0.6)
    ax.plot([0, W, W, 0, 0], [0, 0, H, H, 0], color="black", lw=1.6, zorder=1)

    jx, jy = spec.get("julat_x"), spec.get("julat_y")
    if jx and jy:
        sx = float(spec.get("skala_x", 2))
        sy = float(spec.get("skala_y", sx))
        asal = spec.get("asal_cm")
        if not asal:
            lebar_guna = (jx[1] - jx[0]) * sx
            tinggi_guna = (jy[1] - jy[0]) * sy
            kiri = round((W - lebar_guna) / 2)
            bawah = round((H - tinggi_guna) / 2)
            asal = [kiri - jx[0] * sx, bawah - jy[0] * sy]
        ox, oy = map(float, asal)

        def X(x):
            return ox + np.asarray(x, dtype=float) * sx

        def Y(y):
            return oy + np.asarray(y, dtype=float) * sy

        xa0, xa1 = X(jx[0]), X(jx[1])
        ya0, ya1 = Y(jy[0]), Y(jy[1])
        lp = 0.6
        # paksi
        if jy[0] <= 0 <= jy[1]:
            ax.annotate("", xy=(min(xa1 + lp, W - 0.2), oy), xytext=(max(xa0 - 0.3, 0.2), oy),
                        arrowprops=dict(arrowstyle="-|>", lw=1.6, color="black",
                                        mutation_scale=14), zorder=5)
            ax.text(min(xa1 + lp, W - 0.2), oy + 0.25, asas.mt(spec.get("label_x", "*x*")),
                    ha="right", va="bottom", zorder=8, bbox=asas.KOTAK_PUTIH)
        if jx[0] <= 0 <= jx[1]:
            ax.annotate("", xy=(ox, min(ya1 + lp, H - 0.2)), xytext=(ox, max(ya0 - 0.3, 0.2)),
                        arrowprops=dict(arrowstyle="-|>", lw=1.6, color="black",
                                        mutation_scale=14), zorder=5)
            ax.text(ox + 0.25, min(ya1 + lp, H - 0.2), asas.mt(spec.get("label_y", "*y*")),
                    ha="left", va="top", zorder=8, bbox=asas.KOTAK_PUTIH)
        tx = float(spec.get("tick_x", 1))
        ty = float(spec.get("tick_y", 1))
        for v in asas.julat_tick(jx[0], jx[1], tx):
            if abs(v) < 1e-12:
                continue
            ax.plot([X(v)] * 2, [oy - 0.12, oy + 0.12], color="black", lw=1.4, zorder=6)
            ax.text(X(v), oy - 0.2, asas._nombor(v), ha="center", va="top", zorder=8,
                    bbox=asas.KOTAK_PUTIH)
        for v in asas.julat_tick(jy[0], jy[1], ty):
            if abs(v) < 1e-12:
                continue
            ax.plot([ox - 0.12, ox + 0.12], [Y(v)] * 2, color="black", lw=1.4, zorder=6)
            ax.text(ox - 0.2, Y(v), asas._nombor(v), ha="right", va="center", zorder=8,
                    bbox=asas.KOTAK_PUTIH)
        if jx[0] <= 0 <= jx[1] and jy[0] <= 0 <= jy[1]:
            ax.text(ox - 0.15, oy - 0.15, "O", ha="right", va="top", zorder=8,
                    bbox=asas.KOTAK_PUTIH)
        for g in spec.get("garis", []) or []:
            if "persamaan" in g:
                a, b = g.get("julat_x", jx)
                x = np.linspace(a, b, 600)
                y = asas.fungsi(g["persamaan"])(x)
                ax.plot(X(x), Y(y), color="black", lw=asas.LW_GRAF, zorder=4)
            elif "titik" in g:
                p = np.array(g["titik"], dtype=float)
                ax.plot(X(p[:, 0]), Y(p[:, 1]), color="black", lw=asas.LW_GRAF, zorder=4)
        for t in spec.get("titik", []) or []:
            ax.plot([X(t["x"])], [Y(t["y"])], "x", color="black", ms=8, mew=2, zorder=9)
            if t.get("label"):
                ax.text(X(t["x"]) + 0.2, Y(t["y"]) + 0.2, asas.mt(t["label"]), zorder=9,
                        bbox=asas.KOTAK_PUTIH)
    # tanpa 'tight' supaya saiz kertas tepat
    return asas.simpan(fig, laluan, ketat=False)
