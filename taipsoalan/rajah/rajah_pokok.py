"""rajah_pokok — gambar rajah pokok kebarangkalian (kiri → kanan).

{
  "jenis": "rajah_pokok",
  "cabang": [
     {"label": "M", "kebarangkalian": "3/5",
      "cabang": [{"label": "M", "kebarangkalian": "", "kosong": true}, {"label": "H", "kebarangkalian": "2/5"}]},
     {"label": "H", "kebarangkalian": "2/5", "cabang": [...]}
  ],
  "tajuk_peringkat": ["Pilihan pertama", "Pilihan kedua"],
  "lebar_cm": 10
}
"kosong": true → kotak kosong untuk diisi murid (ganti nilai kebarangkalian).
"""
from matplotlib.patches import Rectangle

from . import asas


def _daun(c):
    return sum(_daun(x) for x in c.get("cabang", [])) if c.get("cabang") else 1


def _dalam(c):
    return 1 + max((_dalam(x) for x in c.get("cabang", [])), default=0)


def _kumpulan(c):
    """Bilangan nod yang anaknya semua daun (kumpulan daun)."""
    anak = c.get("cabang") or []
    if anak and all(not a.get("cabang") for a in anak):
        return 1
    return sum(_kumpulan(a) for a in anak) or 1


def lukis(spec, laluan, **_):
    akar = {"cabang": spec["cabang"]}
    n_daun = _daun(akar)
    aras = _dalam(akar) - 1
    W = float(spec.get("lebar_cm", 4.2 * aras + 1.5))
    u, jurang = 1.15, 0.7  # jarak antara daun, jurang tambahan antara kumpulan
    n_kump = _kumpulan(akar)
    H = float(spec.get("tinggi_cm", max(3.5, u * n_daun + jurang * (n_kump - 1) + 0.6
                                         + (0.8 if spec.get("tajuk_peringkat") else 0))))
    fig = asas.rajah_cm(W, H)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, W)
    ax.set_ylim(0, H)
    ax.axis("off")
    langkah = (W - 1.2) / aras
    atas = H - (0.9 if spec.get("tajuk_peringkat") else 0.3)
    bawah = 0.3
    kiraan = [0]
    kump = [0, None]
    langkah_y = (atas - bawah - jurang * (n_kump - 1)) / n_daun

    def susun(c, d, x0, y0):
        if not c.get("cabang"):
            i = kiraan[0]
            kiraan[0] += 1
            return atas - (i + 0.5) * (atas - bawah) / n_daun
        ys = []
        for anak in c["cabang"]:
            y = susun_anak(anak, d + 1)
            ys.append(y)
        return sum(ys) / len(ys)

    kedudukan = {}

    def susun_anak(c, d):
        if c.get("cabang"):
            ys = [susun_anak(a, d + 1) for a in c["cabang"]]
            y = sum(ys) / len(ys)
            if all(not a.get("cabang") for a in c["cabang"]):
                kump[0] += 1
        else:
            i = kiraan[0]
            kiraan[0] += 1
            y = atas - (i + 0.5) * langkah_y - jurang * kump[0]
        kedudukan[id(c)] = (0.2 + d * langkah, y)
        return y

    y_akar = sum(susun_anak(a, 1) for a in akar["cabang"]) / len(akar["cabang"])
    kedudukan[id(akar)] = (0.2, y_akar)

    def lukis_cab(c):
        x0, y0 = kedudukan[id(c)]
        for a in c.get("cabang", []):
            x1, y1 = kedudukan[id(a)]
            xe = x1 - 0.35
            ax.plot([x0 + (0.3 if c is not akar else 0), xe], [y0, y1], color="black", lw=1.8)
            ax.text(x1, y1, asas.mt(a.get("label", "")), ha="center", va="center")
            p = a.get("kebarangkalian", "")
            xm, ym = (x0 + xe) / 2, (y0 + y1) / 2
            naik = y1 >= y0
            if a.get("kosong"):
                lb, tg = 1.1, 0.65
                off = 0.25 if naik else -0.25 - tg
                ax.add_patch(Rectangle((xm - lb / 2, ym + off), lb, tg, fill=True, fc="white",
                                       ec="black", lw=1.3, zorder=5))
            elif p:
                ax.text(xm, ym + (0.22 if naik else -0.22), asas.mt(p), ha="center",
                        va="bottom" if naik else "top", zorder=5, bbox=asas.KOTAK_PUTIH)
            lukis_cab(a)

    lukis_cab(akar)
    for i, t in enumerate(spec.get("tajuk_peringkat", []) or []):
        ax.text(0.2 + (i + 1) * langkah, H - 0.35, asas.mt(t), ha="center", va="center", fontsize=12)
    return asas.simpan(fig, laluan)
