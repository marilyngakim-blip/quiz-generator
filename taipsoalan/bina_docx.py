"""JSON + rajah → .docx sedia fotostat (python-docx).

Ciri utama:
  * A4, margin 1.8 cm, Times New Roman 12 pt, nombor halaman di tengah.
  * Indentasi berlapis: nombor soalan | (a) | (i) dengan tab stop & hanging indent.
  * "[x markah]" dijajar ke kanan; "Jawapan:" + ruang kosong ikut markah
    (600 + 580×markah twip, maks 3300, didarab faktor_ruang).
  * keepNext: teks soalan → markah → "Jawapan:"; jadual cantSplit + keepNext.
  * Bahagian C bermula muka surat baharu; soalan bergraf besar boleh juga.
  * Persamaan LaTeX → OMML (sandaran PNG).
"""
from __future__ import annotations

import hashlib
import json
import os
from copy import deepcopy

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, Twips

import persamaan
from rajah import lukis_rajah
from teks import Latex, huraikan_markup, pecah_baris, teks_biasa

LEBAR_A4, TINGGI_A4, MARGIN = 21.0, 29.7, 1.8
LEBAR_TEKS = LEBAR_A4 - 2 * MARGIN
INDEN = 1.0  # cm bagi setiap aras
FON = "Times New Roman"


def twip_ruang(markah, faktor=1.0) -> int:
    m = float(markah or 0)
    return int(min(600 + 580 * m, 3300) * faktor)


