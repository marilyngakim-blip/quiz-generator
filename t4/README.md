# Kuiz Matematik Tingkatan 4 – Panduan Guru

Sistem kuiz dalam talian untuk murid Tingkatan 4. Murid log masuk dengan **Kelas → Nama → PIN** di telefon,
menjawab kuiz, dan melihat ranking kelas. Guru melihat papan pemuka, senarai murid yang belum menjawab,
analisis item dan memuat turun markah.

```
Google Sheet (anda)                          GitHub Pages (awam)
├─ Murid  (nama, kelas, PIN)  ─┐             ├─ t4/index.html   ← murid
├─ Kuiz   (tarikh, had masa)   │  Apps Script├─ t4/guru.html    ← guru (kata laluan)
├─ Kunci  (JAWAPAN)            ├─ Web App ◄──┤
├─ Markah, Draf                │             └─ t4/kuiz/*.json  ← soalan SAHAJA
└─ Menu KUIZ T4 ───────────────┘── Terbitkan ──►
```

- **Kunci jawapan dan senarai murid tidak pernah berada di GitHub.** Hanya soalan dihantar ke GitHub.
- Jawapan murid disemak di Google Sheet. Murid hanya nampak jawapan betul selepas kuiz ditutup
  (boleh ditukar bagi setiap kuiz).
- Laman murid hanya memaparkan nama dan kelas. Tiada No. KP atau maklumat peribadi lain.

Masa persediaan: kira-kira 30 minit, sekali sahaja.

---

## Langkah 1 – Cipta Google Sheet

1. Buka <https://sheets.new> (gunakan akaun Google yang akan menjadi "pemilik" sistem).
2. Namakan Sheet: **Kuiz Matematik T4**.
3. **File → Settings → Time zone**: pilih **(GMT+08:00) Kuala Lumpur** → Save.

## Langkah 2 – Tampal kod Apps Script

1. Dalam Sheet: **Extensions → Apps Script**.
2. Padam semua kod dalam `Code.gs`.
3. Buka fail [`t4/apps-script/Code.gs`](apps-script/Code.gs) di GitHub → butang **Copy raw file** (ikon salin) →
   tampal ke dalam editor Apps Script → **Save** (ikon disket).
4. Kiri: **Project Settings** (ikon gear) → **Time zone** = *(GMT+08:00) Kuala Lumpur*.
5. Kembali ke tab Sheet dan **muat semula** halaman. Menu **KUIZ T4** muncul (tunggu ±10 saat).
6. **KUIZ T4 → 1. Sediakan Sheet (kali pertama)**. Google akan meminta kebenaran:
   *Review permissions* → pilih akaun anda → *Advanced* → *Go to … (unsafe)* → **Allow**.
   (Amaran ini biasa bagi skrip yang anda tulis sendiri.)
7. Tab **Murid, Kuiz, Input Kuiz, Kunci, Markah, Draf, Import Murid** kini wujud.

## Langkah 3 – Kata laluan guru

1. Apps Script → **Project Settings** → bahagian bawah **Script properties** → **Add script property**.
2. Property: `GURU_PASSWORD` · Value: kata laluan pilihan anda (sekurang-kurangnya 8 aksara) → **Save**.

Kata laluan ini untuk laman `guru.html`. Ia hanya disimpan dalam Script properties, bukan di GitHub.

## Langkah 4 – Deploy Web App

1. Apps Script → butang biru **Deploy → New deployment**.
2. Ikon gear di sebelah *Select type* → **Web app**.
3. Isi:
   - Description: `Kuiz T4`
   - Execute as: **Me**
   - Who has access: **Anyone**
4. **Deploy** → salin **Web app URL** (berakhir dengan `/exec`).
5. **Project Settings → Script properties** → tambah `WEBAPP_URL` = URL tadi.

> **Selepas mengubah `Code.gs` pada masa depan:** **Deploy → Manage deployments → ✏️ Edit → Version:
> New version → Deploy**. URL kekal sama.

## Langkah 5 – Token GitHub (supaya Sheet boleh menerbitkan kuiz)

1. GitHub → gambar profil → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. Isi:
   - Token name: `Kuiz T4`
   - Expiration: 1 tahun (tetapkan peringatan untuk menjana semula)
   - Repository access: **Only select repositories → quiz-generator**
   - Permissions → Repository permissions → **Contents: Read and write** (yang lain biarkan)
