#!/usr/bin/env python3
"""
Jana fail Excel (.xlsx) untuk diimport ke Kahoot:
Matematik SPM Kertas 1 (1449/1) – 15 soalan aneka pilihan, 4 pilihan jawapan.

Format sebenar Kertas 1 KSSM: soalan objektif, 4 pilihan (A–D), satu jawapan betul,
meliputi topik Tingkatan 1–5. Kuiz ini mengambil 15 soalan gaya SPM daripada topik utama
Tingkatan 4 & 5 (serta asas Tingkatan 1–3 yang kerap keluar).

Cara guna:
    python3 kahoot/jana_kahoot_spm_matematik_k1.py
    -> kahoot/Kahoot_Matematik_SPM_Kertas1.xlsx

Import ke Kahoot:
    Create -> Kahoot -> Add question -> Import spreadsheet -> pilih fail .xlsx ini.

Had Kahoot yang disemak oleh skrip:
    soalan <= 120 aksara, jawapan <= 75 aksara,
    masa = 5/10/20/30/60/90/120/240 saat, jawapan betul = 1–4.
"""

from fractions import Fraction
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

TAJUK = "Matematik SPM Kertas 1 (1449/1) – Latihan Kahoot"
FAIL_OUTPUT = Path(__file__).with_name("Kahoot_Matematik_SPM_Kertas1.xlsx")

MASA_SAH = {5, 10, 20, 30, 60, 90, 120, 240}

# (topik, soalan, [jawapan 1-4], masa (saat), nombor jawapan betul 1-4)
SOALAN = [
    ("T1 Angka Bererti",
     "Bundarkan 0.040752 betul kepada tiga angka bererti.",
     ["0.0407", "0.0408", "0.041", "0.04075"], 30, 2),

    ("T1 Bentuk Piawai",
     "Hitung (6.4 × 10⁻³) ÷ (8 × 10⁵) dan ungkapkan jawapan dalam bentuk piawai.",
     ["8 × 10⁻²", "8 × 10²", "8 × 10⁻⁸", "8 × 10⁻⁹"], 60, 4),

    ("T4 Asas Nombor",
     "Ungkapkan 43₈ sebagai nombor dalam asas dua.",
     ["100011₂", "101011₂", "110011₂", "100110₂"], 60, 1),

    ("T4 Fungsi & Persamaan Kuadratik",
     "Selesaikan persamaan kuadratik 2x² − 5x − 3 = 0.",
     ["x = −3, x = ½", "x = ½, x = 3", "x = −½, x = 3", "x = −3, x = −½"], 60, 3),

    ("T3 Indeks",
     "Ringkaskan (2m³n⁻²)⁴ ÷ 4m⁵n⁻³.",
     ["4m⁷n⁵", "4m⁷ / n⁵", "2m⁷ / n⁵", "4m¹⁷ / n¹¹"], 60, 2),

    ("T4 Penaakulan Logik",
     "Antara pernyataan berikut, yang manakah BENAR?",
     ["Semua nombor perdana ialah nombor ganjil",
      "3² = 6 dan √9 = 3",
      "Jika x > 3, maka x > 5",
      "5 ialah faktor bagi 12 atau 7 ialah nombor perdana"], 30, 4),

    ("T4 Operasi Set",
     "n(ξ) = 40, n(P) = 22, n(Q) = 15 dan n(P ∩ Q) = 6. Cari n(P ∪ Q)'.",
     ["3", "6", "9", "31"], 60, 3),

    ("T4 Rangkaian dalam Teori Graf",
     "Sebuah graf tak terarah mempunyai 6 bucu dan 8 tepi. Hitung hasil tambah darjah semua bucu.",
     ["8", "12", "14", "16"], 30, 4),

    ("T4 Ketaksamaan Linear Dua Pemboleh Ubah",
     "Titik manakah memuaskan kedua-dua ketaksamaan y ≤ 2x − 1 dan y > −x?",
     ["(0, 0)", "(1, 3)", "(−1, −4)", "(2, 2)"], 60, 4),

    ("T4 Graf Gerakan",
     "Laju sebuah kereta bertambah secara seragam dari 4 m/s ke 20 m/s dalam 8 s. Hitung pecutannya.",
     ["0.5 m s⁻²", "1 m s⁻²", "2 m s⁻²", "2.5 m s⁻²"], 60, 3),

    ("T4 Sukatan Serakan (Data Tak Terkumpul)",
     "Data: 3, 5, 6, 8, 9, 11, 14. Hitung julat antara kuartil.",
     ["5", "6", "8", "11"], 60, 2),

    ("T4 Kebarangkalian Peristiwa Bergabung",
     "Kotak A: 3 bola merah, 2 biru. Kotak B: 4 merah, 1 biru. Sebiji bola diambil dari setiap kotak. P(kedua-dua merah)?",
     ["3/25", "7/25", "12/25", "7/10"], 90, 3),

    ("T5 Ubahan",
     "y berubah secara langsung dengan kuasa dua x. Diberi y = 18 apabila x = 3. Cari y apabila x = 5.",
     ["30", "50", "75", "90"], 60, 2),

    ("T5 Matriks",
     "Diberi (4  k) + 2(1  3) = (6  11). Cari nilai k.",
     ["5", "7", "9", "11"], 30, 1),

    ("T5 Matematik Pengguna: Insurans",
     "Ko-insurans 80%. Nilai boleh insurans RM400 000, diinsuranskan RM240 000. Kerugian RM50 000. Pampasan?",
     ["RM37 500", "RM40 000", "RM45 000", "RM50 000"], 90, 1),
]


