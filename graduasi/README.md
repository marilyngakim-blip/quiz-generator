# Sistem Pendaftaran & Kehadiran — Majlis Apresiasi PRAKASA Murid Tingkatan 5 SMK Langkon

Laman web satu halaman untuk Majlis Apresiasi PRAKASA Murid Tingkatan 5 SMK Langkon:

- **Cari Murid** — cari nama, lihat kelas, meja/kerusi dan **kod QR kehadiran** setiap murid.
- **Daftar Tetamu** — ibu bapa / tetamu isi borang semasa tiba (nama, telefon, hubungan, nama murid, bilangan orang).
- **Tentatif** majlis, **Pelan Tempat Duduk**, pautan **Buku Atur Cara** (pilihan).
- **Rekod Kehadiran** — jadual analisis ikut kelas (enrolmen, hadir, % hadir, ibu bapa hadir, jumlah), dikemas kini setiap 20 saat.
- **Imbas QR** — selepas imbas, admin boleh tekan bilangan ibu bapa yang datang bersama (0–4).
- **Panel Admin** — tambah/edit/padam murid, import senarai sekali gus, tanda hadir, **imbas QR dengan kamera telefon** (ada bunyi bip), cetak kad QR, muat turun CSV kehadiran & tetamu.

Data disimpan dalam **Google Sheets** melalui Google Apps Script (percuma).

## Fail

| Fail | Kegunaan |
|---|---|
| `index.html` | Laman web (letak di GitHub Pages) |
| `Code.gs` | Backend Google Apps Script |
| `data.js` | Senarai 118 murid T5 2026 (nama, kelas, L/P, status, bil. ibu bapa) — tanpa nama ibu bapa |

## Langkah pemasangan

### 1. Sediakan Google Sheet + Apps Script
1. Buka [sheets.new](https://sheets.new) — namakan cth. *PRAKASA T5 SMK Langkon 2026*.
2. **Extensions → Apps Script**. Padam kod sedia ada, tampal semua isi `Code.gs`, tekan **Save**.
3. Pilih fungsi **`setup`** di bar atas → **Run** → benarkan akses (Advanced → Go to project).
   Helaian `Murid` dan `Pengunjung` akan dicipta.
4. **Tukar kata laluan admin** (lalai: `prakasa2026`): dalam fungsi `tukarKataLaluan`, ganti
   `TUKAR_KATA_LALUAN_INI` dengan kata laluan baharu, kemudian **Run** fungsi itu sekali.
5. **Deploy → New deployment** → jenis **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   → **Deploy**, salin **Web app URL** (berakhir dengan `/exec`).

> Jika anda ubah `Code.gs` kemudian, gunakan **Deploy → Manage deployments → Edit → Version: New version** supaya URL kekal sama.

### 2. Tetapkan laman web
Buka `index.html`, cari blok `CONFIG` di bahagian atas dan isi:

```js
API_URL: 'https://script.google.com/macros/s/XXXX/exec',
TARIKH: '15 November 2026 (Sabtu)',
TEMPAT: 'Dewan SMK Langkon',
LOGO_URL: 'https://...logo-sekolah.png',
PELAN_URL: 'https://...pelan-tempat-duduk.png',
BUKU_URL: 'https://anyflip.com/...',
ATUR_CARA: [ ... ]   // ubah ikut tentatif sebenar
```

Selagi `API_URL` kosong, laman berjalan dalam **Mod Demo** (data contoh, disimpan dalam pelayar sahaja; kata laluan demo `prakasa2026`).

### 3. Terbitkan di GitHub Pages
Repo → **Settings → Pages** → Source: *Deploy from a branch* → pilih branch dan folder `/ (root)` → Save.
Laman akan berada di `https://<nama-pengguna>.github.io/majlis-apresiasi-prakasa-tingkatan-5/`.

## Cara guna pada hari majlis

1. **Sebelum majlis**: Admin → *Masukkan 118 murid asal* (sekali sahaja, bila Sheet masih kosong).
   Untuk nama ibu bapa: buka fail Excel, helaian *Senarai Murid*, salin semua baris data →
   Admin → *Import dari Excel* → tampal. Murid sedia ada dikemas kini, tidak digandakan.
   Kemudian *Cetak Kad QR* (boleh tapis ikut kelas) dan edarkan kepada murid,
   atau murid boleh cari nama sendiri dan tangkap layar QR.
2. **Kaunter pendaftaran**: buka laman di telefon/tablet → Admin → tab *Rekod Kehadiran* → **Imbas QR**.
   Beberapa telefon boleh mengimbas serentak. Jika QR tiada, taip nama di ruangan bawah kamera.
3. **Tetamu**: paparkan kod QR pautan laman (tab *Daftar Tetamu*) di pintu masuk supaya ibu bapa daftar sendiri.
4. **Selepas majlis**: muat turun CSV kehadiran dan tetamu, atau terus buka Google Sheet.

## Keselamatan
- Kata laluan admin disemak di pelayan (Apps Script), tidak disimpan dalam kod laman.
- Senarai tetamu (no. telefon) hanya boleh dilihat oleh admin.
- Elakkan memasukkan No. KP murid — gunakan no. murid / angka giliran sahaja jika perlu.
