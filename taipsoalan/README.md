# TaipSoalan

Menukar kertas soalan **Matematik SPM Kertas 2** (PDF imbasan, PDF teks, `.doc`, `.docx`) kepada
fail **Word (.docx) yang bersih**, dalam **Bahasa Melayu sahaja**, dengan **rajah dilukis
semula** (hitam, saiz sebenar) dan sedia untuk difotostat.

```
PDF/DOC/DOCX ─► imej halaman ─► Claude (vision) ─► soalan.json ─► SEMAKAN GURU (Streamlit)
                                                                      │
          laporan + contact sheet ◄── semakan akhir ◄── gelung muka surat ◄── bina .docx + rajah
```

## Pemasangan

```bash
pip install -r requirements.txt
```

Alat sistem (Ubuntu/Debian):

```bash
sudo apt-get install -y libreoffice-writer libreoffice-math poppler-utils
```

- `libreoffice-math` **wajib** supaya persamaan (OMML) kelihatan dalam PDF semakan dan
  kiraan muka surat tepat. (Word sendiri memaparkannya tanpa pakej ini.)
- `pdflatex` (pilihan): jika ada, persamaan di luar subset OMML dirender sebagai PNG 300 dpi;
  jika tiada, matplotlib mathtext digunakan.
- Kunci API: `export ANTHROPIC_API_KEY=...` (model lalai `claude-opus-5-5`).

## Penggunaan

### 1. CLI (`main.py`)

```bash
# Ekstrak, berhenti untuk semakan guru
python main.py kertas.pdf --ekstrak-sahaja

# Semak/betulkan dalam Streamlit (lihat di bawah), kemudian bina tepat 16 muka surat
python main.py kertas_kerja/soalan.json --muka-surat 16

# Atau sekali jalan (guna soalan.json sedia ada jika sudah wujud)
python main.py kertas.pdf --muka-surat 16
```

Pilihan penting: `--muka-surat N`, `--model`, `--effort`, `--dpi 170`, `--kumpulan 12`
(halaman setiap panggilan API), `--tanpa-kertas-graf`, `--persamaan-png`,
`--tanpa-muka-baharu-graf`, `--faktor-ruang 1.0`.

Keluaran dalam folder kerja `<nama>_kerja/`:

| Fail | Isi |
|---|---|
| `halaman/h-XX.png` | imej halaman asal (170 dpi) |
| `soalan.json` | hasil ekstrak — **inilah yang disemak/dibetulkan guru** |
| `rajah_png/` | rajah yang dilukis semula (RGB, 300 dpi, saiz sebenar) |
| `*_taip.docx`, `*_taip.pdf` | fail akhir |
| `contact_sheet.png` | semua muka surat dalam satu imej |
| `dua_sehelai/` | 2 muka surat sehelai (~55 dpi) — semak nombor masih boleh dibaca |
| `laporan.md` | jumlah muka surat, semakan markah, pembetulan taip, bahagian hilang, isu |

### 2. Semakan manusia (`app.py`)

```bash
streamlit run app.py
```

Muat naik kertas/JSON → **Ekstrak dengan Claude** → tab *Semak soalan*: imej halaman asal
(serta potongan rajah asal) di kiri, pratonton teks/rajah/jadual di kanan, dan editor JSON
untuk membetulkan teks, koordinat dan nilai. Tab *Bina Word* menjalankan gelung sasaran
muka surat dan memberi pautan muat turun `.docx`/`.pdf` beserta laporan.

### 3. Mod padat fail Word sedia ada (`padat.py`)

```bash
python main.py lama.doc --padat --fon-dari 10 --fon-ke 12 --muka-surat 16
python main.py lama.docx --padat --faktor-padat 0.5 --ganti-imej ganti.json
```

Mengubah XML terus: saiz fon 10→12 pt (atau `--skala-semua-fon`), fon lalai → Times New
Roman, buang pemisah halaman (kecuali sekitar kertas graf saiz penuh ≥ 18 cm), mampatkan
perenggan kosong berturutan dengan faktor F (dicari automatik jika `--muka-surat` diberi),
tukar imej WMF/EMF berwarna → PNG hitam (atau dilukis semula daripada spesifikasi dalam
`ganti.json`: `{"media/image3.wmf": {"jenis": "graf_laju_masa", ...}}`) sambil mengemas kini
`document.xml.rels`, `[Content_Types].xml` dan `wp:extent`/`a:ext`, serta membetulkan nombor
halaman dalam *text frame* sempit pada pengepala/pengaki.

## Skema JSON

Lihat `skema.py` (prompt penuh untuk Claude) dan contoh lengkap `contoh/contoh_kertas2.json`
yang menggunakan setiap jenis rajah.

```json
{
  "tajuk": "MATEMATIK\nKertas 2",
  "bahagian": [
    {"nama": "Bahagian A", "markah": 40, "arahan": "Jawab **semua** soalan.",
     "soalan": [
       {"no": 1, "teks": "...", "rajah": [], "jadual": [],
        "ceraian": [
          {"label": "(a)", "teks": "Hitung *x*.", "markah": 2,
           "ruang_jawapan": "kosong | jadual | rajah | kertas_graf",
           "ceraian": [{"label": "(i)", "teks": "...", "markah": 1}]}
        ]}
     ]}
  ],
  "pembetulan": ["Soalan 3(b): 'jarah' → 'jarak'"],
  "hilang": ["Halaman 14 tiada"]
}
```