3. **Generate token** → salin token (hanya dipaparkan sekali).
4. Apps Script → **Script properties** → tambah:

| Property | Nilai |
|---|---|
| `GITHUB_TOKEN` | token tadi |
| `GITHUB_REPO` | `marilyngakim-blip/quiz-generator` |

Jangan kongsi token, Script properties atau Sheet ini dengan murid.

## Langkah 6 – Hidupkan GitHub Pages

Jika laman `https://marilyngakim-blip.github.io/quiz-generator/` sudah berfungsi, langkah ini sudah siap.
Jika belum: repo → **Settings → Pages** → Source: *Deploy from a branch* → Branch **main**, folder
**/ (root)** → **Save**.

Laman murid: `https://marilyngakim-blip.github.io/quiz-generator/t4/`
Laman guru: `https://marilyngakim-blip.github.io/quiz-generator/t4/guru.html`

## Langkah 7 – Import senarai murid

1. Dari Excel / APDM, salin senarai murid **termasuk baris tajuk** (perlu ada lajur **Nama** dan
   **Kelas**; lajur lain seperti No. KP akan diabaikan).
2. Tampal di sel **A1** tab **Import Murid**.
3. **KUIZ T4 → Import senarai murid**.
   - Murid baharu ditambah ke tab **Murid** dengan IDMurid (M0001, M0002, …) dan PIN 4 digit rawak.
   - Murid yang sudah ada (nama + kelas sama) dilangkau.
   - Tab Import Murid dikosongkan selepas itu (maklumat peribadi lain tidak disimpan).
   - Jika tiada lajur Kelas, anda akan diminta menaip nama kelas.
4. Ulang untuk setiap kelas jika senarai berasingan.

Nama kelas (cth `4 Bestari`) dipaparkan kepada murid seperti yang ditulis dalam tab Murid.

**Mengedarkan PIN:** dalam tab Murid, **Data → Create a filter** → tapis lajur Kelas → cetak atau salin
Nama + PIN, dan berikan kepada setiap murid secara peribadi.

- **KUIZ T4 → Jana PIN rawak**: *YES* = jana PIN untuk murid yang belum ada PIN sahaja;
  *NO* = jana PIN baharu untuk SEMUA murid (sesi lama tamat; murid perlu log masuk semula).
- Murid lupa PIN: lihat tab Murid, atau padam PIN murid itu dan jalankan *Jana PIN rawak → YES*.
- Murid berpindah: tukar lajur **Aktif** kepada `T` (rekod markah lama kekal).
- Lima PIN salah berturut-turut → log masuk murid itu dikunci 5 minit.

## Langkah 8 – Terbitkan kuiz pertama

**Cuba dahulu dengan data contoh** (2 kelas × 5 murid palsu, 10 soalan Matematik T4):
**KUIZ T4 → Masukkan data contoh** → **KUIZ T4 → Terbitkan kuiz ke GitHub** → *YES* (buka sekarang).
Log masuk sebagai murid palsu (PIN di tab Murid, IDMurid M9001–M9010). Padam baris murid palsu dan
baris markah mereka sebelum kegunaan sebenar. (Jawapan kuiz contoh ada dalam `Code.gs` kerana ia hanya
untuk latihan. Jangan gunakan kuiz contoh untuk penilaian sebenar.)

**Kuiz sebenar:**

1. **KUIZ T4 → Kosongkan Input Kuiz**.
2. Tab **Input Kuiz**:
   - **B1** tajuk, cth `Matematik T4 Bab 1 Fungsi dan Persamaan Kuadratik`
   - **B2** topik, cth `1.1 – 1.2`
   - Soalan bermula **A7**: `Question | A | B | C | D | Answer | Marks | Gambar`
     (Answer = A/B/C/D; Marks kosong = 1; Gambar = pautan Google Drive, pilihan)
3. **KUIZ T4 → Terbitkan kuiz ke GitHub** → semak kotak pengesahan → *YES*.
4. Soalan baharu: *Buka kuiz sekarang?* *YES* = dibuka 7 hari untuk semua kelas; *NO* = isi tarikh sendiri.
5. Tunggu mesej **BERJAYA**. Laman dikemas kini dalam ±1 minit.