class PembinaDocx:
    def __init__(self, data: dict, kerja: str, imej_halaman=None, faktor_ruang: float = 1.0,
                 faktor_rajah: float = 1.0, guna_omml: bool = True,
                 sisip_kertas_graf: bool = True, graf_besar_muka_baharu: bool = True):
        self.data = data
        self.kerja = kerja
        self.folder_rajah = os.path.join(kerja, "rajah_png")
        self.imej_halaman = imej_halaman or []
        self.faktor_ruang = faktor_ruang
        self.faktor_rajah = faktor_rajah
        self.guna_omml = guna_omml
        self.sisip_kertas_graf = sisip_kertas_graf
        self.graf_besar_muka_baharu = graf_besar_muka_baharu
        self.amaran: list[str] = []
        self.manifest = {"jadual": [], "soalan": [], "kertas_graf_disisip": 0,
                         "kertas_graf_tidak_disisip": []}
        self._pecah_seterusnya = False
        self._ruang_sebelum = None
        self._awal_bahagian = False
        self._kertas_graf_tertunda: list = []

    # ---- asas dokumen --------------------------------------------------------
    def _sediakan(self):
        doc = Document()
        sec = doc.sections[0]
        sec.page_width, sec.page_height = Cm(LEBAR_A4), Cm(TINGGI_A4)
        for k in ("left_margin", "right_margin", "top_margin", "bottom_margin"):
            setattr(sec, k, Cm(MARGIN))
        sec.header_distance = Cm(0.9)
        sec.footer_distance = Cm(0.9)
        for nama in ("Normal", "List Bullet", "Table Grid"):
            try:
                st = doc.styles[nama]
            except KeyError:
                continue
            st.font.name = FON
            st.font.size = Pt(12)
            rpr = st.element.get_or_add_rPr()
            rf = rpr.find(qn("w:rFonts"))
            if rf is None:
                rf = OxmlElement("w:rFonts")
                rpr.insert(0, rf)
            for a in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
                rf.set(qn(a), FON)
            for a in ("w:asciiTheme", "w:hAnsiTheme", "w:eastAsiaTheme", "w:cstheme"):
                if rf.get(qn(a)) is not None:
                    del rf.attrib[qn(a)]
        pf = doc.styles["Normal"].paragraph_format
        pf.space_before = Pt(0)
        pf.space_after = Pt(0)
        pf.line_spacing = 1.0
        pf.widow_control = True
        # nombor halaman di tengah
        p = sec.footer.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        fld = OxmlElement("w:fldSimple")
        fld.set(qn("w:instr"), "PAGE")
        r = OxmlElement("w:r")
        t = OxmlElement("w:t")
        t.text = "1"
        r.append(t)
        fld.append(r)
        p._p.append(fld)
        self.doc = doc

    def _para(self, aras: float = 0, jajar=None, keep_next=False):
        p = self.doc.add_paragraph()
        pf = p.paragraph_format
        if aras:
            pf.left_indent = Cm(aras * INDEN)
        if jajar:
            p.alignment = jajar
        pf.keep_with_next = keep_next
        if self._pecah_seterusnya:
            pf.page_break_before = True
            self._pecah_seterusnya = False
        if self._ruang_sebelum is not None:
            pf.space_before = Pt(self._ruang_sebelum)
            self._ruang_sebelum = None
        return p

    def _isi(self, p, segmen, tebal=False, condong=False):
        for seg in segmen:
            if isinstance(seg, Latex):
                self._latex_sebaris(p, seg.latex)
                continue
            for r in huraikan_markup(seg, tebal_asas=tebal):
                run = p.add_run(r.teks)
                run.bold = r.tebal or None
                run.italic = (r.condong or condong) or None

    def _latex_sebaris(self, p, latex):
        if self.guna_omml:
            try:
                p._p.append(parse_xml(persamaan.latex_ke_omml(latex)))
                return
            except Exception as e:  # noqa: BLE001
                self.amaran.append(f"OMML gagal untuk '{latex}': {e}; guna PNG")
        try:
            png = persamaan.latex_ke_png(latex, self.folder_rajah)
            from PIL import Image
            im = Image.open(png)
            tinggi_cm = im.height / 300 * 2.54
            p.add_run().add_picture(png, height=Cm(tinggi_cm))
        except Exception as e:  # noqa: BLE001
            self.amaran.append(f"Persamaan gagal: {latex} ({e})")
            p.add_run(latex)

    def _baris(self, baris_list, aras, label=None, keep_next=True, tebal_label=False):
        """Tulis beberapa baris teks; baris pertama membawa label (nombor/(a)/(i))."""
        label = list(label or [])
        if not baris_list:
            baris_list = [[]] if label else []
        for i, segmen in enumerate(baris_list):
            # persamaan papar
            if len(segmen) == 1 and isinstance(segmen[0], Latex) and segmen[0].papar and not (
                    i == 0 and label):
                self._latex_papar(segmen[0].latex, aras)
                continue
            # senarai bertitik (numbering, bukan aksara "•")
            if not (i == 0 and label) and segmen and isinstance(segmen[0], str) \
                    and segmen[0].startswith("- "):
                p = self._para(keep_next=keep_next)
                p.style = self.doc.styles["List Bullet"]
                p.paragraph_format.left_indent = Cm(aras * INDEN + 0.6)
                p.paragraph_format.first_line_indent = Cm(-0.6)
                self._isi(p, [segmen[0][2:]] + segmen[1:])
                continue
            p = self._para(aras, keep_next=keep_next)
            if i == 0 and label:
                pf = p.paragraph_format
                pf.first_line_indent = Cm(-len(label) * INDEN)
                mula = aras - len(label)
                for k in range(1, len(label) + 1):
                    pf.tab_stops.add_tab_stop(Cm((mula + k) * INDEN))
                for j, lb in enumerate(label):
                    run = p.add_run(str(lb))
                    run.bold = True if (tebal_label and j == 0) else None
                    p.add_run("\t")
            self._isi(p, segmen)

    def _latex_papar(self, latex, aras):
        p = self._para(aras, jajar=WD_ALIGN_PARAGRAPH.CENTER, keep_next=True)
        if self.guna_omml:
            try:
                p._p.append(parse_xml(persamaan.latex_ke_omml(latex, papar=True)))
                return
            except Exception as e:  # noqa: BLE001
                self.amaran.append(f"OMML gagal untuk '{latex}': {e}; guna PNG")
        self._latex_sebaris(p, latex)

    # ---- rajah ---------------------------------------------------------------
    def _png_rajah(self, spec):
        jenis = spec.get("jenis")
        faktor = 1.0 if jenis == "kertas_graf" else self.faktor_rajah
        kunci = json.dumps(spec, sort_keys=True, ensure_ascii=False) + f"|{faktor:.3f}"
        h = hashlib.sha1(kunci.encode()).hexdigest()[:14]
        laluan = os.path.join(self.folder_rajah, f"{jenis}_{h}.png")
        meta = laluan + ".json"
        if os.path.exists(laluan) and os.path.exists(meta):
            with open(meta) as f:
                w, ht = json.load(f)
            return laluan, w, ht
        w, ht = lukis_rajah(spec, laluan, imej_halaman=self.imej_halaman, faktor=faktor)
        with open(meta, "w") as f:
            json.dump([w, ht], f)
        return laluan, w, ht

    def _rajah(self, spec, aras):
        try:
            laluan, w, h = self._png_rajah(spec)
        except Exception as e:  # noqa: BLE001
            self.amaran.append(f"Rajah {spec.get('jenis')} gagal dilukis: {e}")
            p = self._para(aras, keep_next=True)
            p.add_run(f"[Rajah tidak dapat dilukis: {spec.get('jenis')} — {e}]").italic = True
            return
        maks_w = LEBAR_TEKS - aras * INDEN
        maks_h = TINGGI_A4 - 2 * MARGIN - 2.0
        skala = 1.0
        if spec.get("jenis") == "kertas_graf":
            if w > LEBAR_TEKS + 0.05 or h > TINGGI_A4 - 2 * MARGIN:
                self.amaran.append(f"Kertas graf {w:.1f}×{h:.1f} cm melebihi ruang halaman")
            aras = 0
        else:
            skala = min(1.0, maks_w / w, maks_h / h)
            if skala < 1.0:
                self.amaran.append(f"Rajah {spec.get('jenis')} dikecilkan {skala:.2f}× untuk muat")
        p = self._para(aras, jajar=WD_ALIGN_PARAGRAPH.CENTER, keep_next=True)
        if p.paragraph_format.space_before is None:
            p.paragraph_format.space_before = Pt(4)
        p.add_run().add_picture(laluan, width=Cm(w * skala))
        if spec.get("kapsyen"):
            pk = self._para(aras, jajar=WD_ALIGN_PARAGRAPH.CENTER, keep_next=False)
            self._isi(pk, [spec["kapsyen"]])
            pk.paragraph_format.space_after = Pt(6)

    # ---- jadual --------------------------------------------------------------
    def _jadual(self, spec, aras, kapsyen_ikut=True):
        baris = spec.get("baris") or []
        if not baris:
            return
        # susun grid dengan rowspan/colspan
        diduduki, letak = set(), []
        for r, row in enumerate(baris):
            c = 0
            for sel in row:
                while (r, c) in diduduki:
                    c += 1
                s = sel if isinstance(sel, dict) else {"teks": sel}
                rs, cs = int(s.get("rowspan", 1)), int(s.get("colspan", 1))
                for i in range(rs):
                    for j in range(cs):
                        diduduki.add((r + i, c + j))
                letak.append((r, c, rs, cs, s))
                c += cs
        ncol = max(c for _, c in diduduki) + 1
        nrow = max(r for r, _ in diduduki) + 1
        t = self.doc.add_table(rows=nrow, cols=ncol)
        t.style = self.doc.styles["Table Grid"]
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        t.autofit = False
        lebar = spec.get("lebar_lajur_cm")
        if not lebar:
            maks = LEBAR_TEKS - aras * INDEN
            lebar = [min(maks / ncol, float(spec.get("lebar_lajur_lalai_cm", 3.2)))] * ncol
        lebar = (list(lebar) + [lebar[-1]] * ncol)[:ncol]
        for j, w in enumerate(lebar):
            for cell in t.columns[j].cells:
                cell.width = Cm(float(w))
        # LibreOffice membaca tblGrid, bukan lebar sel
        for gc, w in zip(t._tbl.tblGrid.findall(qn("w:gridCol")), lebar):
            gc.set(qn("w:w"), str(int(float(w) * 567)))
        tajuk_baris = int(spec.get("tajuk_baris", 1 if spec.get("tajuk_tebal", True) else 0))
        teks_semua = []
        for r, c, rs, cs, s in letak:
            cell = t.cell(r, c)
            if rs > 1 or cs > 1:
                cell = cell.merge(t.cell(r + rs - 1, c + cs - 1))
            p = cell.paragraphs[0]
            p.alignment = {"kiri": WD_ALIGN_PARAGRAPH.LEFT, "kanan": WD_ALIGN_PARAGRAPH.RIGHT}.get(
                s.get("jajar"), WD_ALIGN_PARAGRAPH.CENTER)
            tebal = bool(s.get("tebal", r < tajuk_baris))
            if not s.get("kosong"):
                for k, segmen in enumerate(pecah_baris(s.get("teks", ""))):
                    if k > 0:
                        p = cell.add_paragraph()
                        p.alignment = cell.paragraphs[0].alignment
                    self._isi(p, segmen, tebal=tebal)
                tb = teks_biasa(s.get("teks", "")).strip()
                if tb:
                    teks_semua.append(tb)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        tinggi_kosong = float(spec.get("tinggi_baris_kosong_cm", 0.9))
        baris_kosong = {r for r, c, rs, cs, s in letak if s.get("kosong")}
        for i, row in enumerate(t.rows):
            trpr = row._tr.get_or_add_trPr()
            trpr.append(OxmlElement("w:cantSplit"))
            if i in baris_kosong or spec.get("tinggi_baris_cm"):
                row.height = Cm(float(spec.get("tinggi_baris_cm", tinggi_kosong)))
            akhir = i == len(t.rows) - 1
            for cell in row.cells:
                for p in cell.paragraphs:
                    p.paragraph_format.keep_with_next = (not akhir) or (
                        kapsyen_ikut and bool(spec.get("kapsyen")))
                    p.paragraph_format.keep_together = True
        # perenggan selepas jadual
        if spec.get("kapsyen"):
            pk = self._para(aras, jajar=WD_ALIGN_PARAGRAPH.CENTER)
            pk.paragraph_format.space_before = Pt(4)
            pk.paragraph_format.space_after = Pt(6)
            self._isi(pk, [spec["kapsyen"]])
        else:
            self._para().paragraph_format.space_after = Pt(2)
        if teks_semua:
            self.manifest["jadual"].append({"pertama": teks_semua[0], "akhir": teks_semua[-1],
                                            "kapsyen": spec.get("kapsyen", "")})

    # ---- soalan --------------------------------------------------------------
    def _bahan(self, node, aras, jawapan=False):
        """Rajah & jadual bagi nod. jawapan=True → hanya yang menjadi ruang jawapan."""
        jenis_ruang = node.get("ruang_jawapan")
        sebagai_jawapan = jenis_ruang in ("jadual", "rajah")
        if jawapan != sebagai_jawapan:
            return
        for spec in node.get("rajah", []) or []:
            if spec.get("jenis") == "kertas_graf" and jenis_ruang == "kertas_graf":
                continue
            self._rajah(spec, aras)
        for spec in node.get("jadual", []) or []:
            self._jadual(spec, aras)

    def _markah_jawapan(self, node, aras):
        m = node.get("markah")
        if m not in (None, "", 0):
            p = self._para(jajar=WD_ALIGN_PARAGRAPH.RIGHT, keep_next=True)
            p.add_run(f"[{_nombor(m)} markah]").bold = True
        jenis = node.get("ruang_jawapan", "kosong" if m else None)
        if not jenis or jenis == "tiada":
            return
        p = self._para(aras, keep_next=jenis != "kosong")
        p.add_run("Jawapan:").bold = True
        if jenis == "kosong":
            p.paragraph_format.space_after = Twips(twip_ruang(m, self.faktor_ruang))
        elif jenis in ("jadual", "rajah"):
            p.paragraph_format.space_after = Pt(4)
            self._bahan(node, aras, jawapan=True)
            ruang = self._para(aras)
            ruang.paragraph_format.space_after = Twips(int(240 * self.faktor_ruang))
        elif jenis == "kertas_graf":
            spec = node.get("kertas_graf") or next(
                (r for r in node.get("rajah", []) or [] if r.get("jenis") == "kertas_graf"), None)
            if spec and self.sisip_kertas_graf:
                pn = self._para(aras)
                pn.add_run("(Jawab pada kertas graf yang disediakan.)").italic = True
                pn.paragraph_format.space_after = Pt(12)
                # kertas graf disisip selepas soalan ini tamat (halaman sendiri)
                self._kertas_graf_tertunda.append(spec)
                self.manifest["kertas_graf_disisip"] += 1
            else:
                pn = self._para(aras)
                pn.add_run("(Jawab pada kertas graf.)").italic = True
                pn.paragraph_format.space_after = Pt(12)
                self.manifest["kertas_graf_tidak_disisip"].append(node.get("label") or node.get("no"))

    def _ceraian(self, c, aras, awalan=()):
        label = list(awalan) + [c.get("label", "")]
        baris = pecah_baris(c.get("teks"))
        sub = c.get("ceraian") or []
        tebal_label = bool(awalan)  # awalan = nombor soalan (tebal)
        if baris or not sub:
            self._baris(baris, aras, label=label, tebal_label=tebal_label)
            self._bahan(c, aras)
            for sc in sub:
                self._ceraian(sc, aras + 1)
        else:
            self._bahan(c, aras)
            self._ceraian(sub[0], aras + 1, awalan=label)
            for sc in sub[1:]:
                self._ceraian(sc, aras + 1)
        if not sub:
            self._markah_jawapan(c, aras)

    def _ada_graf_besar(self, node) -> bool:
        """Rajah besar dalam soalan (bukan kertas graf jawapan — itu sudah di halaman sendiri)."""
        for r in node.get("rajah", []) or []:
            if node.get("ruang_jawapan") == "kertas_graf" and r.get("jenis") == "kertas_graf":
                continue
            if r.get("jenis") == "kertas_graf" or float(r.get("tinggi_cm", 0)) >= 12:
                return True
        return any(self._ada_graf_besar(c) for c in node.get("ceraian", []) or [])

    def _soalan(self, s):
        if not self._awal_bahagian and (s.get("muka_baharu") or (
                self.graf_besar_muka_baharu and self._ada_graf_besar(s))):
            self._pecah_seterusnya = True
        self._awal_bahagian = False
        self._ruang_sebelum = 12
        no = str(s.get("no", ""))
        self.manifest["soalan"].append({"no": no, "awal": teks_biasa(s.get("teks", ""))[:40]})
        baris = pecah_baris(s.get("teks"))
        ceraian = s.get("ceraian") or []
        if baris or not ceraian:
            self._baris(baris, 1, label=[no], tebal_label=True)
            self._bahan(s, 1)
            for c in ceraian:
                self._ceraian(c, 2)
        else:
            self._bahan(s, 1)
            self._ceraian(ceraian[0], 2, awalan=[no])
            for c in ceraian[1:]:
                self._ceraian(c, 2)
        if not ceraian:
            self._markah_jawapan(s, 1)
        for spec in self._kertas_graf_tertunda:
            self._pecah_seterusnya = True
            self._rajah(spec, 0)
            self._pecah_seterusnya = True
        self._kertas_graf_tertunda = []

    # ---- utama ---------------------------------------------------------------
    def bina(self, keluar: str) -> dict:
        os.makedirs(self.folder_rajah, exist_ok=True)
        self._sediakan()
        tajuk = self.data.get("tajuk")
        mula = True
        if tajuk:
            for b in pecah_baris(tajuk):
                p = self._para(jajar=WD_ALIGN_PARAGRAPH.CENTER)
                self._isi(p, b, tebal=True)
                for r in p.runs:
                    r.font.size = Pt(14)
            self.doc.paragraphs[-1].paragraph_format.space_after = Pt(10)
        for bhg in self.data.get("bahagian", []):
            nama = str(bhg.get("nama", ""))
            if (bhg.get("muka_baharu") or nama.strip().upper().endswith(" C")) and not mula:
                self._pecah_seterusnya = True
            mula = False
            p = self._para(jajar=WD_ALIGN_PARAGRAPH.CENTER, keep_next=True)
            p.paragraph_format.space_before = Pt(6)
            r = p.add_run(nama)
            r.bold = True
            r.font.size = Pt(13)
            if bhg.get("markah"):
                p2 = self._para(jajar=WD_ALIGN_PARAGRAPH.CENTER, keep_next=True)
                p2.add_run(f"[{_nombor(bhg['markah'])} markah]").bold = True
            if bhg.get("arahan"):
                for b in pecah_baris(bhg["arahan"]):
                    p3 = self._para(jajar=WD_ALIGN_PARAGRAPH.CENTER, keep_next=True)
                    self._isi(p3, b)
                self.doc.paragraphs[-1].paragraph_format.space_after = Pt(6)
            self._awal_bahagian = True
            for s in bhg.get("soalan", []):
                self._soalan(s)
        # buang perenggan kosong di hujung supaya tiada halaman kosong
        body = self.doc.element.body
        while len(self.doc.paragraphs) > 1:
            p = self.doc.paragraphs[-1]
            if p.text.strip() or p._p.xpath(".//w:drawing") or "oMath" in p._p.xml:
                break
            if p._p.getparent() is body:
                body.remove(p._p)
            else:
                break
        # ruang jawapan terakhir tidak perlu menolak halaman baharu
        self.doc.save(keluar)
        self.manifest["amaran"] = self.amaran
        return self.manifest


def _nombor(v):
    try:
        f = float(v)
        return str(int(f)) if f.is_integer() else f"{f:g}"
    except (TypeError, ValueError):
        return str(v)


def bina(data, keluar, kerja, **kw) -> dict:
    return PembinaDocx(deepcopy(data), kerja, **kw).bina(keluar)
