"""TaipSoalan — antara muka semakan (Streamlit).

  streamlit run app.py

Aliran: muat naik kertas (PDF/DOC/DOCX) atau JSON → ekstrak dengan Claude → semak setiap
soalan (imej halaman asal di kiri, pratonton di kanan) → betulkan teks/koordinat/nilai →
bina Word (dengan sasaran muka surat) → muat turun.
"""
from __future__ import annotations

import copy
import glob
import json
import os
import sys
import tempfile

import streamlit as st
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bina_docx  # noqa: E402
import ekstrak  # noqa: E402
import sasaran  # noqa: E402
import semak  # noqa: E402
from rajah import lukis_rajah  # noqa: E402
from skema import normalkan  # noqa: E402
from teks import Latex, ke_segmen  # noqa: E402

st.set_page_config(page_title="TaipSoalan", layout="wide")
AKAR_KERJA = os.path.join(os.path.expanduser("~"), "taipsoalan_kerja")

ss = st.session_state
ss.setdefault("kerja", None)
ss.setdefault("data", None)
ss.setdefault("imej", [])
ss.setdefault("log", [])


def log(*a):
    ss.log.append(" ".join(str(x) for x in a))


def simpan_data():
    if ss.kerja and ss.data is not None:
        ekstrak.simpan_json(ss.data, os.path.join(ss.kerja, "soalan.json"))


# ---- bar sisi: input & tetapan ---------------------------------------------------
with st.sidebar:
    st.title("TaipSoalan")
    st.caption("Kertas 2 Matematik SPM → Word bersih (Bahasa Melayu)")
    fail = st.file_uploader("Kertas soalan atau JSON", type=["pdf", "doc", "docx", "json"])
    model = st.selectbox("Model", ["claude-opus-5-5", "claude-sonnet-5-5"], index=0)
    dpi = st.slider("DPI render halaman", 150, 200, 170, 10)
    if fail is not None and st.button("Muat fail", type="primary"):
        nama = os.path.splitext(fail.name)[0]
        ss.kerja = os.path.join(AKAR_KERJA, nama)
        os.makedirs(ss.kerja, exist_ok=True)
        laluan = os.path.join(ss.kerja, fail.name)
        with open(laluan, "wb") as f:
            f.write(fail.getbuffer())
        if fail.name.lower().endswith(".json"):
            ss.data = normalkan(ekstrak.muat_json(laluan))[0]
            ss.imej = sorted(glob.glob(os.path.join(ss.kerja, "halaman", "h-*.png")))
        else:
            with st.spinner("Menukar & merender halaman..."):
                pdf = ekstrak.sediakan_pdf(laluan, ss.kerja)
                ss.imej = ekstrak.render_halaman(pdf, ss.kerja, dpi)
            sedia = os.path.join(ss.kerja, "soalan.json")
            ss.data = ekstrak.muat_json(sedia) if os.path.exists(sedia) else None
        st.success(f"{len(ss.imej)} halaman. Folder kerja: {ss.kerja}")

    if ss.imej and st.button("Ekstrak dengan Claude", disabled=not ss.imej):
        with st.status("Mengekstrak...", expanded=True) as s:
            try:
                ss.data = ekstrak.ekstrak(ss.imej, model=model, log=lambda *a: s.write(" ".join(map(str, a))))
                simpan_data()
                s.update(label="Ekstrak selesai", state="complete")
            except Exception as e:  # noqa: BLE001
                s.update(label=f"Gagal: {e}", state="error")

if ss.data is None:
    st.info("Muat naik kertas soalan (PDF/DOC/DOCX) dan tekan **Ekstrak dengan Claude**, "
            "atau muat naik fail JSON yang telah diekstrak. Kunci API dibaca daripada "
            "pemboleh ubah persekitaran `ANTHROPIC_API_KEY`.")
    st.stop()

data = ss.data
kerja = ss.kerja or tempfile.mkdtemp()
ss.kerja = kerja
folder_pratonton = os.path.join(kerja, "pratonton")


def senarai_soalan():
    out = []
    for bi, bh in enumerate(data.get("bahagian", [])):
        for si, s in enumerate(bh.get("soalan", [])):
            out.append((bi, si, f"{bh.get('nama', '')} — Soalan {s.get('no')}"))
    return out


def md_teks(t) -> str:
    out = []
    for seg in ke_segmen(t):
        if isinstance(seg, Latex):
            out.append(("\n\n$$" + seg.latex + "$$\n\n") if seg.papar else f"${seg.latex}$")
        else:
            out.append(seg.replace("\n", "  \n"))
    return "".join(out)


