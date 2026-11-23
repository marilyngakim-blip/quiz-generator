"""Mod "padat fail Word sedia ada": ubah XML .docx terus.

  * Tukar saiz fon (cth. 10 pt → 12 pt) dan fon lalai → Times New Roman.
  * Buang pemisah halaman kecuali sebelum/selepas kertas graf saiz penuh.
  * Mampatkan perenggan kosong berturutan (ruang jawapan) dengan faktor F.
  * Tukar imej WMF/EMF berwarna → PNG hitam (atau rajah dilukis semula dari spesifikasi),
    kemas kini document.xml.rels, [Content_Types].xml dan saiz wp:extent / a:ext.
  * Betulkan nombor halaman dalam text frame sempit pada pengepala/pengaki.
"""
from __future__ import annotations

import os
import re
import shutil
import tempfile
import zipfile

from lxml import etree
from PIL import Image, ImageOps

import semak

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "pic": "http://schemas.openxmlformats.org/drawingml/2006/picture",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "v": "urn:schemas-microsoft-com:vml",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    "ct": "http://schemas.openxmlformats.org/package/2006/content-types",
}
W = "{%s}" % NS["w"]
EMU_CM = 360000
FON = "Times New Roman"
FON_SIMBOL = {"Symbol", "Wingdings", "Wingdings 2", "Wingdings 3", "Cambria Math", "MT Extra",
              "Webdings"}


def _q(tag):
    p, t = tag.split(":")
    return "{%s}%s" % (NS[p], t)


