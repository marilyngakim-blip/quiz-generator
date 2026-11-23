"""Skema JSON kertas soalan, prompt sistem untuk Claude, dan normalisasi/validasi."""
from __future__ import annotations

JENIS_RAJAH = ["graf_fungsi", "graf_laju_masa", "graf_jarak_masa", "graf_garis_lurus",
               "kertas_graf", "satah_cartes", "venn", "graf_berpemberat", "rajah_pokok",
               "plot_titik", "garis_nombor", "plot_kotak", "gambar_hiasan"]
RUANG = ["kosong", "jadual", "rajah", "kertas_graf", "tiada"]

PROMPT_SISTEM = r"""
Anda ialah juruteknik penaip kertas soalan Matematik SPM (Kertas 2). Tugas anda: baca imej
halaman kertas soalan dan keluarkan kandungannya sebagai JSON berstruktur sahaja (tiada teks
lain, tiada ```), supaya sistem boleh menaip semula kertas itu dengan bersih untuk difotostat.

PERATURAN KANDUNGAN
1. Kekalkan BAHASA MELAYU SAHAJA. Buang semua teks Bahasa Inggeris (terjemahan dwibahasa,
   "Diagram", "Answer", "marks", "Table" dsb.).
2. Abaikan: halaman kosong, kulit depan, "Maklumat untuk calon", senarai rumus, pengepala/
   pengaki, kod kertas, "Untuk kegunaan pemeriksa", "HALAMAN KOSONG", serta ruang jawapan
   kosong (ruang jawapan dijana semula oleh sistem; anda hanya menyatakan JENISNYA).
3. Betulkan kesalahan taip yang JELAS sahaja dan senaraikan setiap pembetulan dalam
   "pembetulan" (contoh: "Soalan 3(b): 'jarah' → 'jarak'"). Jangan ubah nilai matematik.
4. Jika ada bahagian yang tidak kelihatan/hilang (halaman tiada, rajah terpotong, kertas graf
   tidak disertakan), catat dalam "hilang".

MARKUP TEKS
- **tebal**, *condong* untuk pemboleh ubah (*x*, *y*, *k*, *v*, *t*).
- Gunakan Unicode untuk kuasa/subskrip mudah: x², m s⁻¹, kmj⁻¹, x₁, °, π, ≤, ≥, ≠, −, ×, ÷.
- Baris baharu "\n" memisahkan perenggan; baris bermula "- " ialah senarai bertitik.
- Persamaan yang memerlukan susun atur (pecahan, matriks, vektor lajur, punca kuasa) disimpan
  sebagai objek LaTeX dalam senarai teks:
     "teks": ["Hitung ", {"latex": "\\dfrac{150}{W}"}, " apabila *W* = 5."]
  Persamaan berdiri sendiri pada baris tengah: {"latex": "...", "papar": true}.
  Matriks: \begin{pmatrix} 3 & -2 \\ 1 & 4 \end{pmatrix}. Teks biasa dalam LaTeX: \text{...}.

SKEMA
{
  "tajuk": "MATEMATIK\nKertas 2",
  "bahagian": [
    {"nama": "Bahagian A", "markah": 40, "arahan": "Jawab **semua** soalan dalam bahagian ini.",
     "soalan": [
       {"no": 1, "halaman": [2, 3],
        "teks": "...",                       // boleh "" jika soalan terus bermula dengan (a)
        "rajah": [ <rajah> ], "jadual": [ <jadual> ],
        "markah": 3,                         // hanya jika soalan TIADA ceraian
        "ruang_jawapan": "kosong",           // hanya jika soalan TIADA ceraian
        "ceraian": [
          {"label": "(a)", "teks": "...", "markah": 2,
           "ruang_jawapan": "kosong" | "jadual" | "rajah" | "kertas_graf",
           "rajah": [...], "jadual": [...],
           "ceraian": [ {"label": "(i)", "teks": "...", "markah": 1, "ruang_jawapan": "kosong"} ]}
        ]}
     ]}
  ],
  "pembetulan": ["..."],
  "hilang": ["..."]
}
- "markah" diletakkan pada ceraian paling dalam (yang ada "[x markah]").
- ruang_jawapan = "jadual"/"rajah" bermaksud ruang jawapan asal mengandungi jadual/rajah untuk
  dilengkapkan murid: letakkan jadual/rajah itu dalam ceraian yang sama (sel untuk diisi
  murid ditanda {"kosong": true}). "kertas_graf" jika murid perlu menjawab pada kertas graf;
  jika kertas graf berskala dicetak dalam kertas asal, sertakan "kertas_graf": <rajah kertas_graf>.

<jadual>
{"baris": [[sel, sel, ...], ...], "kapsyen": "Jadual 5", "lebar_lajur_cm": [3, 2, 2],
 "tajuk_baris": 1}
 sel = "teks" atau {"teks": "...", "rowspan": 2, "colspan": 2, "kosong": true, "tebal": true}
 Sel yang diliputi oleh rowspan/colspan TIDAK ditulis semula pada baris berikutnya.

<rajah>  — SPESIFIKASI untuk dilukis semula (BUKAN gambar). Setiap rajah ada:
 "jenis", "kapsyen" (cth "Rajah 3"), "halaman" (nombor halaman asal),
 "kotak": [x0, y0, x1, y1] (pecahan 0–1 lebar/tinggi halaman, dari bucu kiri atas — lokasi
 rajah pada halaman asal untuk semakan guru), "lebar_cm"/"tinggi_cm" anggaran saiz asal.
 Jenis dan medan:
 • graf_fungsi: "persamaan" (sintaks Python/caret: "x^3 - 4x + 3"), "julat_x", "julat_y",
   "label_x", "label_y", "label_lengkung", "titik": [{"x","y","label","kedudukan"}],
   "garis_putus": [{"dari": [x,y], "ke": [x,y]}], "tick_x", "tick_y" (kosong = lakaran);
   beberapa lengkung: "lengkung": [{"persamaan","julat_x","label"}].
   kedudukan ∈ kanan, kiri, atas, bawah, atas_kanan, atas_kiri, bawah_kanan, bawah_kiri.
 • graf_laju_masa / graf_jarak_masa: "titik": [[t, v], ...], "tick_x", "tick_y" (nombor atau
   {"nilai": 14, "label": "*t*"}), "label_x": "Masa (s)", "label_y": "Laju (m s⁻¹)",
   "putus_ke_paksi": true, "label_segmen": [{"segmen": i, "teks"}].
 • graf_garis_lurus: "julat_x", "julat_y", "garis": [{"persamaan": "2x+1" | "dua_titik":
   [[x,y],[x,y]] | "menegak": 3, "label", "putus"}], "grid": true, "tick_x": 1, "tick_y": 1.
 • kertas_graf: "lebar_cm", "tinggi_cm", "kecil_mm": 2, "besar_cm": 1, "skala_x"/"skala_y"
   (cm per unit), "julat_x", "julat_y", "tick_x", "tick_y", "label_x", "label_y",
   "garis": [{"persamaan"} | {"titik": [[x,y],...]}] (garis yang SUDAH dilukis), "titik".
 • satah_cartes: "julat_x", "julat_y", "unit_cm", "tick": 2, "poligon": [{"bucu": [[x,y],...],
   "label_bucu": ["A","B","C"], "lorek": bool, "label", "putus": bool}], "titik", "garis".
 • venn: "set": [{"label": "P"}, ...] (2 atau 3), "nilai": {"P": "5", "PQ": "2", "PQR": "*x*",
   "luar": "4"} (kunci = set yang mengandungi rantau itu), "xi": "ξ", "lorek": ["PQ"].
 • graf_berpemberat: "bucu": [{"nama","x","y"}], "tepi": [{"dari","ke","pemberat","berarah"}].
 • rajah_pokok: "cabang": [{"label","kebarangkalian","kosong": bool,"cabang": [...]}],
   "tajuk_peringkat": [...]. Kotak kosong untuk diisi murid → "kosong": true.
 • plot_titik: "nilai": [...], "julat", "tick", "label_x".
 • garis_nombor: "julat", "tick", "titik": [{"x","jenis": "penuh"|"kosong","label"}],
   "selang": [{"dari","ke","tutup_kiri","tutup_kanan"}] ("+"/"-" = infiniti).
 • plot_kotak: "min","q1","median","q3","maks","julat","tick","label_x" (atau "kotak": [...]).
 • gambar_hiasan: untuk gambar/ilustrasi yang tidak boleh dilukis semula sebagai graf
   (objek 3D, gambar orang, peta, bentuk geometri rumit). Wajib "halaman" dan "kotak" yang
   TEPAT mengelilingi gambar (tanpa kapsyen), "lebar_cm".
Jika ragu-ragu antara jenis, pilih yang paling hampir; jika tiada yang sesuai, guna gambar_hiasan.
"""


