#!/usr/bin/env python3
"""
Jana fail Excel (.xlsx) untuk diimport ke Kahoot:
Matematik SPM Kertas 1 – 15 soalan gaya SPM (3 soalan bagi setiap topik Tingkatan 4):
  Bab 2  Asas Nombor
  Bab 3  Penaakulan Logik
  Bab 5  Rangkaian dalam Teori Graf
  Bab 8  Sukatan Serakan Data Tak Terkumpul
  Bab 10 Matematik Pengguna: Pengurusan Kewangan

Cara guna:
    python3 kahoot/jana_kahoot_spm_t4_5topik.py
    -> kahoot/Kahoot_Matematik_SPM_T4_5Topik.xlsx

Format Excel dan semakan had Kahoot dikongsi dengan jana_kahoot_spm_matematik_k1.py.
"""

import math
from fractions import Fraction
from pathlib import Path

from jana_kahoot_spm_matematik_k1 import bina_xlsx, semak_had_kahoot

TAJUK = "Matematik SPM Kertas 1 – Asas Nombor, Logik, Rangkaian, Serakan, Kewangan"
FAIL_OUTPUT = Path(__file__).with_name("Kahoot_Matematik_SPM_T4_5Topik.xlsx")

# (topik, soalan, [jawapan 1-4], masa (saat), nombor jawapan betul 1-4)
SOALAN = [
    # ---------- Bab 2: Asas Nombor ----------
    ("Asas Nombor",
     "Ungkapkan 241₅ sebagai nombor dalam asas lapan.",
     ["71₈", "103₈", "105₈", "107₈"], 60, 4),

    ("Asas Nombor",
     "Hitung 10110₂ − 1101₂. Berikan jawapan dalam asas dua.",
     ["1001₂", "1011₂", "1101₂", "10011₂"], 60, 1),

    ("Asas Nombor",
     "Diberi 1p3₈ = 115₁₀. Cari nilai p.",
     ["4", "5", "6", "7"], 60, 3),

    # ---------- Bab 3: Penaakulan Logik ----------
    ("Penaakulan Logik",
     "Antara berikut, yang manakah ialah pernyataan?",
     ["x + 3 = 7", "Tutup pintu itu.", "Berapakah umur kamu?", "16 ialah nombor kuasa dua sempurna"], 30, 4),

    ("Penaakulan Logik",
     "Apakah kontrapositif bagi implikasi \"Jika x = 3, maka 2x = 6\"?",
     ["Jika 2x = 6, maka x = 3", "Jika x ≠ 3, maka 2x ≠ 6",
      "Jika 2x ≠ 6, maka x ≠ 3", "Jika 2x ≠ 6, maka x = 3"], 30, 3),

    ("Penaakulan Logik",
     "Premis 1: Jika P ialah heksagon, maka P mempunyai 6 sisi. Premis 2: P tidak mempunyai 6 sisi. Kesimpulan?",
     ["P ialah heksagon", "P bukan heksagon", "P mempunyai 6 sisi", "P ialah pentagon"], 30, 2),

    # ---------- Bab 5: Rangkaian dalam Teori Graf ----------
    ("Rangkaian",
     "Sebuah graf mempunyai 6 tepi. Darjah empat bucunya ialah 1, 2, 2 dan 3. Cari darjah bucu kelima.",
     ["2", "3", "4", "5"], 60, 3),

    ("Rangkaian",
     "Sebuah pokok mempunyai 9 bucu. Berapakah bilangan tepinya?",
     ["8", "9", "10", "18"], 30, 1),

    ("Rangkaian",
     "Jarak (km): P–Q 4, Q–S 6, P–R 3, R–S 8, Q–R 2. Cari jarak laluan terpendek dari P ke S.",
     ["9 km", "10 km", "11 km", "14 km"], 90, 2),

    # ---------- Bab 8: Sukatan Serakan Data Tak Terkumpul ----------
    ("Sukatan Serakan",
     "Cari julat bagi set data 12, 7, 15, 9, 20, 11.",
     ["8", "11", "13", "20"], 30, 3),

    ("Sukatan Serakan",
     "Hitung varians bagi set data 2, 4, 6, 8.",
     ["2.24", "5", "6.67", "20"], 60, 2),

    ("Sukatan Serakan",
     "Bagi satu set 5 data, Σx = 30 dan Σx² = 210. Hitung sisihan piawai, betul kepada 2 tempat perpuluhan.",
     ["2.45", "6.00", "6.48", "36.00"], 90, 1),

    # ---------- Bab 10: Pengurusan Kewangan ----------
    ("Pengurusan Kewangan",
     "Apakah langkah pertama dalam proses pengurusan kewangan?",
     ["Melaksanakan pelan kewangan", "Menilai kedudukan kewangan",
      "Mengkaji semula dan menyemak kemajuan", "Menetapkan matlamat kewangan"], 30, 4),

    ("Pengurusan Kewangan",
     "Pendapatan RM4 200. Simpanan 10% pendapatan, belanja tetap RM1 800, tidak tetap RM1 350. Aliran tunai?",
     ["RM630", "RM1 050", "RM1 470", "RM2 400"], 90, 1),

    ("Pengurusan Kewangan",
     "Encik Ali mahu menyimpan RM18 000 dalam 3 tahun untuk wang pendahuluan kereta. Simpanan sebulan?",
     ["RM300", "RM400", "RM450", "RM500"], 60, 4),
]


