"""Persamaan LaTeX → OMML (persamaan Word asli) atau PNG.

Laluan utama ialah OMML kerana ia tajam ketika difotostat dan boleh disunting
dalam Word.  Subset LaTeX yang disokong:
  \\frac \\dfrac \\tfrac, \\sqrt, \\sqrt[n], ^ _, \\begin{pmatrix|bmatrix|vmatrix|matrix},
  \\left( \\right), \\text{}, \\mathrm{}, simbol biasa (\\times \\div \\pm \\leq ...).
Jika LaTeX di luar subset, PNG dijana dengan pdflatex + pdftoppm (300 dpi);
jika pdflatex tiada, matplotlib mathtext digunakan.
"""
from __future__ import annotations

import hashlib
import os
import re
import shutil
import subprocess
import tempfile
from xml.sax.saxutils import escape

M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math"
W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


class LatexTidakDisokong(ValueError):
    pass


SIMBOL = {
    "times": "×", "div": "÷", "pm": "±", "mp": "∓", "cdot": "·", "leq": "≤", "le": "≤",
    "geq": "≥", "ge": "≥", "neq": "≠", "ne": "≠", "approx": "≈", "pi": "π", "theta": "θ",
    "alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ", "Delta": "Δ", "lambda": "λ",
    "mu": "μ", "sigma": "σ", "Sigma": "Σ", "omega": "ω", "phi": "φ", "infty": "∞",
    "circ": "°", "degree": "°", "angle": "∠", "triangle": "△", "therefore": "∴",
    "rightarrow": "→", "to": "→", "leftarrow": "←", "Rightarrow": "⇒", "in": "∈",
    "notin": "∉", "subset": "⊂", "subseteq": "⊆", "cup": "∪", "cap": "∩", "emptyset": "∅",
    "varnothing": "∅", "xi": "ξ", "prime": "′", "ldots": "…", "cdots": "⋯", "quad": "\u2003",
    "qquad": "\u2003\u2003", "%": "%", "{": "{", "}": "}", "$": "$", "&": "&", "#": "#",
    ",": "\u2009", ";": "\u2005", ":": "\u2005", "!": "", " ": " ", "lvert": "|", "rvert": "|",
    "mid": "|", "parallel": "∥", "perp": "⊥", "sim": "∼", "equiv": "≡", "ast": "∗",
}
FUNGSI = {"sin", "cos", "tan", "log", "ln", "lg", "exp", "max", "min"}
MATRIKS = {"pmatrix": ("(", ")"), "bmatrix": ("[", "]"), "vmatrix": ("|", "|"),
           "matrix": ("", ""), "Bmatrix": ("{", "}")}

_TOK = re.compile(r"\\[a-zA-Z]+|\\.|\\\\|[{}^_&]|\s+|.", re.S)


def _token(latex: str) -> list[str]:
    out = []
    for t in _TOK.findall(latex):
        if t.isspace():
            continue  # ruang diabaikan dalam mod matematik
        out.append(t)
    return out


# ---- nod pokok sintaks -------------------------------------------------------
# ("r", teks, tegak)  ("f", num, den)  ("sup", asas, sup)  ("sub", asas, sub)
# ("subsup", asas, sub, sup)  ("rad", deg|None, isi)  ("d", buka, tutup, isi)
# ("m", baris[[sel]])   isi = senarai nod