Menerbitkan tajuk yang sama sekali lagi **menggantikan** soalan dan kunci kuiz itu (markah lama kekal).
Jangan ubah susunan soalan selepas murid mula menjawab.

### Tetapan setiap kuiz (tab Kuiz)

| Lajur | Maksud | Contoh |
|---|---|---|
| Buka / Tutup | Tarikh-masa kuiz dibuka/ditutup. Buka kosong = belum dibuka. | `2026-11-10 08:00` |
| Had masa (minit) | Kosong = tiada had. Ada had → pemasa dipaparkan dan jawapan dihantar automatik bila tamat. | `30` |
| Kelas sasaran | `Semua`, atau senarai dipisah koma | `4 Bestari, 4 Cemerlang` |
| Cubaan dibenarkan | Bilangan cubaan. `0` = tanpa had. | `3` |
| Ranking guna | `Pertama` (lalai) atau `Terbaik` – cubaan yang dikira untuk ranking & statistik | `Pertama` |
| Tunjuk jawapan | `Selepas tutup` (lalai) atau `Serta-merta` | `Selepas tutup` |

Perubahan dalam tab Kuiz/Murid berkesan dalam masa ±1 minit. **KUIZ T4 → Kemas kini laman sekarang**
menjadikannya serta-merta.

**Buka/Tutup pantas:** klik satu baris kuiz dalam tab Kuiz → **KUIZ T4 → Buka kuiz** atau **Tutup kuiz**.

### Gambar soalan

Muat naik gambar ke Google Drive (akaun yang sama) → klik kanan → *Copy link* → tampal di lajur **H**.
Semasa Terbitkan, gambar disalin ke GitHub (maks 5 MB setiap satu). Jika mesej *Masa hampir tamat*
muncul (banyak gambar), klik Terbitkan sekali lagi: gambar yang siap tidak dimuat naik semula.

### Import dari Google Form

1. Buka Google Form kuiz anda untuk diedit; salin pautan dari bar alamat (`…/forms/d/…/edit`).
2. **KUIZ T4 → Import dari Google Form** → tampal → OK.
3. Soalan aneka pilihan 4-pilihan yang ada kunci jawapan disalin ke Input Kuiz, termasuk gambar
   (disimpan dalam folder Drive *Kuiz T4 – Gambar*). Mesej akhir menyenaraikan soalan yang dilangkau.
4. Semak B1/B2 → **Terbitkan kuiz ke GitHub**.

---

## Apa yang murid lihat

1. **Log masuk:** pilih Kelas → pilih Nama → PIN. Sesi disimpan dalam pelayar (bukan PIN) selama 30 hari;
   gunakan *Log keluar* pada komputer bersama.
2. **Muka depan:** kuiz yang dibuka untuk kelasnya, status *Belum dijawab / Sedang dijawab / Sudah dijawab*,
   markah setiap cubaan dan tarikh tutup. Kuiz yang sudah ditutup disenaraikan di bawah.
3. **Kuiz:** satu soalan satu kad, bar kemajuan, senarai nombor soalan, pemasa (jika ada).
   Susunan soalan dan pilihan dirawakkan bagi setiap murid. Jawapan disimpan automatik di Sheet (tab Draf),
   jadi murid boleh sambung di telefon lain.
4. **Selepas hantar:** markah, peratus, gred SPM, masa diambil, perbandingan dengan cubaan sebelum ini.
   Jawapan betul/salah dipaparkan selepas kuiz ditutup (*Lihat jawapan*), atau serta-merta jika ditetapkan.
5. **Ranking kelas:** 10 teratas + kedudukan murid itu sendiri, bagi setiap kuiz dan keseluruhan.
   Seri: markah sama → masa diambil lebih singkat di atas. Ranking keseluruhan = purata peratus semua kuiz
   kelas itu yang sudah dibuka (kuiz tidak dijawab dikira 0).

## Laman guru (`t4/guru.html`)

