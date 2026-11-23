"""Gelung sasaran muka surat: bina → PDF → kira → laras faktor → ulang."""
from __future__ import annotations

from dataclasses import dataclass, field

FAKTOR_MIN = 0.3   # di bawah ini ruang jawapan dianggap "dibuang"
FAKTOR_MAX = 3.0


@dataclass
class Hasil:
    muka: int
    faktor_ruang: float
    faktor_rajah: float
    tepat: bool
    nota: str
    sejarah: list = field(default_factory=list)


def cari(bina_dan_kira, sasaran: int, faktor_rajah_pilihan=(1.0, 0.9, 0.8),
         lelaran: int = 8, log=print) -> Hasil:
    """bina_dan_kira(faktor_ruang, faktor_rajah) -> bilangan muka surat.

    Muka surat bertambah secara monoton dengan faktor_ruang, jadi carian binari
    digunakan untuk faktor TERBESAR yang memberi ≤ sasaran (lebih banyak ruang jawapan).
    """
    sejarah = []
    cache = {}

    def kira(fr, fj):
        k = (round(fr, 4), fj)
        if k not in cache:
            cache[k] = bina_dan_kira(fr, fj)
            sejarah.append((fr, fj, cache[k]))
            log(f"  faktor ruang {fr:.3f}, rajah {fj:.2f} → {cache[k]} muka surat")
        return cache[k]

    terbaik = None
    for fj in faktor_rajah_pilihan:
        n1 = kira(1.0, fj)
        if n1 == sasaran:
            # cuba besarkan ruang selagi kekal sasaran
            lo, hi = 1.0, FAKTOR_MAX
            if kira(hi, fj) == sasaran:
                return Hasil(sasaran, hi, fj, True, "tepat", sejarah)
            for _ in range(lelaran - 2):
                mid = (lo + hi) / 2
                if kira(mid, fj) <= sasaran:
                    lo = mid
                else:
                    hi = mid
            return Hasil(sasaran, lo, fj, True, "tepat", sejarah)
        if n1 < sasaran:
            lo, hi = 1.0, FAKTOR_MAX
            nhi = kira(hi, fj)
            if nhi < sasaran:
                return Hasil(nhi, hi, fj, False,
                             f"Kandungan terlalu sedikit: walaupun ruang jawapan ×{hi:.1f}, "
                             f"hanya {nhi} muka surat.", sejarah)
        else:
            lo, hi = FAKTOR_MIN, 1.0
            nlo = kira(lo, fj)
            if nlo > sasaran:
                if terbaik is None or nlo < terbaik.muka:
                    terbaik = Hasil(nlo, lo, fj, False, "", sejarah)
                continue  # cuba kecilkan rajah
        # carian binari: faktor terbesar dengan muka <= sasaran
        for _ in range(lelaran):
            mid = (lo + hi) / 2
            if kira(mid, fj) <= sasaran:
                lo = mid
            else:
                hi = mid
        n = kira(lo, fj)
        if n == sasaran:
            return Hasil(n, lo, fj, True, "tepat", sejarah)
        # tidak tepat (lompatan diskret) — pilih paling hampir
        calon = min(((abs(m - sasaran), -fr, fr, f, m) for fr, f, m in sejarah if f == fj))
        _, _, fr, f, m = calon
        return Hasil(m, fr, f, False,
                     f"Tiada faktor memberi tepat {sasaran}; paling hampir {m} muka surat "
                     "(kandungan melompat ke muka surat baharu sebagai satu blok).", sejarah)
    terbaik.nota = (f"Sasaran {sasaran} tidak dapat dicapai tanpa membuang ruang jawapan: "
                    f"dengan ruang jawapan minimum (×{FAKTOR_MIN}) dan rajah dikecilkan "
                    f"×{terbaik.faktor_rajah:.2f}, masih {terbaik.muka} muka surat. "
                    "Rajah besar, kertas graf saiz penuh dan pemisah halaman wajib "
                    "(cth. Bahagian C) mengambil ruang tetap.")
    terbaik.sejarah = sejarah
    return terbaik