def semak_jawapan():
    """Kira semula setiap jawapan supaya kunci jawapan pasti betul."""
    def betul(i):
        _, _, pilihan, _, k = SOALAN[i]
        return pilihan[k - 1]

    def asas(n, b):
        d = ""
        while n:
            d, n = str(n % b) + d, n // b
        return d

    # Asas nombor
    assert betul(0) == asas(int("241", 5), 8) + "₈"
    assert betul(1) == asas(int("10110", 2) - int("1101", 2), 2) + "₂"
    assert [p for p in range(8) if int(f"1{p}3", 8) == 115] == [int(betul(2))]

    # Penaakulan logik
    assert betul(3).startswith("16 ialah") and math.isqrt(16) ** 2 == 16
    assert betul(4) == "Jika 2x ≠ 6, maka x ≠ 3"   # kontrapositif: ~q -> ~p
    assert betul(5) == "P bukan heksagon"          # bentuk III (modus tollens)

    # Rangkaian
    assert betul(6) == str(2 * 6 - (1 + 2 + 2 + 3))  # jumlah darjah = 2 × tepi
    assert betul(7) == str(9 - 1)                     # pokok: tepi = bucu − 1
    jarak = {("P", "Q"): 4, ("Q", "S"): 6, ("P", "R"): 3, ("R", "S"): 8, ("Q", "R"): 2}
    g = {}
    for (a, b), w in jarak.items():
        g.setdefault(a, {})[b] = w
        g.setdefault(b, {})[a] = w
    terpendek = {"P": 0}
    belum = set(g)
    while belum:  # Dijkstra
        u = min((v for v in belum if v in terpendek), key=terpendek.get)
        belum.remove(u)
        for v, w in g[u].items():
            terpendek[v] = min(terpendek.get(v, math.inf), terpendek[u] + w)
    assert betul(8) == f"{terpendek['S']} km"

    # Sukatan serakan
    d = [12, 7, 15, 9, 20, 11]
    assert betul(9) == str(max(d) - min(d))
    d = [2, 4, 6, 8]
    min_ = Fraction(sum(d), len(d))
    assert betul(10) == str(sum((x - min_) ** 2 for x in d) / len(d))
    varians = Fraction(210, 5) - Fraction(30, 5) ** 2
    assert betul(11) == f"{math.sqrt(varians):.2f}"

    # Pengurusan kewangan
    assert betul(12) == "Menetapkan matlamat kewangan"
    aliran = 4200 - 4200 * 10 // 100 - 1800 - 1350
    assert betul(13) == f"RM{aliran}"
    assert betul(14) == f"RM{18000 // (3 * 12)}"


if __name__ == "__main__":
    semak_had_kahoot(SOALAN, bilangan=15)
    semak_jawapan()
    bina_xlsx(FAIL_OUTPUT, SOALAN, TAJUK)
    print(f"Siap: {FAIL_OUTPUT} ({len(SOALAN)} soalan)")
    agihan = {h: sum(1 for s in SOALAN if s[4] == n) for n, h in enumerate("ABCD", 1)}
    print("Agihan jawapan betul:", agihan)