def halaman_soalan(s) -> list[int]:
    h = list(s.get("halaman") or [])

    def kutip(n):
        for r in (n.get("rajah") or []) + ([n["kertas_graf"]] if n.get("kertas_graf") else []):
            if r.get("halaman"):
                h.append(int(r["halaman"]))
        for c in n.get("ceraian") or []:
            kutip(c)
    kutip(s)
    return sorted(set(int(x) for x in h))


def pratonton_rajah(spec, kunci):
    os.makedirs(folder_pratonton, exist_ok=True)
    laluan = os.path.join(folder_pratonton, f"{kunci}.png")
    try:
        w, h = lukis_rajah(spec, laluan, imej_halaman=ss.imej)
        st.image(laluan, caption=f"{spec.get('kapsyen', spec.get('jenis'))} — {w:.1f} × {h:.1f} cm",
                 width=int(min(w, 17) / 2.54 * 110))
    except Exception as e:  # noqa: BLE001
        st.error(f"Rajah {spec.get('jenis')} gagal: {e}")


def pratonton_jadual(spec):
    baris = []
    for row in spec.get("baris", []):
        sel = []
        for c in row:
            if isinstance(c, dict):
                t = "▢" if c.get("kosong") else str(c.get("teks", ""))
                if c.get("colspan", 1) > 1 or c.get("rowspan", 1) > 1:
                    t += f" ⟨{c.get('rowspan', 1)}×{c.get('colspan', 1)}⟩"
            else:
                t = str(c)
            sel.append(t.replace("|", "\\|"))
        baris.append("| " + " | ".join(sel) + " |")
    if baris:
        ncol = max(r.count("|") - 1 for r in baris)
        baris.insert(1, "|" + "---|" * ncol)
        st.markdown("\n".join(baris))
    if spec.get("kapsyen"):
        st.caption(spec["kapsyen"])


def pratonton_nod(n, kunci, aras=0):
    label = n.get("label") or (f"**{n.get('no')}**" if "no" in n else "")
    st.markdown(("&nbsp;" * 6 * aras) + f"{label} " + md_teks(n.get("teks")))
    for i, r in enumerate(n.get("rajah") or []):
        pratonton_rajah(r, f"{kunci}_r{i}")
    for j in n.get("jadual") or []:
        pratonton_jadual(j)
    if n.get("markah"):
        st.markdown(f"<div style='text-align:right'><b>[{n['markah']} markah]</b> · ruang: "
                    f"{n.get('ruang_jawapan', 'kosong')}</div>", unsafe_allow_html=True)
    for i, c in enumerate(n.get("ceraian") or []):
        pratonton_nod(c, f"{kunci}_c{i}", aras + 1)


tab_semak, tab_meta, tab_bina = st.tabs(["Semak soalan", "Tajuk, bahagian & laporan", "Bina Word"])

with tab_semak:
    pilihan = senarai_soalan()
    if not pilihan:
        st.warning("Tiada soalan dalam JSON.")
    else:
        idx = st.selectbox("Soalan", range(len(pilihan)), format_func=lambda i: pilihan[i][2])
        bi, si, _ = pilihan[idx]
        s = data["bahagian"][bi]["soalan"][si]
        kiri, kanan = st.columns(2)
        with kiri:
            st.subheader("Halaman asal")
            hal = halaman_soalan(s) or [1]
            if ss.imej:
                h = st.selectbox("Halaman", list(range(1, len(ss.imej) + 1)),
                                 index=min(hal[0], len(ss.imej)) - 1, key=f"hal_{idx}")
                im = Image.open(ss.imej[h - 1])
                st.image(im, use_container_width=True)
                # kotak rajah pada halaman ini
                for r in s.get("rajah") or []:
                    if r.get("halaman") == h and r.get("kotak"):
                        x0, y0, x1, y1 = r["kotak"]
                        st.image(im.crop((int(x0 * im.width), int(y0 * im.height),
                                          int(x1 * im.width), int(y1 * im.height))),
                                 caption=f"Asal: {r.get('kapsyen', r.get('jenis'))}")
            else:
                st.caption("Tiada imej halaman (muat naik PDF asal untuk perbandingan).")
        with kanan:
            st.subheader("Pratonton")
            pratonton_nod(s, f"s{bi}_{si}")
            st.divider()
            st.subheader("Sunting (JSON soalan ini)")
            st.caption("Betulkan teks, markah, koordinat rajah, nilai jadual. "
                       "Markup: **tebal**, *condong*; persamaan {\"latex\": \"...\"}.")
            teks_json = st.text_area("JSON", json.dumps(s, ensure_ascii=False, indent=1),
                                     height=420, key=f"json_{idx}", label_visibility="collapsed")
            c1, c2 = st.columns(2)
            if c1.button("Kemas kini & simpan", type="primary", key=f"kk_{idx}"):
                try:
                    baru = json.loads(teks_json)
                    data["bahagian"][bi]["soalan"][si] = baru
                    ss.data, amaran = normalkan(data)
                    simpan_data()
                    for a in amaran:
                        st.warning(a)
                    st.rerun()
                except json.JSONDecodeError as e:
                    st.error(f"JSON tidak sah: {e}")
            if c2.button("Padam soalan", key=f"padam_{idx}"):
                del data["bahagian"][bi]["soalan"][si]
                simpan_data()
                st.rerun()