def _nod(node, laluan, amaran, aras):
    node.setdefault("teks", "")
    for k in ("rajah", "jadual", "ceraian"):
        v = node.get(k)
        if v is None:
            continue
        if isinstance(v, dict):
            node[k] = [v]
    for r in node.get("rajah", []) or []:
        if r.get("jenis") not in JENIS_RAJAH:
            amaran.append(f"{laluan}: jenis rajah tidak dikenali '{r.get('jenis')}' → gambar_hiasan")
            r["jenis"] = "gambar_hiasan"
        if r["jenis"] == "gambar_hiasan" and not r.get("kotak"):
            amaran.append(f"{laluan}: gambar_hiasan tanpa 'kotak'")
    ruang = node.get("ruang_jawapan")
    if ruang and ruang not in RUANG:
        amaran.append(f"{laluan}: ruang_jawapan '{ruang}' tidak sah → kosong")
        node["ruang_jawapan"] = "kosong"
    if ruang in ("jadual", "rajah") and not node.get(ruang):
        amaran.append(f"{laluan}: ruang_jawapan '{ruang}' tetapi tiada {ruang} diberi")
    ceraian = node.get("ceraian") or []
    if not ceraian and node.get("markah") in (None, "") and aras > 0:
        amaran.append(f"{laluan}: tiada markah")
    for c in ceraian:
        _nod(c, f"{laluan}{c.get('label', '')}", amaran, aras + 1)


