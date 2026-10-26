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
   (cuba **Kuiz Contoh** di situ).

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
   - (Pilihan) Lajur H: nama fail gambar rajah, contoh `img/sejarah-1.png`. Fail gambar
     diletakkan dalam folder `quizzes/img/` di repo ini.
3. Menu **KUIZ WEB → Terbitkan Kuiz ke GitHub**.
4. Tunggu mesej **BERJAYA**. Pautan murid dipaparkan dan disimpan di **B2**. Laman siap
   dalam ~1 minit.

Menerbitkan tajuk yang sama sekali lagi akan **menggantikan** soalan kuiz itu (anda akan ditanya
dahulu). Markah lama kekal.

## Melihat markah

Tab **Markah**: masa, kuiz, nama, kelas, nombor cubaan, markah, peratus dan jawapan murid.
Lajur **Cubaan** menunjukkan jika murid menjawab lebih daripada sekali.

## Mahu Google Form juga?

Salin baris soalan dari tab Input Kuiz (A7:G…) dan tampal ke Sheet Quiz Generator di A7, set
B1, kemudian **QUIZ GENERATOR → Create Current Quiz** seperti biasa.

## Had GitHub Pages (akaun percuma)

- Saiz laman 1 GB (satu kuiz ≈ 20 KB), trafik ~100 GB sebulan. Lebih daripada cukup untuk sekolah.
- Repo mesti Public. Soalan boleh dilihat umum, **jawapan tidak** (kekal dalam Google Sheet).

## Fail dalam repo ini

| Fail | Fungsi |
|---|---|
| `index.html` | Senarai kuiz |
| `quiz.html`, `assets/` | Laman menjawab kuiz |
| `quizzes/*.json` | Soalan setiap kuiz (tanpa jawapan) – dijana oleh Sheet |
| `quizzes/index.json` | Senarai kuiz – dijana oleh Sheet |
| `config.js` | URL Web App – dijana oleh Sheet |
| `apps-script/Code.gs` | Skrip untuk Google Sheet |