class _Penghurai:
    def __init__(self, toks):
        self.t = toks
        self.i = 0

    def lihat(self):
        return self.t[self.i] if self.i < len(self.t) else None

    def ambil(self):
        tok = self.lihat()
        self.i += 1
        return tok

    def kumpulan(self):
        """Hurai satu argumen: {…} atau satu token."""
        tok = self.lihat()
        if tok == "{":
            self.ambil()
            isi = self.senarai(tamat={"}"})
            self.ambil()
            return isi
        return self.senarai(satu=True)

    def teks_mentah(self):
        if self.ambil() != "{":
            raise LatexTidakDisokong("\\text memerlukan {}")
        aras, out = 1, []
        while True:
            tok = self.ambil()
            if tok is None:
                break
            if tok == "{":
                aras += 1
            elif tok == "}":
                aras -= 1
                if aras == 0:
                    break
            out.append(tok[1:] if tok.startswith("\\") and len(tok) == 2 else tok)
        return "".join(out)

    def senarai(self, tamat=frozenset(), satu=False):
        nod: list = []
        while True:
            tok = self.lihat()
            if tok is None or tok in tamat:
                return nod
            if tok in ("^", "_"):
                self.ambil()
                asas = nod.pop() if nod else ("r", "", False)
                arg = self.kumpulan()
                if tok == "^":
                    if asas[0] == "sub":
                        asas = ("subsup", asas[1], asas[2], arg)
                    else:
                        asas = ("sup", [asas], arg)
                else:
                    if asas[0] == "sup":
                        asas = ("subsup", asas[1], arg, asas[2])
                    else:
                        asas = ("sub", [asas], arg)
                nod.append(asas)
                continue
            nod.extend(self.atom())
            if satu:
                return nod

    def atom(self):
        tok = self.ambil()
        if tok == "{":
            isi = self.senarai(tamat={"}"})
            self.ambil()
            return isi
        if tok == "}":
            raise LatexTidakDisokong("} tidak berpasangan")
        if not tok.startswith("\\") or tok == "\\\\":
            if tok == "&" or tok == "\\\\":
                raise LatexTidakDisokong("& atau \\\\ di luar matriks")
            return [("r", tok, not tok.isalpha())]
        cmd = tok[1:]
        if cmd in ("frac", "dfrac", "tfrac", "cfrac"):
            return [("f", self.kumpulan(), self.kumpulan())]
        if cmd == "sqrt":
            deg = None
            if self.lihat() == "[":
                self.ambil()
                deg = self.senarai(tamat={"]"})
                self.ambil()
            return [("rad", deg, self.kumpulan())]
        if cmd in ("text", "textrm", "mbox", "textbf"):
            return [("r", self.teks_mentah(), "teks")]
        if cmd in ("mathrm", "mathbf", "operatorname"):
            return [("r", self.teks_mentah(), True)]
        if cmd in ("mathit", "textit"):
            return [("r", self.teks_mentah(), False)]
        if cmd == "left":
            buka = self.ambil()
            buka = "" if buka == "." else buka.lstrip("\\")
            isi = self.senarai(tamat={"\\right"})
            self.ambil()
            tutup = self.ambil()
            tutup = "" if tutup == "." else tutup.lstrip("\\")
            return [("d", buka, tutup, isi)]
        if cmd == "begin":
            env = self.teks_mentah()
            if env not in MATRIKS:
                raise LatexTidakDisokong(f"persekitaran {env}")
            baris, sel, semasa = [], [], []
            while True:
                tok = self.lihat()
                if tok is None:
                    raise LatexTidakDisokong("\\end hilang")
                if tok == "\\end":
                    self.ambil()
                    self.teks_mentah()
                    break
                if tok == "&":
                    self.ambil()
                    sel.append(semasa)
                    semasa = []
                elif tok == "\\\\":
                    self.ambil()
                    sel.append(semasa)
                    baris.append(sel)
                    sel, semasa = [], []
                else:
                    semasa.extend(self.senarai(tamat={"&", "\\\\", "\\end"}))
            if semasa or sel:
                sel.append(semasa)
                baris.append(sel)
            buka, tutup = MATRIKS[env]
            m = ("m", baris)
            return [("d", buka, tutup, [m])] if buka else [m]
        if cmd in FUNGSI:
            return [("r", cmd, True)]
        if cmd in SIMBOL:
            return [("r", SIMBOL[cmd], True)]
        if cmd in ("displaystyle", "textstyle", "limits", "nolimits", "right"):
            return []
        raise LatexTidakDisokong(f"arahan \\{cmd}")


def huraikan(latex: str):
    p = _Penghurai(_token(latex))
    nod = p.senarai()
    if p.lihat() is not None:
        raise LatexTidakDisokong(f"token lebihan '{p.lihat()}'")
    return nod


# ---- penjana OMML ------------------------------------------------------------

def _run(teks: str, tegak) -> str:
    if tegak == "teks":
        rpr = "<m:rPr><m:nor/></m:rPr>"  # teks biasa (\\text{...})
    elif tegak:
        rpr = '<m:rPr><m:sty m:val="p"/></m:rPr>'
    else:
        rpr = ""
    return (f'<m:r>{rpr}<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>'
            f'</w:rPr><m:t xml:space="preserve">{escape(teks)}</m:t></m:r>')


