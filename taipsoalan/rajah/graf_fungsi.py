"""graf_fungsi — lakaran graf fungsi (kuadratik, kubik, salingan, ...).

Spesifikasi:
{
  "jenis": "graf_fungsi",
  "persamaan": "x^2 - 2x - 3",            # atau "lengkung": [{"persamaan", "julat_x", "label"}]
  "julat_x": [-2, 4], "julat_y": [-5, 6],  # julat_y pilihan (auto)
  "label_x": "*x*", "label_y": "*y*",
  "label_lengkung": "*y* = *x*² − 2*x* − 3",
  "titik": [{"x": 3, "y": 0, "label": "3", "kedudukan": "bawah_kanan"}],
  "garis_putus": [{"dari": [1, 0], "ke": [1, -4]}],
  "tick_x": [...], "tick_y": [...],        # pilihan; kosong = tiada nombor (lakaran)
  "grid": false, "lebar_cm": 8, "tinggi_cm": 7
}
"""
import numpy as np

from . import asas


def lukis(spec, laluan, **_):
    W = float(spec.get("lebar_cm", 8))
    H = float(spec.get("tinggi_cm", 7))
    fig = asas.rajah_cm(W, H)
    ax = fig.add_axes([0.1, 0.1, 0.8, 0.8])
    lengkung = spec.get("lengkung") or [{"persamaan": spec["persamaan"],
                                         "julat_x": spec.get("julat_x", [-5, 5]),
                                         "label": spec.get("label_lengkung")}]
    xs_semua, ys_semua = [], []
    for lk in lengkung:
        a, b = lk.get("julat_x") or spec.get("julat_x", [-5, 5])
        x = np.linspace(float(a), float(b), 800)
        y = asas.fungsi(lk["persamaan"])(x)
        jy = spec.get("julat_y")
        if jy:
            y = np.where((y < jy[0] - (jy[1] - jy[0])) | (y > jy[1] + (jy[1] - jy[0])), np.nan, y)
        # pecahkan pada asimptot: lompatan tanda dengan magnitud besar
        if np.isfinite(y).sum() > 2:
            julat = np.nanpercentile(np.abs(y), 90) or 1.0
            lompat = (np.abs(np.diff(y)) > 2 * julat) & (np.sign(y[1:]) != np.sign(y[:-1]))
            y[1:][lompat] = np.nan
        ax.plot(x, y, color="black", lw=asas.LW_GRAF, zorder=4, solid_capstyle="round")
        xs_semua.append(x)
        ys_semua.append(y)
        if lk.get("label") and lk.get("kedudukan_label") is None:
            # lalai: label di hujung lengkung, di luar kawasan graf
            ok = np.where(np.isfinite(y))[0]
            jy_ = spec.get("julat_y")
            if jy_ is not None:
                ok = ok[(y[ok] >= jy_[0]) & (y[ok] <= jy_[1])]
            if len(ok):
                i = ok[-1]
                ax.annotate(asas.mt(lk["label"]), xy=(x[i], y[i]), xytext=(6, 0),
                            textcoords="offset points", ha="left", va="center", zorder=8,
                            bbox=asas.KOTAK_PUTIH)
        elif lk.get("label"):
            i = int(len(x) * float(lk.get("kedudukan_label", 0.85)))
            i = min(max(i, 1), len(x) - 2)
            if np.isfinite(y[i]) and np.isfinite(y[i + 1]):
                asas.label_normal(ax, (x[i], y[i]), (x[i + 1], y[i + 1]), lk["label"],
                                  jarak_pt=10, t=0, sisi=int(lk.get("sisi", 1)))
    xa = np.concatenate(xs_semua)
    ya = np.concatenate(ys_semua)
    jx = spec.get("julat_x_paksi") or [min(xa.min(), 0), max(xa.max(), 0)]
    jy = spec.get("julat_y") or [min(np.nanmin(ya), 0), max(np.nanmax(ya), 0)]
    px = 0.08 * (jx[1] - jx[0]) or 1
    py = 0.08 * (jy[1] - jy[0]) or 1
    ax.set_xlim(jx[0] - px, jx[1] + px)
    ax.set_ylim(jy[0] - py, jy[1] + py)
    if spec.get("grid"):
        asas.grid(ax, spec.get("grid_besar", 1), spec.get("grid_besar", 1))
    asas.letak_tick(ax, spec.get("tick_x", []), spec.get("tick_y", []))
    asas.paksi_asal(ax, spec.get("label_x", "*x*"), spec.get("label_y", "*y*"))
    asas.lukis_tambahan(ax, spec)
    return asas.simpan(fig, laluan)