class Pemadat:
    def __init__(self, docx: str, log=print):
        self.log = log
        self.tmp = tempfile.mkdtemp(prefix="padat_")
        with zipfile.ZipFile(docx) as z:
            z.extractall(self.tmp)
            self.nama_fail = z.namelist()
        self.statistik: dict = {}

    def _baca(self, nama):
        laluan = os.path.join(self.tmp, nama)
        if not os.path.exists(laluan):
            return None
        return etree.parse(laluan)

    def _tulis(self, nama, pokok):
        pokok.write(os.path.join(self.tmp, nama), xml_declaration=True, encoding="UTF-8",
                    standalone=True)

    def _bahagian_xml(self):
        return [n for n in self.nama_fail if re.match(
            r"word/(document|styles|header\d*|footer\d*|footnotes|endnotes|numbering)\.xml$", n)]

    # ---- fon -----------------------------------------------------------------
    def fon(self, dari: float | None = 10, ke: float = 12, skala_semua: bool = False):
        n_saiz = n_fon = 0
        for nama in self._bahagian_xml():
            t = self._baca(nama)
            for el in t.iter(W + "sz", W + "szCs"):
                v = el.get(W + "val")
                if v is None:
                    continue
                pt = int(v) / 2
                if skala_semua and dari:
                    baru = pt * ke / dari
                elif dari is not None and abs(pt - dari) < 0.01:
                    baru = ke
                else:
                    continue
                el.set(W + "val", str(int(round(baru * 2))))
                n_saiz += 1
            for rf in t.iter(W + "rFonts"):
                if rf.get(W + "ascii") in FON_SIMBOL:
                    continue
                for a in ("ascii", "hAnsi", "cs", "eastAsia"):
                    rf.set(W + a, FON)
                for a in ("asciiTheme", "hAnsiTheme", "cstheme", "eastAsiaTheme"):
                    rf.attrib.pop(W + a, None)
                n_fon += 1
            if nama == "word/styles.xml":
                self._lalai_gaya(t, dari, ke)
            self._tulis(nama, t)
        self.statistik.update(saiz_ditukar=n_saiz, fon_ditukar=n_fon)
        self.log(f"Fon: {n_saiz} saiz ditukar, {n_fon} tetapan fon → {FON}")

    def _lalai_gaya(self, t, dari, ke):
        root = t.getroot()
        dd = root.find(W + "docDefaults")
        if dd is None:
            dd = etree.SubElement(root, W + "docDefaults")
            root.insert(0, dd)
        rprd = dd.find(W + "rPrDefault")
        if rprd is None:
            rprd = etree.SubElement(dd, W + "rPrDefault")
        rpr = rprd.find(W + "rPr")
        if rpr is None:
            rpr = etree.SubElement(rprd, W + "rPr")
        rf = rpr.find(W + "rFonts")
        if rf is None:
            rf = etree.Element(W + "rFonts")
            rpr.insert(0, rf)
        for a in ("ascii", "hAnsi", "cs", "eastAsia"):
            rf.set(W + a, FON)
        for a in ("asciiTheme", "hAnsiTheme", "cstheme", "eastAsiaTheme"):
            rf.attrib.pop(W + a, None)
        sz = rpr.find(W + "sz")
        if sz is None:
            sz = etree.SubElement(rpr, W + "sz")
            sz.set(W + "val", str(int(ke * 2)))
        elif dari is None or abs(int(sz.get(W + "val", "20")) / 2 - (dari or 0)) < 0.01:
            sz.set(W + "val", str(int(ke * 2)))

    # ---- struktur badan ---------------------------------------------------------
    def _badan(self):
        t = self._baca("word/document.xml")
        return t, t.getroot().find(W + "body")

    @staticmethod
    def _tinggi_imej_cm(p) -> float:
        h = 0.0
        for ext in p.iter(_q("wp:extent")):
            h = max(h, int(ext.get("cy", 0)) / EMU_CM)
        for sh in p.iter(_q("v:shape")):
            m = re.search(r"height:\s*([\d.]+)(pt|in|cm)", sh.get("style", ""))
            if m:
                v = float(m.group(1))
                h = max(h, v * {"pt": 2.54 / 72, "in": 2.54, "cm": 1}[m.group(2)])
        return h

    @staticmethod
    def _kosong(p) -> bool:
        if p.tag != W + "p":
            return False
        if any(True for _ in p.iter(W + "sectPr")):
            return False
        if any(True for _ in p.iter(W + "drawing", W + "pict", W + "object", _q("v:shape"))):
            return False
        if any(el.tag.endswith("}oMath") for el in p.iter()):
            return False
        if any(el.get(W + "type") == "page" for el in p.iter(W + "br")):
            return False
        return not "".join(t.text or "" for t in p.iter(W + "t")).strip()

    def pemisah_halaman(self, had_graf_cm: float = 18.0):
        """Buang pemisah halaman kecuali di sekitar kertas graf saiz penuh."""
        t, body = self._badan()
        anak = list(body)
        graf = {i for i, el in enumerate(anak) if self._tinggi_imej_cm(el) >= had_graf_cm}
        dibuang = dikekal = 0
        for i, el in enumerate(anak):
            dekat = any(j in graf for j in (i - 1, i, i + 1))
            for br in list(el.iter(W + "br")):
                if br.get(W + "type") == "page":
                    if dekat:
                        dikekal += 1
                    else:
                        br.getparent().remove(br)
                        dibuang += 1
            for pb in list(el.iter(W + "pageBreakBefore")):
                if dekat:
                    dikekal += 1
                else:
                    pb.getparent().remove(pb)
                    dibuang += 1
            # pemisah seksyen "halaman seterusnya" → berterusan
            for st in el.iter(W + "sectPr"):
                ty = st.find(W + "type")
                if not dekat and (ty is None or ty.get(W + "val") in (None, "nextPage",
                                                                       "oddPage", "evenPage")):
                    if ty is None:
                        ty = etree.Element(W + "type")
                        st.insert(0, ty)
                    ty.set(W + "val", "continuous")
                    dibuang += 1
        self._tulis("word/document.xml", t)
        self.statistik.update(pemisah_dibuang=dibuang, pemisah_dikekal=dikekal)
        self.log(f"Pemisah halaman: {dibuang} dibuang, {dikekal} dikekalkan (kertas graf)")

    def mampat_kosong(self, faktor: float):
        """Kumpulan k perenggan kosong berturutan → max(1, round(k×F))."""
        t, body = self._badan()
        anak = list(body)
        i = dibuang = 0
        while i < len(anak):
            if self._kosong(anak[i]):
                j = i
                while j < len(anak) and self._kosong(anak[j]):
                    j += 1
                k = j - i
                simpan = max(1, int(round(k * faktor)))
                for el in anak[i + simpan:j]:
                    body.remove(el)
                    dibuang += 1
                i = j
            else:
                i += 1
        self._tulis("word/document.xml", t)
        self.statistik["perenggan_kosong_dibuang"] = dibuang
        self.log(f"Ruang jawapan: {dibuang} perenggan kosong dibuang (F = {faktor:.2f})")

    # ---- imej ----------------------------------------------------------------
    def tukar_imej(self, ambang: int = 200, ganti: dict | None = None, imej_halaman=None):
        """WMF/EMF → PNG hitam. ganti = {"media/image3.wmf": spec_rajah} untuk lukis semula."""
        ganti = ganti or {}
        rels_nama = "word/_rels/document.xml.rels"
        rels = self._baca(rels_nama)
        if rels is None:
            return
        doc_t, _ = self._badan()
        sasaran = {}
        for r in rels.getroot():
            tg = r.get("Target", "")
            if tg.lower().endswith((".wmf", ".emf")):
                sasaran[r.get("Id")] = r
        if not sasaran:
            self.log("Imej: tiada WMF/EMF")
            return
        ditukar = 0
        for rid, rel in sasaran.items():
            lama = os.path.join(self.tmp, "word", rel.get("Target"))
            baru_rel = re.sub(r"\.(wmf|emf)$", ".png", rel.get("Target"), flags=re.I)
            baru = os.path.join(self.tmp, "word", baru_rel)
            try:
                spec = ganti.get(rel.get("Target")) or ganti.get(rid)
                if spec:
                    from rajah import lukis_rajah
                    lukis_rajah(spec, baru, imej_halaman=imej_halaman)
                else:
                    with tempfile.TemporaryDirectory() as d:
                        png = semak.tukar(lama, "png", d)
                        asal = Image.open(png).convert("RGBA")
                        latar = Image.new("RGBA", asal.size, "white")
                        im = ImageOps.grayscale(Image.alpha_composite(latar, asal))
                        # semua piksel bukan putih → hitam (graf berwarna jadi hitam pekat)
                        im = im.point(lambda p: 255 if p > ambang else 0)
                        kotak = ImageOps.invert(im).getbbox()  # pangkas ruang putih
                        if kotak:
                            m = 6
                            im = im.crop((max(0, kotak[0] - m), max(0, kotak[1] - m),
                                          min(im.width, kotak[2] + m), min(im.height, kotak[3] + m)))
                        im = im.convert("RGB")
                        im.save(baru, dpi=(300, 300))
            except Exception as e:  # noqa: BLE001
                self.log(f"  gagal menukar {rel.get('Target')}: {e}")
                continue
            rel.set("Target", baru_rel)
            if os.path.exists(lama):
                os.remove(lama)
            self._betulkan_saiz(doc_t, rid, baru)
            ditukar += 1
        self._tulis(rels_nama, rels)
        self._tulis("word/document.xml", doc_t)
        ct = self._baca("[Content_Types].xml")
        root = ct.getroot()
        if not any(d.get("Extension", "").lower() == "png" for d in root.iter(_q("ct:Default"))):
            el = etree.SubElement(root, _q("ct:Default"))
            el.set("Extension", "png")
            el.set("ContentType", "image/png")
        self._tulis("[Content_Types].xml", ct)
        self.statistik["imej_ditukar"] = ditukar
        self.log(f"Imej: {ditukar} WMF/EMF → PNG hitam")

    def _betulkan_saiz(self, doc_t, rid, png):
        im = Image.open(png)
        nisbah = im.height / im.width
        for blip in doc_t.getroot().iter(_q("a:blip")):
            if blip.get(_q("r:embed")) != rid:
                continue
            # naik ke wp:inline / wp:anchor
            el = blip
            while el is not None and el.tag not in (_q("wp:inline"), _q("wp:anchor")):
                el = el.getparent()
            if el is None:
                continue
            ext = el.find(_q("wp:extent"))
            cx = int(ext.get("cx"))
            cy = int(cx * nisbah)
            ext.set("cy", str(cy))
            for aext in el.iter(_q("a:ext")):
                if aext.get("cx") is not None:
                    aext.set("cx", str(cx))
                    aext.set("cy", str(cy))

    # ---- nombor halaman --------------------------------------------------------
    def betulkan_nombor_halaman(self, had_twip: int = 1500):
        n = 0
        for nama in self.nama_fail:
            if not re.match(r"word/(header|footer)\d*\.xml$", nama):
                continue
            t = self._baca(nama)
            for p in t.getroot().iter(W + "p"):
                xml = etree.tostring(p, encoding="unicode")
                if "PAGE" not in xml:
                    continue
                ppr = p.find(W + "pPr")
                fp = ppr.find(W + "framePr") if ppr is not None else None
                if fp is not None and int(fp.get(W + "w", "0") or 0) < had_twip:
                    ppr.remove(fp)
                    jc = ppr.find(W + "jc")
                    if jc is None:
                        jc = etree.SubElement(ppr, W + "jc")
                    jc.set(W + "val", "center")
                    n += 1
            # kotak teks sempit (DrawingML) yang memegang medan PAGE → besarkan
            for lab in list(t.getroot().iter(_q("wp:anchor"))) + list(t.getroot().iter(_q("wp:inline"))):
                if "PAGE" not in etree.tostring(lab, encoding="unicode"):
                    continue
                ext = lab.find(_q("wp:extent"))
                if ext is not None and int(ext.get("cx", 0)) < 900000:
                    ext.set("cx", "900000")
                    for aext in lab.iter(_q("a:ext")):
                        if aext.get("cx") is not None:
                            aext.set("cx", "900000")
                    n += 1
            self._tulis(nama, t)
        self.statistik["nombor_halaman_dibetulkan"] = n
        self.log(f"Nombor halaman: {n} text frame sempit dibetulkan")

    def simpan(self, keluar: str):
        with zipfile.ZipFile(keluar, "w", zipfile.ZIP_DEFLATED) as z:
            # [Content_Types].xml mesti pertama
            semua = []
            for akar, _, fail in os.walk(self.tmp):
                for f in fail:
                    p = os.path.join(akar, f)
                    semua.append(os.path.relpath(p, self.tmp))
            semua.sort(key=lambda n: (n != "[Content_Types].xml", n))
            for n in semua:
                z.write(os.path.join(self.tmp, n), n)
        return keluar

    def bersih(self):
        shutil.rmtree(self.tmp, ignore_errors=True)


def padat(masuk: str, keluar: str, *, fon_dari=10, fon_ke=12, skala_semua=False,
          faktor=0.5, buang_pemisah=True, tukar_wmf=True, ganti=None, log=print) -> dict:
    p = Pemadat(masuk, log=log)
    try:
        if fon_ke:
            p.fon(fon_dari, fon_ke, skala_semua)
        if buang_pemisah:
            p.pemisah_halaman()
        p.mampat_kosong(faktor)
        if tukar_wmf:
            p.tukar_imej(ganti=ganti)
        p.betulkan_nombor_halaman()
        p.simpan(keluar)
        return p.statistik
    finally:
        p.bersih()
