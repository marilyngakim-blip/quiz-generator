# Quiz Generator – Kuiz Web (GitHub Pages)

Kuiz aneka pilihan dalam bentuk laman web. Murid menjawab di telefon atau komputer. Selepas
menekan **Hantar**, mereka terus nampak markah, soalan yang betul/salah dan jawapan betul.
Setiap cubaan direkodkan dalam Google Sheet anda.

```
Anda tampal 40 soalan di Google Sheet → menu KUIZ WEB → Terbitkan
        │
        ├── Kunci jawapan disimpan dalam Sheet (tab "Kunci") – tidak dilihat murid
        └── Soalan (tanpa jawapan) dihantar ke GitHub → laman kuiz untuk murid

Murid hantar jawapan → Google Sheet menyemak → markah + jawapan betul dipaparkan
                                              → rekod di tab "Markah"
```

Format soalan sama seperti Sheet Quiz Generator (Google Form) yang sedia ada:
**Question | A | B | C | D | Answer | Marks**, bermula di A7. Jadi baris yang sama boleh
ditampal ke Quiz Generator jika anda mahukan Google Form juga.

---

## Persediaan (sekali sahaja)

### Langkah 1 – Hidupkan GitHub Pages

1. Pastikan repo ini **Public** (Settings → General → Danger Zone → Change visibility).
2. Settings → **Pages** → Source: *Deploy from a branch* → Branch: **main**, folder **/ (root)** → Save.
3. Selepas ~1 minit, laman anda: `https://marilyngakim-blip.github.io/quiz-generator/`
   (kuiz contoh: `quiz.html?id=contoh`).

### Langkah 2 – Google Sheet "Kuiz Web"

1. Cipta Google Sheet baharu (akaun Gmail peribadi), namakan **Kuiz Web**.
2. **Extensions → Apps Script**. Padam kod sedia ada, tampal isi fail
   [`apps-script/Code.gs`](apps-script/Code.gs), kemudian Save.
3. Kembali ke Sheet, muat semula. Menu **KUIZ WEB → Sediakan Sheet (kali pertama)**.
   Benarkan akses apabila diminta.
4. Di Apps Script: **Deploy → New deployment** → jenis **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Deploy → salin **Web app URL** (berakhir dengan `/exec`).

### Langkah 3 – Token GitHub (supaya Sheet boleh menerbitkan kuiz)

1. GitHub → Settings → Developer settings → **Personal access tokens → Fine-grained tokens**
   → Generate new token.
   - Repository access: **Only select repositories → quiz-generator**
   - Permissions → Repository permissions → **Contents: Read and write**
   - Salin token.
2. Apps Script → **Project Settings** (ikon gear) → **Script properties** → tambah:

| Property | Nilai |
|---|---|
| `GITHUB_TOKEN` | token dari langkah 3.1 |
| `GITHUB_REPO` | `marilyngakim-blip/quiz-generator` |
| `WEBAPP_URL` | URL `/exec` dari langkah 2.4 |

Jangan kongsi token atau Sheet ini dengan murid.

---

## Cara buat kuiz baharu

1. Minta Claude: *"Buat kuiz Sejarah subtopik 1.3-1.4"*. Claude memberi 40 soalan dalam format
   TSV (Question, A, B, C, D, Answer, Marks).
2. Dalam Sheet **Kuiz Web**, tab **Input Kuiz**:
   - B1: tajuk, contoh `Sejarah Tingkatan 2 (1.3-1.4)`
   - Kosongkan A7:H300, kemudian tampal soalan di **A7**.
   - (Pilihan) Lajur H: pautan gambar Google Drive untuk soalan bergambar (lihat "Gambar soalan").
3. Menu **KUIZ WEB → Terbitkan Kuiz ke GitHub**.
4. Tunggu mesej **BERJAYA**. Pautan murid dipaparkan dan disimpan di **B2**. Laman siap
   dalam ~1 minit.

Menerbitkan tajuk yang sama sekali lagi akan **menggantikan** soalan kuiz itu (anda akan ditanya
dahulu). Markah lama kekal.

## Pindahkan kuiz dari Google Form

1. Buka Google Form (akaun yang sama dengan Sheet Kuiz Web), salin pautan dari bar alamat semasa
   **mengedit** Form (`https://docs.google.com/forms/d/…/edit`).
2. Sheet **Kuiz Web** → **KUIZ WEB → Import dari Google Form** → tampal pautan → OK.
3. Soalan aneka pilihan (4 pilihan, ada kunci jawapan) disalin ke tab Input Kuiz, tajuk Form di B1.
   Mesej akhir menyenaraikan soalan yang dilangkau (tiada kunci jawapan / bukan 4 pilihan).
4. Ubah tajuk di B1 supaya bermula dengan nama subjek (contoh `Sejarah Tingkatan 2 (1.3)`), kemudian
   **KUIZ WEB → Terbitkan Kuiz ke GitHub**.

Gambar soalan turut disalin: ia disimpan dalam folder Drive **Kuiz Web – Gambar**, pautannya di lajur H,
dan dimuat naik ke GitHub semasa Terbitkan. Gambar pada *pilihan jawapan* tidak disokong. Ulang langkah ini
untuk setiap Form.

## Ubah perkataan kad imbas 听写

