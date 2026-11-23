"""Pakej rajah: satu modul bagi setiap jenis rajah.

lukis_rajah(spec, laluan_png, imej_halaman=None, faktor=1.0) -> (lebar_cm, tinggi_cm)
"""
import copy
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from . import (gambar_hiasan, garis_nombor, graf_berpemberat, graf_fungsi,  # noqa: E402
               graf_garis_lurus, graf_laju_masa, kertas_graf, plot_kotak, plot_titik,
               rajah_pokok, satah_cartes, venn)

JENIS = {
    "graf_fungsi": graf_fungsi.lukis,
    "graf_laju_masa": graf_laju_masa.lukis,
    "graf_jarak_masa": graf_laju_masa.lukis,
    "graf_garis_lurus": graf_garis_lurus.lukis,
    "kertas_graf": kertas_graf.lukis,
    "satah_cartes": satah_cartes.lukis,
    "venn": venn.lukis,
    "graf_berpemberat": graf_berpemberat.lukis,
    "rajah_pokok": rajah_pokok.lukis,
    "plot_titik": plot_titik.lukis,
    "garis_nombor": garis_nombor.lukis,
    "plot_kotak": plot_kotak.lukis,
    "gambar_hiasan": gambar_hiasan.lukis,
}

LALAI_LABEL_Y = {"graf_jarak_masa": "Jarak (m)", "graf_laju_masa": "Laju (m s⁻¹)"}


def lukis_rajah(spec: dict, laluan: str, imej_halaman=None, faktor: float = 1.0):
    jenis = spec.get("jenis")
    if jenis not in JENIS:
        raise ValueError(f"jenis rajah tidak disokong: {jenis}")
    s = copy.deepcopy(spec)
    if jenis in LALAI_LABEL_Y:
        s.setdefault("label_y", LALAI_LABEL_Y[jenis])
    # Kertas graf berskala mesti saiz sebenar — tidak diskala.
    if faktor != 1.0 and not (jenis == "kertas_graf"):
        for k in ("lebar_cm", "tinggi_cm", "unit_cm"):
            if k in s:
                s[k] = float(s[k]) * faktor
    os.makedirs(os.path.dirname(laluan) or ".", exist_ok=True)
    return JENIS[jenis](s, laluan, imej_halaman=imej_halaman)