def semak_jawapan():
    """Kira semula jawapan supaya kunci jawapan pasti betul."""
    def betul(i):
        _, _, pilihan, _, k = SOALAN[i]
        return pilihan[k - 1]

    # 1: 0.040752 -> 3 a.b.
    assert betul(0) == f"{float(f'{0.040752:.3g}'):.4f}"
    # 2: 6.4e-3 / 8e5 = 8e-9
    assert abs(6.4e-3 / 8e5 - 8e-9) < 1e-20 and betul(1) == "8 × 10⁻⁹"
    # 3: 43 asas 8 -> asas 2
    assert betul(2) == bin(int("43", 8))[2:] + "₂"
    # 4: punca 2x² − 5x − 3 = 0
    for x in (Fraction(-1, 2), Fraction(3)):
        assert 2 * x * x - 5 * x - 3 == 0
    assert betul(3) == "x = −½, x = 3"
    # 5: (2m³n⁻²)⁴ ÷ 4m⁵n⁻³ = 4 m^7 n^-5
    assert (2 ** 4 // 4, 3 * 4 - 5, -2 * 4 + 3) == (4, 7, -5) and betul(4) == "4m⁷ / n⁵"
    # 6: hanya pernyataan "atau" yang benar (7 perdana)
    assert betul(5).endswith("atau 7 ialah nombor perdana")
    # 7: n(P ∪ Q)' = 40 − (22 + 15 − 6)
    assert betul(6) == str(40 - (22 + 15 - 6))
    # 8: hasil tambah darjah = 2 × tepi
    assert betul(7) == str(2 * 8)
    # 9: titik yang memuaskan kedua-dua ketaksamaan
    titik = {"(0, 0)": (0, 0), "(2, 2)": (2, 2), "(1, 3)": (1, 3), "(−1, −4)": (-1, -4)}
    sah = [t for t, (x, y) in titik.items() if y <= 2 * x - 1 and y > -x]
    assert sah == [betul(8)]
    # 10: pecutan = (20 − 4) / 8
    assert betul(9) == f"{(20 - 4) // 8} m s⁻²"
    # 11: Q1 = nilai ke-2, Q3 = nilai ke-6 (n = 7)
    d = [3, 5, 6, 8, 9, 11, 14]
    assert betul(10) == str(d[5] - d[1])
    # 12: P = 3/5 × 4/5
    p = Fraction(3, 5) * Fraction(4, 5)
    assert betul(11) == f"{p.numerator}/{p.denominator}"
    # 13: y = kx², k = 18/9 = 2
    assert betul(12) == str(18 // 9 * 25)
    # 14: k + 2(3) = 11
    assert betul(13) == str(11 - 6)
    # 15: pampasan = (240000 / (0.8 × 400000)) × 50000
    pampasan = Fraction(240000, 320000) * 50000
    assert betul(14) == f"RM{int(pampasan):,}".replace(",", " ")


def semak_had_kahoot(soalan=None, bilangan=15):
    soalan = SOALAN if soalan is None else soalan
    assert len(soalan) == bilangan, f"Mesti {bilangan} soalan"
    for n, (_, q, pilihan, masa, k) in enumerate(soalan, 1):
        assert len(q) <= 120, f"S{n}: soalan {len(q)} aksara (> 120)"
        assert len(pilihan) == 4, f"S{n}: mesti 4 pilihan"
        assert len(set(pilihan)) == 4, f"S{n}: pilihan berulang"
        for p in pilihan:
            assert len(p) <= 75, f"S{n}: jawapan '{p}' > 75 aksara"
        assert masa in MASA_SAH, f"S{n}: masa {masa} tidak sah"
        assert 1 <= k <= 4, f"S{n}: jawapan betul mesti 1–4"


def bina_xlsx(laluan: Path, soalan=None, tajuk=None):
    """Susun atur sama seperti templat rasmi Kahoot (tajuk lajur di baris 8, data dari B9)."""
    soalan = SOALAN if soalan is None else soalan
    wb = Workbook()
    ws = wb.active
    ws.title = "Sheet1"

    ws["B2"] = "Quiz template"
    ws["B2"].font = Font(bold=True, size=16)
    ws["B3"] = tajuk or TAJUK
    ws["B3"].font = Font(bold=True, size=12)
    ws["B4"] = ("Import: Kahoot → Create → Add question → Import spreadsheet. "
                "Soalan maks 120 aksara, jawapan maks 75 aksara.")

    tajuk_lajur = [
        "Question - max 120 characters",
        "Answer 1 - max 75 characters",
        "Answer 2 - max 75 characters",
        "Answer 3 - max 75 characters",
        "Answer 4 - max 75 characters",
        "Time limit (sec) – 5, 10, 20, 30, 60, 90, 120, or 240 secs",
        "Correct answer(s) - choose at least one",
    ]
    isi_tajuk = PatternFill("solid", fgColor="46178F")  # ungu Kahoot
    for c, teks in enumerate(tajuk_lajur, start=2):
        sel = ws.cell(row=8, column=c, value=teks)
        sel.font = Font(bold=True, color="FFFFFF")
        sel.fill = isi_tajuk
        sel.alignment = Alignment(wrap_text=True, vertical="center")

    for i, (_, q, pilihan, masa, k) in enumerate(soalan):
        r = 9 + i
        ws.cell(row=r, column=1, value=i + 1)
        ws.cell(row=r, column=2, value=q)
        for j, p in enumerate(pilihan):
            ws.cell(row=r, column=3 + j, value=p)
        ws.cell(row=r, column=7, value=masa)
        ws.cell(row=r, column=8, value=k)
        for c in range(2, 9):
            ws.cell(row=r, column=c).alignment = Alignment(wrap_text=True, vertical="top")

    dv_masa = DataValidation(type="list", formula1='"5,10,20,30,60,90,120,240"', allow_blank=True)
    dv_kunci = DataValidation(type="list", formula1='"1,2,3,4"', allow_blank=True)
    ws.add_data_validation(dv_masa)
    ws.add_data_validation(dv_kunci)
    dv_masa.add("G9:G108")
    dv_kunci.add("H9:H108")

    lebar = {"A": 5, "B": 60, "C": 28, "D": 28, "E": 28, "F": 28, "G": 16, "H": 16}
    for col, w in lebar.items():
        ws.column_dimensions[col].width = w
    ws.row_dimensions[8].height = 45

    # Lembaran kedua untuk guru: topik + jawapan betul (Kahoot hanya membaca lembaran pertama)
    kunci = wb.create_sheet("Kunci Jawapan (Guru)")
    kunci.append(["No", "Topik", "Soalan", "Jawapan Betul", "Huruf"])
    for c in range(1, 6):
        kunci.cell(row=1, column=c).font = Font(bold=True)
    for i, (topik, q, pilihan, _, k) in enumerate(soalan, 1):
        kunci.append([i, topik, q, pilihan[k - 1], "ABCD"[k - 1]])
    for col, w in {"A": 5, "B": 38, "C": 70, "D": 30, "E": 8}.items():
        kunci.column_dimensions[col].width = w

    wb.save(laluan)


if __name__ == "__main__":
    semak_had_kahoot()
    semak_jawapan()
    bina_xlsx(FAIL_OUTPUT)
    print(f"Siap: {FAIL_OUTPUT} ({len(SOALAN)} soalan)")
    agihan = {h: sum(1 for s in SOALAN if s[4] == n) for n, h in enumerate("ABCD", 1)}
    print("Agihan jawapan betul:", agihan)
