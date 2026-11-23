"""Markup teks ringkas → segmen.

Format teks dalam JSON boleh jadi:
  * rentetan:  "Hitung nilai *x* jika **2*x* + 3 = 7**."
  * senarai:   ["Nilaikan ", {"latex": "\\dfrac{150}{W}"}, " apabila *W* = 5."]
  * {"latex": "...", "papar": true}  → persamaan berdiri sendiri (tengah).

Markup:  **tebal**, *condong*  (pemboleh ubah).  Aksara Unicode (x², kmj⁻¹, ₉)
disimpan terus.  Baris baharu "\n" memecahkan perenggan; baris bermula "- "
menjadi senarai bertitik (guna numbering, bukan aksara "•").
"""
from __future__ import annotations

import re
from dataclasses import dataclass

_TOKEN = re.compile(r"(\*\*|\*)")


@dataclass
class Run:
    teks: str
    tebal: bool = False
    condong: bool = False


@dataclass
class Latex:
    latex: str
    papar: bool = False


def huraikan_markup(s: str, tebal_asas: bool = False) -> list[Run]:
    """Tukar '**a** *b* c' kepada senarai Run."""
    runs: list[Run] = []
    tebal = condong = False
    for bahagian in _TOKEN.split(s):
        if bahagian == "**":
            tebal = not tebal
        elif bahagian == "*":
            condong = not condong
        elif bahagian:
            runs.append(Run(bahagian, tebal or tebal_asas, condong))
    return runs


def ke_segmen(teks) -> list:
    """Normalkan medan teks → senarai item (str | Latex)."""
    if teks is None:
        return []
    if isinstance(teks, str):
        return [teks] if teks else []
    if isinstance(teks, dict):
        if "latex" in teks:
            return [Latex(teks["latex"], bool(teks.get("papar")))]
        return [str(teks.get("teks", ""))]
    out = []
    for item in teks:
        out.extend(ke_segmen(item))
    return out


def pecah_baris(teks) -> list[list]:
    """Pecah segmen kepada baris (perenggan). Latex papar sentiasa satu baris sendiri."""
    baris: list[list] = [[]]
    for seg in ke_segmen(teks):
        if isinstance(seg, Latex):
            if seg.papar:
                if baris[-1]:
                    baris.append([])
                baris[-1].append(seg)
                baris.append([])
            else:
                baris[-1].append(seg)
            continue
        bahagian = seg.split("\n")
        for i, b in enumerate(bahagian):
            if i > 0:
                baris.append([])
            if b:
                baris[-1].append(b)
    return [b for b in baris if b] or []


def teks_biasa(teks) -> str:
    """Versi teks tanpa markup (untuk carian/semakan)."""
    out = []
    for seg in ke_segmen(teks):
        if isinstance(seg, Latex):
            out.append(seg.latex)
        else:
            out.append(seg.replace("**", "").replace("*", ""))
    return "".join(out)


_SUP = dict(zip("⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ⁿ", "0123456789-+n"))
_SUB = dict(zip("₀₁₂₃₄₅₆₇₈₉₋₊", "0123456789-+"))


def _skrip(s: str) -> str:
    """'m s⁻¹' → 'm s$^{-1}$' (fon serif kerap tiada glif ⁻)."""
    out, i = [], 0
    while i < len(s):
        c = s[i]
        for jadual, tanda in ((_SUP, "^"), (_SUB, "_")):
            if c in jadual:
                j = i
                isi = ""
                while j < len(s) and s[j] in jadual:
                    isi += jadual[s[j]]
                    j += 1
                out.append("$" + tanda + "{" + isi + "}$")
                i = j
                break
        else:
            out.append(c)
            i += 1
    return "".join(out)


def ke_mathtext(s: str) -> str:
    """Label rajah: markup → mathtext matplotlib.

    Semua label rajah tebal; *v* → $\\mathbfit{v}$ supaya pemboleh ubah sama saiz,
    sama tebal, tetapi condong.
    """
    if s is None:
        return ""
    s = str(s).replace("**", "")
    s = s.replace("$", r"\$")
    m = re.fullmatch(r"\s*(\d+)\s*/\s*(\d+)\s*", s)
    if m:  # kebarangkalian/pecahan → pecahan bertingkat
        return r"$\dfrac{" + m.group(1) + "}{" + m.group(2) + "}$"
    s = _skrip(s)
    out = []
    for i, bahagian in enumerate(s.split("*")):
        if i % 2 == 1 and bahagian:
            isi = bahagian.replace(" ", r"\ ")
            # superskrip dalam bahagian condong: x$^{2}$ → x^{2}
            isi = isi.replace("$^", "^").replace("$_", "_").replace("}$", "}")
            out.append(r"$\mathbfit{" + isi + "}$")
        else:
            out.append(bahagian)
    return "".join(out)
