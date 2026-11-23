#!/usr/bin/env python3
"""TaipSoalan — CLI.

Contoh:
  python main.py kertas.pdf --muka-surat 16          # ekstrak → (semak) → Word 16 muka surat
  python main.py kertas.pdf --ekstrak-sahaja         # berhenti selepas JSON untuk disemak
  python main.py kerja/soalan.json --muka-surat 20   # bina terus dari JSON yang disemak
  python main.py lama.doc --padat --fon-dari 10 --fon-ke 12 --muka-surat 16
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import semak  # noqa: E402
import sasaran  # noqa: E402


def log(*a):
    print(*a, flush=True)


def _kerja_lalai(fail):
    asas = os.path.splitext(os.path.abspath(fail))[0]
    return asas + "_kerja"


def jalan_utama(a):
    import bina_docx
    import ekstrak
    from skema import normalkan

    ext = os.path.splitext(a.input)[1].lower()
    kerja = os.path.abspath(a.kerja or (os.path.dirname(os.path.abspath(a.input))
                                        if ext == ".json" else _kerja_lalai(a.input)))
    os.makedirs(kerja, exist_ok=True)
    imej = []
    if ext == ".json":
        data = ekstrak.muat_json(a.input)
        json_laluan = os.path.abspath(a.input)
        sumber = a.halaman_dari
        if sumber:
            imej = ekstrak.render_halaman(ekstrak.sediakan_pdf(sumber, kerja), kerja, a.dpi)
        else:
            import glob
            imej = sorted(glob.glob(os.path.join(kerja, "halaman", "h-*.png")))
    else:
        pdf = ekstrak.sediakan_pdf(a.input, kerja)
        imej = ekstrak.render_halaman(pdf, kerja, a.dpi)
        log(f"{len(imej)} halaman dirender ({a.dpi} dpi) → {os.path.join(kerja, 'halaman')}")
        json_laluan = os.path.join(kerja, "soalan.json")
        if os.path.exists(json_laluan) and not a.ekstrak_semula:
            log(f"Guna JSON sedia ada (telah disemak?): {json_laluan}  [--ekstrak-semula untuk ulang]")
            data = ekstrak.muat_json(json_laluan)
        else:
            data = ekstrak.ekstrak(imej, model=a.model, kumpulan=a.kumpulan, log=log,
                                   effort=a.effort)
            ekstrak.simpan_json(data, json_laluan)
            log(f"JSON disimpan: {json_laluan}")
        if a.ekstrak_sahaja:
            log("\nSemak & betulkan JSON dahulu:\n"
                f"  streamlit run {os.path.join(os.path.dirname(__file__), 'app.py')}\n"
                f"kemudian: python main.py {json_laluan} --muka-surat N")
            return 0
    data, amaran = normalkan(data)
    for x in amaran:
        log(f"amaran: {x}")

    nama = a.keluar or os.path.join(kerja, os.path.splitext(os.path.basename(a.input))[0]
                                    .replace("soalan", "kertas") + "_taip.docx")
    folder_bina = os.path.join(kerja, "bina")
    os.makedirs(folder_bina, exist_ok=True)
    manifest_akhir = {}

    def bina(fr, fj, keluar):
        nonlocal manifest_akhir
        manifest_akhir = bina_docx.bina(
            data, keluar, kerja, imej_halaman=imej, faktor_ruang=fr, faktor_rajah=fj,
            guna_omml=not a.persamaan_png, sisip_kertas_graf=not a.tanpa_kertas_graf,
            graf_besar_muka_baharu=not a.tanpa_muka_baharu_graf)
        return keluar

    def bina_dan_kira(fr, fj):
        d = bina(fr, fj, os.path.join(folder_bina, "cuba.docx"))
        return semak.kira_muka(semak.ke_pdf(d, folder_bina))

    if not semak.lo_ada_math() and not a.persamaan_png:
        log("amaran: modul Math LibreOffice tiada (pakej libreoffice-math) — persamaan OMML "
            "tidak akan kelihatan dalam PDF semakan (Word tetap memaparkannya).")

    fr, fj, nota = a.faktor_ruang, 1.0, None
    if a.muka_surat:
        log(f"Mencari susun atur untuk {a.muka_surat} muka surat...")
        h = sasaran.cari(bina_dan_kira, a.muka_surat, log=log)
        fr, fj = h.faktor_ruang, h.faktor_rajah
        nota = "tepat" if h.tepat else h.nota
        log(("✓ " if h.tepat else "⚠ ") + f"{h.muka} muka surat. {'' if h.tepat else h.nota}")
    bina(fr, fj, nama)
    pdf = semak.ke_pdf(nama, kerja)
    log(f"Word: {nama}\nPDF : {pdf}")
    # semakan akhir
    cs = semak.contact_sheet(pdf, os.path.join(kerja, "contact_sheet.png"))
    helaian = semak.dua_sehelai(pdf, os.path.join(kerja, "dua_sehelai"))
    isu = semak.semak_auto(pdf, manifest_akhir, a.muka_surat)
    lap = os.path.join(kerja, "laporan.md")
    semak.laporan(lap, pdf=pdf, data=data, manifest=manifest_akhir, isu=isu,
                  sasaran=a.muka_surat, faktor={"ruang": fr, "rajah": fj}, nota_sasaran=nota)
    log(f"Contact sheet: {cs}\n2 muka surat sehelai: {len(helaian)} imej dalam "
        f"{os.path.dirname(helaian[0]) if helaian else '-'}\nLaporan: {lap}")
    for i in isu:
        log(f"⚠ {i}")
    return 0


def jalan_padat(a):
    import padat

    kerja = os.path.abspath(a.kerja or _kerja_lalai(a.input))
    os.makedirs(kerja, exist_ok=True)
    masuk = a.input
    if masuk.lower().endswith(".doc"):
        masuk = semak.tukar(masuk, "docx", kerja)
    ganti = json.load(open(a.ganti_imej, encoding="utf-8")) if a.ganti_imej else None
    keluar = a.keluar or os.path.join(kerja, os.path.splitext(os.path.basename(a.input))[0]
                                      + "_padat.docx")
    folder = os.path.join(kerja, "bina")

    def buat(f, out, senyap=False):
        return padat.padat(masuk, out, fon_dari=a.fon_dari, fon_ke=a.fon_ke,
                           skala_semua=a.skala_semua_fon, faktor=f, ganti=ganti,
                           log=(lambda *x: None) if senyap else log)

    f = a.faktor_padat
    nota = None
    if a.muka_surat:
        def kira(fr, _fj):
            out = os.path.join(folder, "cuba.docx")
            os.makedirs(folder, exist_ok=True)
            buat(fr, out, senyap=True)
            return semak.kira_muka(semak.ke_pdf(out, folder))
        h = sasaran.cari(kira, a.muka_surat, faktor_rajah_pilihan=(1.0,), log=log)
        f = h.faktor_ruang
        nota = "tepat" if h.tepat else h.nota
        log(("✓ " if h.tepat else "⚠ ") + f"{h.muka} muka surat (F = {f:.2f})")
    stat = buat(f, keluar)
    pdf = semak.ke_pdf(keluar, kerja)
    semak.contact_sheet(pdf, os.path.join(kerja, "contact_sheet.png"))
    semak.dua_sehelai(pdf, os.path.join(kerja, "dua_sehelai"))
    isu = semak.semak_auto(pdf, None, a.muka_surat)
    with open(os.path.join(kerja, "laporan.md"), "w", encoding="utf-8") as fh:
        fh.write(f"# Laporan padat\n\n- Fail: {keluar}\n- Muka surat: {semak.kira_muka(pdf)}"
                 f"{f' (sasaran {a.muka_surat})' if a.muka_surat else ''}\n- Faktor F: {f:.2f}\n")
        if nota:
            fh.write(f"- Sasaran: {nota}\n")
        fh.write("".join(f"- {k}: {v}\n" for k, v in stat.items()))
        fh.write("".join(f"- ⚠ {i}\n" for i in isu))
    log(f"Word: {keluar}\nPDF : {pdf}\nLaporan: {os.path.join(kerja, 'laporan.md')}")
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(prog="taipsoalan", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("input", help="kertas.pdf / .doc / .docx, atau soalan.json yang disemak")
    p.add_argument("--muka-surat", type=int, help="sasaran bilangan muka surat (cth 16 atau 20)")
    p.add_argument("--keluar", help="laluan .docx keluaran")
    p.add_argument("--kerja", help="folder kerja (lalai: <nama>_kerja)")
    g = p.add_argument_group("ekstrak")
    g.add_argument("--model", default="claude-opus-5-5")
    g.add_argument("--effort", default="high", choices=["low", "medium", "high", "xhigh", "max"])
    g.add_argument("--dpi", type=int, default=170, help="dpi render halaman (150–200)")
    g.add_argument("--kumpulan", type=int, help="bilangan halaman setiap panggilan API")
    g.add_argument("--ekstrak-sahaja", action="store_true", help="berhenti selepas JSON")
    g.add_argument("--ekstrak-semula", action="store_true", help="abaikan soalan.json sedia ada")
    g.add_argument("--halaman-dari", help="(input JSON) PDF asal untuk gambar_hiasan")
    b = p.add_argument_group("bina")
    b.add_argument("--faktor-ruang", type=float, default=1.0)
    b.add_argument("--persamaan-png", action="store_true", help="persamaan sebagai PNG, bukan OMML")
    b.add_argument("--tanpa-kertas-graf", action="store_true",
                   help="jangan sisip kertas graf; tulis '(Jawab pada kertas graf.)'")
    b.add_argument("--tanpa-muka-baharu-graf", action="store_true",
                   help="soalan bergraf besar tidak dimulakan pada muka surat baharu")
    d = p.add_argument_group("mod padat (fail Word sedia ada)")
    d.add_argument("--padat", action="store_true")
    d.add_argument("--fon-dari", type=float, default=10)
    d.add_argument("--fon-ke", type=float, default=12)
    d.add_argument("--skala-semua-fon", action="store_true",
                   help="skala semua saiz fon dengan nisbah fon-ke/fon-dari")
    d.add_argument("--faktor-padat", type=float, default=0.5,
                   help="faktor F untuk perenggan kosong berturutan")
    d.add_argument("--ganti-imej", help="JSON {\"media/image3.wmf\": <spesifikasi rajah>}")
    a = p.parse_args(argv)
    if not os.path.exists(a.input):
        p.error(f"fail tidak wujud: {a.input}")
    if not shutil.which("pdftoppm") or not shutil.which("pdfinfo"):
        p.error("poppler-utils (pdftoppm, pdfinfo) diperlukan")
    return jalan_padat(a) if a.padat else jalan_utama(a)


if __name__ == "__main__":
    sys.exit(main())