| Tab | Isi |
|---|---|
| Papan pemuka | Setiap kuiz × kelas: sudah/belum, % penyertaan, purata, tertinggi, terendah, taburan gred SPM (A+ … G) |
| Belum menjawab | Nama murid yang belum menjawab mengikut kelas. Butang **Salin** (untuk WhatsApp guru kelas) dan **Cetak** |
| Ranking | Ranking penuh setiap kelas + ranking antara kelas (purata kelas) |
| Analisis item | % betul setiap soalan, bilangan murid memilih A/B/C/D, pengganggu paling kerap. Soalan < 50% ditanda |
| Muat turun CSV | Semua cubaan (satu kuiz atau semua) untuk Excel |

Huruf A–D dalam analisis item mengikut susunan asal di Sheet, walaupun murid melihat pilihan dalam susunan rawak.

Skala gred: A+ 90–100, A 80–89, A- 70–79, B+ 65–69, B 60–64, C+ 55–59, C 50–54, D 45–49, E 40–44, G 0–39.

---

## Keselamatan & privasi (PDPA)

- Repo ini **public**: soalan boleh dilihat umum. Kunci jawapan, senarai murid, PIN dan markah kekal
  dalam Google Sheet anda sahaja.
- API tidak memulangkan kunci jawapan sebelum murid menghantar, dan sebelum kuiz ditutup jika
  *Tunjuk jawapan = Selepas tutup*.
- Murid hanya boleh menjawab atas namanya sendiri (sesi bertandatangan digital; sesi tamat jika PIN ditukar).
- Ranking murid hanya memaparkan nama 10 teratas dan markahnya. IDMurid tidak didedahkan.
- Jangan gunakan No. KP sebagai IDMurid. Jangan kongsi Sheet dengan murid.
- `GURU_PASSWORD`, `GITHUB_TOKEN` dan `SESSION_SECRET` (dijana sendiri) hanya dalam Script properties.
  Menukar `SESSION_SECRET` memaksa semua murid log masuk semula.

## Satu kelas menjawab serentak

Sistem direka untuk ±35 murid menghantar serentak: tulisan ke Sheet dikunci (LockService) supaya tiada
markah bertindih, ranking/statistik disimpan dalam cache ±60 saat, draf disimpan sekali setiap beberapa
saat, dan laman cuba semula secara automatik jika pelayan sibuk. Penghantaran berganda (rangkaian
terputus) tidak menambah cubaan.

## Masalah biasa

| Masalah | Penyelesaian |
|---|---|
| Laman: *belum disambungkan ke Google Sheet* | Terbitkan sekurang-kurangnya satu kuiz (menghasilkan `t4/config.js`) |
| Murid tidak nampak kuiz | Semak tab Kuiz: Buka sudah lepas, Tutup belum, Kelas sasaran betul ejaannya |
| *Soalan kuiz tidak sepadan dengan kunci* | Terbitkan semula kuiz (soalan di GitHub dan Kunci di Sheet tidak sama) |
| Perubahan Code.gs tiada kesan | Deploy → Manage deployments → Edit → **New version** |
| *Sesi tamat* | PIN ditukar atau murid dinyahaktifkan; log masuk semula |

## Untuk pembangun: ujian

Ujian menjalankan `Code.gs` sebenar dengan Google Sheet palsu dalam memori (`t4/ujian/gas-mock.js`)
dan menguji laman dalam Chromium (Playwright):

```bash
node t4/ujian/jalankan-semua.js
```

Cuba sistem secara tempatan (data contoh dimasukkan automatik; kata laluan guru `guru123`):

```bash
node t4/ujian/server.js
```

## Fail

| Fail | Fungsi |
|---|---|
| `t4/index.html`, `assets/murid.js` | Log masuk & muka depan murid |
| `t4/kuiz.html`, `assets/kuiz.js` | Menjawab kuiz, keputusan, semakan jawapan |
| `t4/ranking.html`, `assets/ranking.js` | Ranking kelas murid |
| `t4/guru.html`, `assets/guru.js` | Laman guru |
| `t4/assets/t4.css`, `assets/t4.js` | Reka bentuk & fungsi dikongsi |
| `t4/config.js` | URL Web App – dijana oleh Sheet |
| `t4/kuiz/*.json`, `t4/kuiz/img/` | Soalan (tanpa jawapan) & gambar – dijana oleh Sheet |
| `t4/apps-script/Code.gs` | Skrip Google Sheet |
| `t4/ujian/` | Pelayan Apps Script palsu & ujian Playwright |