def normalkan(data: dict) -> tuple[dict, list[str]]:
    """Isi medan lalai dan kumpul amaran. Tidak membuang kandungan."""
    amaran: list[str] = []
    data.setdefault("tajuk", "")
    data.setdefault("bahagian", [])
    data.setdefault("pembetulan", [])
    data.setdefault("hilang", [])
    for bh in data["bahagian"]:
        bh.setdefault("soalan", [])
        for s in bh["soalan"]:
            _nod(s, f"Soalan {s.get('no')}", amaran, 0)
            if not s.get("ceraian") and s.get("markah") in (None, ""):
                amaran.append(f"Soalan {s.get('no')}: tiada markah")
    return data, amaran


# Templat untuk borang "lukis semula" dalam Streamlit (guru ubah nilai sahaja).
TEMPLAT = {
    "graf_fungsi": {"persamaan": "x^2 - 2x - 3", "julat_x": [-2, 4], "label_lengkung": "*y* = *x*² − 2*x* − 3",
                    "titik": [{"x": 3, "y": 0, "label": "3", "kedudukan": "bawah_kanan"}],
                    "garis_putus": [], "lebar_cm": 8, "tinggi_cm": 7},
    "graf_laju_masa": {"titik": [[0, 0], [4, 12], [10, 12], [14, 0]], "tick_x": [4, 10, 14],
                       "tick_y": [12], "label_x": "Masa (s)", "label_y": "Laju (m s⁻¹)",
                       "lebar_cm": 10, "tinggi_cm": 6},
    "graf_jarak_masa": {"titik": [[0, 0], [2, 60], [3, 60], [5, 0]], "tick_x": [2, 3, 5],
                        "tick_y": [60], "label_x": "Masa (minit)", "label_y": "Jarak (km)",
                        "lebar_cm": 10, "tinggi_cm": 6},
    "graf_garis_lurus": {"julat_x": [-2, 6], "julat_y": [-3, 8],
                         "garis": [{"persamaan": "2x + 1", "label": "*y* = 2*x* + 1"}],
                         "grid": True, "lebar_cm": 8},
    "kertas_graf": {"lebar_cm": 16, "tinggi_cm": 22, "kecil_mm": 2, "besar_cm": 1},
    "satah_cartes": {"julat_x": [-6, 6], "julat_y": [-4, 6], "unit_cm": 0.75, "tick": 2,
                     "poligon": [{"bucu": [[1, 1], [3, 1], [3, 4]], "label_bucu": ["A", "B", "C"],
                                  "lorek": True}]},
    "venn": {"set": [{"label": "P"}, {"label": "Q"}], "nilai": {"P": "5", "PQ": "2", "Q": "3",
                                                                "luar": "4"},
             "lorek": [], "lebar_cm": 8, "tinggi_cm": 5.5},
    "graf_berpemberat": {"bucu": [{"nama": "P", "x": 0, "y": 0}, {"nama": "Q", "x": 4, "y": 2},
                                  {"nama": "R", "x": 8, "y": 0}],
                         "tepi": [{"dari": "P", "ke": "Q", "pemberat": "5"},
                                  {"dari": "Q", "ke": "R", "pemberat": "7"}], "lebar_cm": 9},
    "rajah_pokok": {"cabang": [{"label": "M", "kebarangkalian": "3/5",
                                "cabang": [{"label": "M", "kosong": True},
                                           {"label": "H", "kebarangkalian": "1/2"}]},
                               {"label": "H", "kebarangkalian": "2/5",
                                "cabang": [{"label": "M", "kebarangkalian": "3/4"},
                                           {"label": "H", "kosong": True}]}]},
    "plot_titik": {"nilai": [2, 3, 3, 4, 4, 4, 5], "julat": [0, 8], "label_x": ""},
    "garis_nombor": {"julat": [-3, 5], "selang": []},
    "plot_kotak": {"min": 12, "q1": 18, "median": 24, "q3": 30, "maks": 41, "julat": [10, 45],
                   "tick": 5, "label_x": ""},
}