def _xml(nod: list) -> str:
    out, penimbal, tegak_p = [], "", None

    def siram():
        nonlocal penimbal, tegak_p
        if penimbal:
            out.append(_run(penimbal, tegak_p))
        penimbal, tegak_p = "", None

    for n in nod:
        if n[0] == "r":
            # nombor/operator dikumpul; huruf tunggal kekal berasingan supaya condong
            tegak = n[2]
            if tegak_p is not None and tegak_p != tegak:
                siram()
            penimbal += n[1]
            tegak_p = tegak
            continue
        siram()
        k = n[0]
        if k == "f":
            out.append(f"<m:f><m:num>{_xml(n[1])}</m:num><m:den>{_xml(n[2])}</m:den></m:f>")
        elif k == "sup":
            out.append(f"<m:sSup><m:e>{_xml(n[1])}</m:e><m:sup>{_xml(n[2])}</m:sup></m:sSup>")
        elif k == "sub":
            out.append(f"<m:sSub><m:e>{_xml(n[1])}</m:e><m:sub>{_xml(n[2])}</m:sub></m:sSub>")
        elif k == "subsup":
            out.append(f"<m:sSubSup><m:e>{_xml(n[1])}</m:e><m:sub>{_xml(n[2])}</m:sub>"
                       f"<m:sup>{_xml(n[3])}</m:sup></m:sSubSup>")
        elif k == "rad":
            if n[1] is None:
                out.append(f'<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>'
                           f"<m:e>{_xml(n[2])}</m:e></m:rad>")
            else:
                out.append(f"<m:rad><m:deg>{_xml(n[1])}</m:deg><m:e>{_xml(n[2])}</m:e></m:rad>")
        elif k == "d":
            buka = {"lbrace": "{", "{": "{", "langle": "⟨", "vert": "|", "|": "|"}.get(n[1], n[1])
            tutup = {"rbrace": "}", "}": "}", "rangle": "⟩", "vert": "|", "|": "|"}.get(n[2], n[2])
            out.append(f'<m:d><m:dPr><m:begChr m:val="{escape(buka)}"/>'
                       f'<m:endChr m:val="{escape(tutup)}"/></m:dPr><m:e>{_xml(n[3])}</m:e></m:d>')
        elif k == "m":
            lajur = max(len(b) for b in n[1]) if n[1] else 1
            mpr = (f'<m:mPr><m:mcs><m:mc><m:mcPr><m:count m:val="{lajur}"/>'
                   f'<m:mcJc m:val="center"/></m:mcPr></m:mc></m:mcs></m:mPr>')
            baris = "".join("<m:mr>" + "".join(f"<m:e>{_xml(s)}</m:e>" for s in b) + "</m:mr>"
                            for b in n[1])
            out.append(f"<m:m>{mpr}{baris}</m:m>")
    siram()
    return "".join(out)


def latex_ke_omml(latex: str, papar: bool = False) -> str:
    """Pulangkan rentetan XML <m:oMath> (atau <m:oMathPara> jika papar)."""
    isi = _xml(huraikan(latex))
    ns = f'xmlns:m="{M_NS}" xmlns:w="{W_NS}"'
    if papar:
        return (f'<m:oMathPara {ns}><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr>'
                f"<m:oMath>{isi}</m:oMath></m:oMathPara>")
    return f"<m:oMath {ns}>{isi}</m:oMath>"


# ---- sandaran PNG -----------------------------------------------------------

def _pdflatex_png(latex: str, out_png: str, dpi: int = 300) -> bool:
    if not shutil.which("pdflatex") or not shutil.which("pdftoppm"):
        return False
    with tempfile.TemporaryDirectory() as d:
        tex = os.path.join(d, "p.tex")
        with open(tex, "w", encoding="utf-8") as f:
            f.write("\\documentclass[12pt,border=1pt]{standalone}\n"
                    "\\usepackage{amsmath,amssymb,mathptmx}\n\\begin{document}\n"
                    f"$\\displaystyle {latex}$\n\\end{{document}}\n")
        r = subprocess.run(["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "p.tex"],
                           cwd=d, capture_output=True, timeout=60)
        if r.returncode != 0:
            return False
        subprocess.run(["pdftoppm", "-png", "-r", str(dpi), "-singlefile", "-gray",
                        os.path.join(d, "p.pdf"), os.path.join(d, "p")], check=True)
        shutil.copy(os.path.join(d, "p.png"), out_png)
    return True


def _mathtext_png(latex: str, out_png: str, dpi: int = 300):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from PIL import Image

    s = re.sub(r"\\[dt]frac", r"\\frac", latex)
    s = re.sub(r"\\text\{", r"\\mathrm{", s)
    if "\\begin" in s:
        raise LatexTidakDisokong("matriks memerlukan OMML atau pdflatex")
    with matplotlib.rc_context({"mathtext.fontset": "stix"}):
        fig = plt.figure(figsize=(0.01, 0.01))
        fig.text(0, 0, f"${s}$", fontsize=12)
        fig.savefig(out_png, dpi=dpi, bbox_inches="tight", pad_inches=0.02, facecolor="white")
        plt.close(fig)
    Image.open(out_png).convert("RGB").save(out_png)


def latex_ke_png(latex: str, folder: str, dpi: int = 300) -> str:
    """Jana PNG (RGB) untuk persamaan. Pulangkan laluan fail (dicache ikut hash)."""
    os.makedirs(folder, exist_ok=True)
    h = hashlib.sha1(latex.encode()).hexdigest()[:12]
    out = os.path.join(folder, f"pers_{h}.png")
    if os.path.exists(out):
        return out
    if not _pdflatex_png(latex, out, dpi):
        _mathtext_png(latex, out, dpi)
    from PIL import Image
    Image.open(out).convert("RGB").save(out)
    return out