**Teks:** `**tebal**`, `*condong*` (pemboleh ubah), Unicode (x², kmj⁻¹, x₁), `\n` = perenggan
baharu, baris `- ...` = senarai bertitik (numbering Word). Persamaan:
`["Hitung ", {"latex": "\\dfrac{150}{W}"}, "."]`; persamaan tengah: `{"latex": "...", "papar": true}`.
LaTeX → **OMML** (persamaan Word asli; subset: pecahan, matriks/vektor, punca, kuasa,
subskrip, `\left( \right)`, `\text{}`, simbol biasa) — di luar subset → PNG 300 dpi.

**Jadual:** `{"baris": [[sel,...]], "kapsyen", "lebar_lajur_cm", "tajuk_baris"}`;
sel = teks atau `{"teks", "rowspan", "colspan", "kosong": true, "tebal"}`.

**Rajah** (spesifikasi, bukan gambar) — satu modul dalam `rajah/` setiap jenis:

| jenis | medan utama |
|---|---|
| `graf_fungsi` | `persamaan`, `julat_x`, `julat_y`, `titik`, `garis_putus`, `label_lengkung`, `tick_x/y` |
| `graf_laju_masa`, `graf_jarak_masa` | `titik` [[t,v]], `tick_x/y` (nombor atau `{"nilai","label":"*v*"}`), `label_x/y` |
| `graf_garis_lurus` | `garis` [{`persamaan` \| `dua_titik` \| `menegak`, `label`, `putus`}], `grid` |
| `kertas_graf` | `lebar_cm`, `tinggi_cm`, `kecil_mm`, `besar_cm`, `skala_x/y` (cm/unit), `julat_x/y`, `garis` |
| `satah_cartes` | `poligon` [{`bucu`, `label_bucu`, `lorek`}], `julat_x/y`, `unit_cm`, `tick` |
| `venn` | `set` (2/3), `nilai` {"P","PQ","PQR","luar"}, `lorek`, `xi` |
| `graf_berpemberat` | `bucu` [{nama,x,y}], `tepi` [{dari,ke,pemberat,berarah}] |
| `rajah_pokok` | `cabang` [{label, kebarangkalian, kosong, cabang}], `tajuk_peringkat` |
| `plot_titik`, `garis_nombor`, `plot_kotak` | nilai/julat/tick; selang; min,q1,median,q3,maks |
| `gambar_hiasan` | `halaman`, `kotak` [x0,y0,x1,y1] (pecahan), `lebar_cm`, `ambang` (175) |

Semua rajah juga boleh ada `kapsyen`, `halaman`, `kotak` (lokasi pada halaman asal untuk
semakan) dan `lebar_cm`/`tinggi_cm`.

## Peraturan lukisan & susun atur

- Rajah dilukis pada **saiz sebenar** (`figsize = cm/2.54`) dan dimasukkan ke Word pada saiz
  fizikal sama → saiz fon rajah = saiz pt sebenar (13 pt tebal; pemboleh ubah condong, sama
  saiz & tebal). Garisan hitam, graf `lw 2.4`, paksi beranak panah, grid besar hitam
  (`lw 1.1`), grid kecil kelabu `0.55` (`lw 0.35`). Nombor paksi berlatar putih di atas
  garisan; label garis dianjak ikut arah normal; poligon di atas grid.
- Kertas graf tidak pernah diskala (2 cm = 1 unit kekal 2 cm).
- Word: A4, margin 1.8 cm, Times New Roman 12 pt, nombor halaman di tengah; indentasi
  `1 | (a) | (i)` dengan tab stop + hanging indent; `[x markah]` di kanan; ruang jawapan
  `600 + 580×markah` twip (maks 3300) × faktor; `keepNext` teks → markah → "Jawapan:";
  jadual `cantSplit` + `keepNext`; Bahagian C bermula muka surat baharu; kertas graf disisip
  pada halaman sendiri selepas soalannya.
- Gelung muka surat: carian binari faktor ruang jawapan (0.3–3.0, terbesar yang muat),
  kemudian kecilkan rajah (0.9, 0.8) jika perlu. Jika sasaran mustahil tanpa membuang ruang
  jawapan, laporan menyatakan jumlah paling hampir dan sebabnya.

## Struktur

```
taipsoalan/
  main.py        CLI
  app.py         Streamlit: muat naik, semak, betulkan, bina, muat turun
  ekstrak.py     input → imej → Claude API → JSON
  skema.py       prompt sistem, skema, normalisasi & amaran
  teks.py        markup teks
  persamaan.py   LaTeX → OMML / PNG
  rajah/         satu modul setiap jenis rajah (+ asas.py gaya bersama)
  bina_docx.py   JSON + PNG → .docx
  sasaran.py     gelung sasaran muka surat
  padat.py       mod padat fail Word sedia ada
  semak.py       PDF, kiraan muka surat, contact sheet, semakan automatik, laporan
  contoh/        JSON contoh untuk ujian
```

Ujian pantas tanpa API:

```bash
python main.py contoh/contoh_kertas2.json --muka-surat 12 --kerja /tmp/ujian_taip
```