Buka `aplikasi/tingxie-tahun5-data.js` atau `aplikasi/tingxie-tahun2-data.js` di GitHub → ikon pensel ✏️.
Setiap perkataan satu baris: `["aksara", "pinyin", "maksud BM", 1],` (1 = huruf wajib tulis ★, 0 = tidak).
Tambah/buang baris, kemudian **Commit changes**. Jika tersilap tanda petik/koma, aplikasi memaparkan amaran
dan tidak rosak selamanya – betulkan sahaja fail itu.

## Gambar soalan (lajur H)

Lajur H di tab Input Kuiz boleh berisi:
- pautan fail **Google Drive** (muat naik gambar ke Drive → klik kanan → *Copy link* → tampal), atau
- pautan gambar `https://…` lain.

Semasa **Terbitkan**, gambar dimuat naik ke `quizzes/img/<kuiz>/` dan dipaparkan di atas pilihan jawapan.
Saiz maksimum 5 MB setiap gambar.

## Sambung kuiz yang belum siap (walaupun di peranti lain)

Setiap jawapan disimpan automatik, mengikut nama anak:
- serta-merta dalam peranti yang digunakan, dan
- dalam tab **Draf** di Google Sheet (±2 saat kemudian), supaya boleh disambung di telefon/komputer lain.

Bila kembali ke kuiz yang sama, jawapan dipulihkan dan butang **➜ Sambung menjawab** membawa ke soalan
pertama yang belum dijawab (**🔄 Mula semula** memadam jawapan yang disimpan). Draf dipadam selepas
jawapan dihantar. Label kemajuan menunjukkan status: *☁️ disimpan*, *⏳ menyimpan…* atau
*💾 disimpan dalam peranti ini sahaja* (Sheet tidak dapat dihubungi / skrip belum dikemas kini).

> Selepas mengubah `Code.gs`, gunakan **Deploy → Manage deployments → ✏️ Edit → Version: New version →
> Deploy** supaya Web App menggunakan kod baharu (URL kekal sama).

Kad imbas 听写 menyimpan kedudukan dalam setiap sesi dan mod (dalam peranti itu sahaja).

## Melihat markah

Tab **Markah**: masa, kuiz, nama, kelas, nombor cubaan, markah, peratus dan jawapan murid.
Lajur **Cubaan** menunjukkan jika murid menjawab lebih daripada sekali.

## Mahu Google Form juga?

Salin baris soalan dari tab Input Kuiz (A7:G…) dan tampal ke Sheet Quiz Generator di A7, set
B1, kemudian **QUIZ GENERATOR → Create Current Quiz** seperti biasa.

## Had GitHub Pages (akaun percuma)

- Saiz laman 1 GB (satu kuiz ≈ 20 KB), trafik ~100 GB sebulan. Lebih daripada cukup untuk sekolah.
- Repo mesti Public. Soalan boleh dilihat umum, **jawapan tidak** (kekal dalam Google Sheet).

## Ubah muka depan (`site.js`)

Buka [`site.js`](site.js) di GitHub → ikon pensel ✏️ → ubah → **Commit changes**.

- `TAJUK`, `SUBTAJUK`: teks besar di muka depan.
- `TAHAP`: senarai tahap (Tingkatan 2, Tahun 6, Tahun 2). Tahap kuiz diambil daripada tajuknya,
  contoh `Matematik Tahun 6 (1.1)` → Tahun 6.
- `ANAK`: nama, tahap dan emoji setiap anak. Bila anak pilih nama, hanya subjek dan kuiz tahapnya
  dipaparkan, dan namanya diisi automatik dalam kuiz. Markah terbaik dipaparkan pada kad kuiz.
- `SUBJEK`: petak subjek (nama, emoji, warna), `awalan` tajuk kuiz yang dikira sebagai subjek itu
  (contoh `Mathematics` dan `Matematik`), dan `tahap` yang ada subjek itu.

- `PAUTAN`: aplikasi/latihan lain (bukan kuiz dari Google Sheet) yang dipaparkan sebagai kad, contoh
  kad imbas 听写 dalam folder `aplikasi/`. Isi `tajuk`, `url`, `subjek`, `tahap` dan `ket` (keterangan).
  Markah aplikasi ini tidak direkodkan di Google Sheet.

Tajuk kuiz yang baik: **Subjek + Tahap + (subtopik)**, contoh `Sains Tahun 2 (1.1)`.
Di tab **Markah**, lajur *Kelas* kini mengandungi tahap kuiz.

## Fail dalam repo ini

| Fail | Fungsi |
|---|---|
| `index.html`, `assets/home.js` | Muka depan: pilih anak, petak subjek, senarai kuiz |
| `quiz.html`, `assets/quiz.js` | Laman menjawab kuiz (markah, bintang, konfeti) |
| `assets/style.css`, `assets/common.js` | Reka bentuk dan fungsi dikongsi |
| `site.js` | Tetapan muka depan (tahap, anak, subjek, pautan aplikasi) |
| `aplikasi/tingxie-tahun5.html`, `aplikasi/tingxie-tahun2.html` | Kad imbas 听写 Bahasa Cina Tahun 5 dan Tahun 2 |
| `aplikasi/tingxie-tahun5-data.js`, `aplikasi/tingxie-tahun2-data.js` | Senarai perkataan kad imbas – edit di sini (satu perkataan satu baris) |
| `quizzes/*.json` | Soalan setiap kuiz (tanpa jawapan) – dijana oleh Sheet |
| `quizzes/index.json` | Senarai kuiz – dijana oleh Sheet |
| `config.js` | URL Web App – dijana oleh Sheet |
| `apps-script/Code.gs` | Skrip untuk Google Sheet |