with tab_meta:
    data["tajuk"] = st.text_area("Tajuk", data.get("tajuk", ""), height=90)
    for bi, bh in enumerate(data.get("bahagian", [])):
        c1, c2, c3 = st.columns([2, 1, 5])
        bh["nama"] = c1.text_input("Nama", bh.get("nama", ""), key=f"bn{bi}")
        bh["markah"] = c2.number_input("Markah", value=int(bh.get("markah") or 0), key=f"bm{bi}")
        bh["arahan"] = c3.text_input("Arahan", bh.get("arahan", ""), key=f"ba{bi}")
    st.subheader("Pembetulan taip (oleh Claude)")
    data["pembetulan"] = [x for x in st.text_area(
        "Satu setiap baris", "\n".join(data.get("pembetulan", [])), height=120).splitlines() if x.strip()]
    st.subheader("Bahagian hilang")
    data["hilang"] = [x for x in st.text_area(
        "Satu setiap baris ", "\n".join(data.get("hilang", [])), height=90).splitlines() if x.strip()]
    if st.button("Simpan"):
        simpan_data()
        st.success("Disimpan.")
    st.download_button("Muat turun JSON", json.dumps(data, ensure_ascii=False, indent=1),
                       file_name="soalan.json", mime="application/json")

with tab_bina:
    c1, c2, c3 = st.columns(3)
    muka = c1.number_input("Sasaran muka surat (0 = tiada)", 0, 60, 16)
    sisip_graf = c2.checkbox("Sisip kertas graf", True)
    omml = c3.checkbox("Persamaan OMML (boleh disunting dalam Word)", True)
    if st.button("Bina Word", type="primary"):
        simpan_data()
        folder = os.path.join(kerja, "bina")
        os.makedirs(folder, exist_ok=True)
        keluar = os.path.join(kerja, "kertas_taip.docx")
        man = {}

        def bina(fr, fj, out):
            man.update(bina_docx.bina(copy.deepcopy(data), out, kerja, imej_halaman=ss.imej,
                                      faktor_ruang=fr, faktor_rajah=fj, guna_omml=omml,
                                      sisip_kertas_graf=sisip_graf))
            return out

        with st.status("Membina...", expanded=True) as s:
            fr, fj, nota = 1.0, 1.0, None
            if muka:
                h = sasaran.cari(lambda a, b: semak.kira_muka(semak.ke_pdf(
                    bina(a, b, os.path.join(folder, "cuba.docx")), folder)), int(muka),
                    log=lambda *a: s.write(" ".join(map(str, a))))
                fr, fj, nota = h.faktor_ruang, h.faktor_rajah, ("tepat" if h.tepat else h.nota)
            bina(fr, fj, keluar)
            pdf = semak.ke_pdf(keluar, kerja)
            cs = semak.contact_sheet(pdf, os.path.join(kerja, "contact_sheet.png"))
            helaian = semak.dua_sehelai(pdf, os.path.join(kerja, "dua_sehelai"))
            isu = semak.semak_auto(pdf, man, int(muka) or None)
            lap = semak.laporan(os.path.join(kerja, "laporan.md"), pdf=pdf, data=data, manifest=man,
                                isu=isu, sasaran=int(muka) or None, faktor={"ruang": fr, "rajah": fj},
                                nota_sasaran=nota)
            s.update(label=f"Siap — {semak.kira_muka(pdf)} muka surat", state="complete")
        st.markdown(lap)
        st.image(cs, caption="Contact sheet")
        with st.expander("Pratonton 2 muka surat sehelai (~55 dpi)"):
            for f in helaian:
                st.image(f)
        with open(keluar, "rb") as f:
            st.download_button("Muat turun Word (.docx)", f.read(), file_name="kertas_taip.docx",
                               mime="application/vnd.openxmlformats-officedocument."
                                    "wordprocessingml.document")
        with open(pdf, "rb") as f:
            st.download_button("Muat turun PDF", f.read(), file_name="kertas_taip.pdf",
                               mime="application/pdf")
