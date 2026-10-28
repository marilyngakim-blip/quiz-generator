// Tetapan muka depan. Ubah di sini sahaja.
// (config.js dijana oleh Google Sheet – jangan campur.)
window.SITE = {
  TAJUK: 'Jom Kuiz!',
  SUBTAJUK: 'Belajar sambil bermain — jawab, semak, ulang!',

  // Tahap persekolahan. Tahap kuiz diambil daripada tajuknya,
  // contoh "Mathematics Tingkatan 2 (2.1)" → Tingkatan 2, "Matematik Tahun 6 (1.1)" → Tahun 6.
  TAHAP: ['Tingkatan 2', 'Tahun 6', 'Tahun 2'],

  // Anak-anak. Bila anak pilih nama, hanya subjek dan kuiz untuk tahapnya dipaparkan.
  ANAK: [
    { nama: 'Elnathan', tahap: 'Tingkatan 2', emoji: '🦁' },
    { nama: 'Ezequiel', tahap: 'Tahun 6',     emoji: '🚀' },
    { nama: 'Elzeario', tahap: 'Tahun 2',     emoji: '🐬' }
  ],

  // Subjek di muka depan.
  //  nama  : nama yang dipaparkan
  //  awalan: awal tajuk kuiz yang dikira sebagai subjek ini (huruf besar/kecil tidak penting)
  //  tahap : tahap yang ada subjek ini
  SUBJEK: [
    { nama: 'Matematik',      awalan: ['Mathematics', 'Matematik'],  emoji: '🔢', warna: '#ff8a3d', tahap: ['Tingkatan 2', 'Tahun 6', 'Tahun 2'] },
    { nama: 'Sains',          awalan: ['Science', 'Sains'],          emoji: '🔬', warna: '#2bb3a3', tahap: ['Tingkatan 2', 'Tahun 6', 'Tahun 2'] },
    { nama: 'Bahasa Melayu',  awalan: ['Bahasa Melayu', 'BM'],       emoji: '📖', warna: '#ff6b6b', tahap: ['Tingkatan 2', 'Tahun 6', 'Tahun 2'] },
    { nama: 'English',        awalan: ['English', 'Bahasa Inggeris'], emoji: '🔤', warna: '#5b8def', tahap: ['Tingkatan 2', 'Tahun 6', 'Tahun 2'] },
    { nama: 'Bahasa Cina',    awalan: ['Bahasa Cina', 'BC'],         emoji: '🏮', warna: '#d64545', tahap: ['Tingkatan 2', 'Tahun 6', 'Tahun 2'] },
    { nama: 'Sejarah',        awalan: ['Sejarah'],                   emoji: '🏛️', warna: '#c47f3a', tahap: ['Tingkatan 2', 'Tahun 6'] },
    { nama: 'Geografi',       awalan: ['Geografi'],                  emoji: '🌏', warna: '#3fae5a', tahap: ['Tingkatan 2'] },
    { nama: 'RBT',            awalan: ['RBT', 'Reka Bentuk'],        emoji: '🛠️', warna: '#8e6cd8', tahap: ['Tingkatan 2', 'Tahun 6'] }
  ],

  // Aplikasi/latihan lain (bukan kuiz dari Google Sheet) yang dipaparkan sebagai kad kuiz.
  //  url   : halaman dalam repo ini (contoh folder aplikasi/) atau pautan https://…
  //  subjek: nama subjek di atas;  tahap: tahap yang dipaparkan
  PAUTAN: [
    { tajuk: '听写 Kad Imbas Tahun 5 (Ulang kaji)', url: 'aplikasi/tingxie-tahun5.html',
      subjek: 'Bahasa Cina', tahap: 'Tahun 6', ket: '200 perkataan · 20 sesi · Belajar, Kuiz, Tulis' },
    { tajuk: '听写 Kad Imbas Tahun 2', url: 'aplikasi/tingxie-tahun2.html',
      subjek: 'Bahasa Cina', tahap: 'Tahun 2', ket: '240 perkataan · 24 sesi · Belajar, Kuiz, Tulis' }
  ]
};
