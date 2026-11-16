# -*- coding: utf-8 -*-
"""Siapkan bahan posting satu listing Sewain: carousel 4:5 + caption.

Pakai:  python alat/sosmed/siapkan.py --kode DPS-028
Hasil:  konten/DPS-028/  ->  01-sampul.jpg, 02..-foto.jpg, NN-ajakan.jpg,
                             caption.txt, info.json

Kenapa digambar ulang, tidak langsung pakai foto listing:
- Instagram MENOLAK rasio di luar 4:5 .. 1.91:1. Foto ponsel tegak (3:4) di
  listing lama jatuh di luar batas itu.
- Sampul membawa pelat kode + harga, jadi orang yang menggulir tahu dalam satu
  pandang apa yang ditawarkan dan berapa, tanpa membuka caption.
Data diambil dari API publik (fallback: data/listing.json), jadi isi posting
tidak bisa menyimpang dari yang tertulis di situs.
"""
import argparse
import io
import json
import os
import re
import sys
import urllib.request

from PIL import Image, ImageDraw, ImageFont, ImageOps

AKAR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONT = os.path.join(AKAR, "alat", "sosmed", "font")
API = os.environ.get("SEWAIN_API", "https://sewain.103-253-145-38.sslip.io")
SITUS = "https://bagusjaya0509-maker.github.io/sewaintoko/"
WA = "6285947720369"
WA_TAMPIL = "Sewain.id"

HUTAN, HUTAN_TUA, KREM, KERTAS = (29, 49, 37), (19, 33, 26), (243, 239, 228), (251, 249, 244)
JERAMI, LUMUT = (176, 138, 78), (86, 99, 79)
W, H = 1080, 1350
MAKS_FOTO = 8            # 1 sampul + 8 foto + 1 ajakan = 10, batas carousel Instagram


def font(nama, ukuran, berat):
    f = ImageFont.truetype(os.path.join(FONT, nama), ukuran)
    try:
        f.set_variation_by_axes([berat])
    except Exception:
        pass
    return f


TEGAK = lambda u, b=700: font("SofiaSansExtraCondensed.ttf", u, b)
TEKS = lambda u, b=500: font("AlbertSans.ttf", u, b)


def ambil(url, batas=40):
    req = urllib.request.Request(url, headers={"User-Agent": "SewainPosting/1.0"})
    with urllib.request.urlopen(req, timeout=batas) as r:
        return r.read()


def muat_listing(kode):
    try:
        return json.loads(ambil(API + "/api/listing/" + kode))["listing"]
    except Exception as e:
        print("  API tidak terjangkau (%s) - pakai data/listing.json" % e)
        data = json.load(io.open(os.path.join(AKAR, "data", "listing.json"), encoding="utf-8"))
        for l in data["listing"]:
            if l["kode"].lower() == kode.lower():
                return l
        sys.exit("Listing %s tidak ditemukan." % kode)


def foto_besar(url):
    url = re.sub(r"/s\d+(-[a-z0-9-]+)?/", "/s1600/", url)
    return Image.open(io.BytesIO(ambil(url, 60))).convert("RGB")


def isi_kotak(gambar, lebar, tinggi, fokus_y=0.62):
    """Potong-penuhi seperti CSS object-fit: cover, fokus agak ke bawah
    (bangunan biasanya di bawah langit & kabel)."""
    return ImageOps.fit(gambar, (lebar, tinggi), Image.LANCZOS, centering=(0.5, fokus_y))


def rupiah(n):
    if n >= 1e9:
        return "Rp" + ("%.2f" % (n / 1e9)).rstrip("0").rstrip(".").replace(".", ",") + " M"
    return "Rp" + ("%.1f" % (n / 1e6)).rstrip("0").rstrip(".").replace(".", ",") + " jt"


def nama_kab(k):
    return re.sub(r"^(Kabupaten|Kota)\s+", "", k or "")


def tempat(l):
    lk = l.get("lokasi") or {}
    return ", ".join(x for x in (lk.get("area"), nama_kab(lk.get("kabupaten"))) if x)


def butir_spek(l, ringkas=False):
    s = l.get("spesifikasi") or {}
    b = []
    if s.get("luasBangunan"): b.append("LB %s m²" % s["luasBangunan"] if ringkas else "Luas bangunan %s m²" % s["luasBangunan"])
    elif s.get("dimensi"): b.append("Ukuran " + s["dimensi"])
    if s.get("luasTanah"): b.append("LT %s m²" % s["luasTanah"] if ringkas else "Luas tanah %s m²" % s["luasTanah"])
    if s.get("lantai"): b.append("%s lantai" % s["lantai"])
    if s.get("listrikWatt"): b.append("Listrik %s W" % format(s["listrikWatt"], ",").replace(",", ".") if ringkas else "Listrik %s watt" % format(s["listrikWatt"], ",").replace(",", "."))
    if s.get("air"): b.append("Air " + " & ".join(s["air"]))
    if s.get("kamarMandi") and not ringkas: b.append("%s kamar mandi" % s["kamarMandi"])
    if s.get("legalitas"): b.append(", ".join(s["legalitas"]))
    return b


def gambar_tanda(d, x, y, lebar, warna):
    """Tanda logo (atap + 4 bilah) dari koordinat yang sama dengan SVG situs."""
    vx, vy, vw, vh = 210, 290, 606, 445
    k = lebar / vw
    bentuk = [
        [(218, 497), (521, 298), (806, 493), (806, 535), (521, 334), (218, 539)],
        [(294, 545), (327, 523), (327, 727), (294, 727)],
        [(390, 477), (423, 455), (423, 727), (390, 727)],
        [(488, 410), (521, 388), (521, 727), (488, 727)],
        [(650, 473), (684, 496), (684, 727), (650, 727)],
    ]
    for poli in bentuk:
        d.polygon([(x + (px - vx) * k, y + (py - vy) * k) for px, py in poli], fill=warna)
    return vh * k


def plakat(d, x, y, teks, ukuran=34, gelap=False):
    f = TEGAK(ukuran, 650)
    kiri, atas, kanan, bawah = d.textbbox((0, 0), teks, font=f)
    lebar_teks, tinggi_teks = kanan - kiri, bawah - atas
    px, py, titik = int(ukuran * .45), int(ukuran * .32), int(ukuran * .18)
    lebar = lebar_teks + px * 2 + titik + int(ukuran * .3)
    tinggi = tinggi_teks + py * 2
    latar, huruf = (HUTAN, KREM) if gelap else (KERTAS, HUTAN)
    d.rectangle([x, y, x + lebar, y + tinggi], fill=latar, outline=JERAMI, width=2)
    d.rectangle([x + 5, y + 5, x + lebar - 5, y + tinggi - 5], outline=(215, 196, 160), width=1)
    cx, cy = x + px + titik / 2, y + tinggi / 2
    d.ellipse([cx - titik / 2, cy - titik / 2, cx + titik / 2, cy + titik / 2], fill=JERAMI)
    d.text((x + px + titik + int(ukuran * .3) - kiri, y + py - atas), teks, font=f, fill=huruf)
    return lebar, tinggi


def bungkus(d, teks, f, lebar_maks):
    baris, kini = [], ""
    for kata in teks.split():
        coba = (kini + " " + kata).strip()
        if d.textlength(coba, font=f) <= lebar_maks:
            kini = coba
        else:
            if kini:
                baris.append(kini)
            kini = kata
    if kini:
        baris.append(kini)
    return baris


def sampul(l, foto):
    kanvas = Image.new("RGB", (W, H), KREM)
    tinggi_foto = 800
    if foto:
        kanvas.paste(isi_kotak(foto, W, tinggi_foto), (0, 0))
    panel = Image.new("RGB", (W, H - tinggi_foto), HUTAN)
    kanvas.paste(panel, (0, tinggi_foto))
    d = ImageDraw.Draw(kanvas)

    plakat(d, 56, 56, l["kode"], 38)
    label = "DIJUAL" if l["jenis"] == "jual" else "DISEWAKAN"
    fl = TEKS(24, 700)
    lebar_label = d.textlength(label, font=fl) + 4 * len(label)
    x_label = W - 56 - lebar_label - 36
    d.rectangle([x_label, 62, W - 56, 112], fill=HUTAN if l["jenis"] == "sewa" else (126, 98, 51))
    xx = x_label + 18
    for ch in label:
        d.text((xx, 74), ch, font=fl, fill=KREM)
        xx += d.textlength(ch, font=fl) + 4

    # panel bawah
    y = tinggi_foto + 52
    alis = (l["tipe"] + "  ·  " + tempat(l)).upper()
    fa = TEKS(26, 600)
    xx = 64
    for ch in alis:
        d.text((xx, y), ch, font=fa, fill=JERAMI)
        xx += d.textlength(ch, font=fa) + 3.2
    y += 58
    if l.get("harga"):
        teks_harga = rupiah(l["harga"])
        fh = TEGAK(170, 700)
        x = 60
        if l.get("hargaMulai"):
            fm = TEKS(34, 500)
            d.text((x, y + 42), "mulai", font=fm, fill=(200, 205, 195))
            x += d.textlength("mulai", font=fm) + 18
        d.text((x, y - 18), teks_harga, font=fh, fill=KREM)
        x += d.textlength(teks_harga, font=fh) + 20
        satuan = ("/ " + l["periode"]) if l.get("periode") else ("harga jual" if l["jenis"] == "jual" else "")
        d.text((x, y + 92), satuan, font=TEKS(36, 500), fill=(200, 205, 195))
    else:
        d.text((60, y), "Harga: hubungi kami", font=TEGAK(110, 700), fill=KREM)
    y += 190
    spek = "   ·   ".join(butir_spek(l, ringkas=True)[:4])
    if spek:
        d.text((64, y), spek, font=TEKS(30, 500), fill=(214, 220, 210))
    # kaki: wordmark + ajakan
    wm = Image.open(os.path.join(AKAR, "assets", "img", "wordmark-krem.png")).convert("RGBA")
    wm = wm.resize((int(wm.width * 64 / wm.height), 64), Image.LANCZOS)
    kanvas.paste(wm, (64, H - 64 - 52), wm)
    ajak = "Survei: WhatsApp " + WA_TAMPIL
    fj = TEKS(28, 600)
    d.text((W - 64 - d.textlength(ajak, font=fj), H - 64 - 38), ajak, font=fj, fill=KREM)
    d.line([(64, H - 150), (W - 64, H - 150)], fill=(60, 84, 68), width=1)
    return kanvas


def slide_foto(l, foto, ke, total):
    kanvas = isi_kotak(foto, W, H, 0.55).copy()
    d = ImageDraw.Draw(kanvas)
    plakat(d, 48, H - 48 - 64, l["kode"], 34)
    f = TEKS(26, 600)
    teks = "%d/%d" % (ke, total)
    lebar = d.textlength(teks, font=f)
    d.rounded_rectangle([W - 48 - lebar - 28, 48, W - 48, 96], radius=24, fill=HUTAN_TUA)
    d.text((W - 48 - lebar - 14, 58), teks, font=f, fill=KREM)
    return kanvas


def ajakan(l):
    kanvas = Image.new("RGB", (W, H), HUTAN)
    d = ImageDraw.Draw(kanvas)
    tinggi_tanda = gambar_tanda(d, (W - 300) / 2, 150, 300, KREM)
    y = 150 + tinggi_tanda + 90
    for baris in ["Tertarik dengan", l["kode"] + "?"]:
        f = TEGAK(140, 700)
        d.text(((W - d.textlength(baris, font=f)) / 2, y), baris, font=f, fill=KREM if "?" not in baris else JERAMI)
        y += 132
    y += 30
    f = TEKS(38, 500)
    for baris in bungkus(d, "Jadwalkan survei lokasi bersama agen kami — gratis, tanpa kewajiban sewa atau beli.", f, 820):
        d.text(((W - d.textlength(baris, font=f)) / 2, y), baris, font=f, fill=(214, 220, 210))
        y += 54
    y += 56
    kotak = [("WhatsApp", WA_TAMPIL), ("Sebutkan kode", l["kode"])]
    lebar_kotak, x = 420, (W - 420 * 2 - 24) / 2
    for judul, isi in kotak:
        d.rectangle([x, y, x + lebar_kotak, y + 150], outline=JERAMI, width=2)
        d.text((x + 28, y + 26), judul.upper(), font=TEKS(22, 700), fill=JERAMI)
        d.text((x + 28, y + 64), isi, font=TEGAK(62, 650), fill=KREM)
        x += lebar_kotak + 24
    f = TEKS(30, 500)
    teks = "Daftar lengkap & jadwal online: tautan di bio"
    d.text(((W - d.textlength(teks, font=f)) / 2, H - 120), teks, font=f, fill=(170, 182, 168))
    return kanvas


def caption(l):
    lk = l.get("lokasi") or {}
    harga = (("Mulai " if l.get("hargaMulai") else "") + rupiah(l["harga"]) +
             ((" / " + l["periode"]) if l.get("periode") else "")) if l.get("harga") else "Harga: hubungi kami"
    judul = ("DIJUAL" if l["jenis"] == "jual" else "DISEWAKAN") + " · " + l["tipe"].upper() + " · " + tempat(l)
    paragraf = (l.get("deskripsi") or [""])[0]
    if len(paragraf) > 300:
        paragraf = paragraf[:300].rsplit(" ", 1)[0] + "…"
    tag_wil = [lk.get("area"), nama_kab(lk.get("kabupaten")), "bali" if lk.get("provinsi") == "Bali" else "lombok"]
    tag = ["#sewain", "#" + ("jual" if l["jenis"] == "jual" else "sewa") + l["tipe"]]
    tag += ["#" + re.sub(r"\s+", "", t).lower() for t in tag_wil if t]
    tag += ["#propertibali" if lk.get("provinsi") == "Bali" else "#propertilombok", "#tempatusaha",
            "#" + ("propertidijual" if l["jenis"] == "jual" else "disewakan")]
    tag = list(dict.fromkeys(tag))
    baris = [judul, "", harga, ""] + ["• " + b for b in butir_spek(l)] + ["", paragraf, "",
             "Kode listing: " + l["kode"],
             "Jadwalkan survei via WhatsApp Sewain.id (tautan di bio), sebutkan kode " + l["kode"],
             "Detail & foto lengkap: tautan di bio", "", " ".join(tag)]
    teks = "\n".join(baris)
    return re.sub(r"\n{3,}", "\n\n", teks).strip()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--kode", required=True)
    a = p.parse_args()
    l = muat_listing(a.kode.upper())
    keluar = os.path.join(AKAR, "konten", l["kode"])
    os.makedirs(keluar, exist_ok=True)
    for lama in os.listdir(keluar):
        if lama.endswith(".jpg"):
            os.remove(os.path.join(keluar, lama))

    foto = []
    for u in (l.get("foto") or [])[:MAKS_FOTO + 1]:
        try:
            foto.append(foto_besar(u))
        except Exception as e:
            print("  foto dilewati (%s): %s" % (e, u[:70]))
    berkas = []
    def simpan(img, nama):
        jalur = os.path.join(keluar, nama)
        img.convert("RGB").save(jalur, "JPEG", quality=88, optimize=True, progressive=True)
        berkas.append(nama)

    simpan(sampul(l, foto[0] if foto else None), "01-sampul.jpg")
    # foto pertama sudah tampil di sampul; kalau fotonya banyak jangan diulang.
    # Kalau cuma 1-2 foto, tetap tampilkan utuh - sampul hanya memotongnya.
    tampil = foto[1:] if len(foto) >= 3 else foto
    for i, f in enumerate(tampil, start=1):
        simpan(slide_foto(l, f, i, len(tampil)), "%02d-foto.jpg" % (i + 1))
    simpan(ajakan(l), "%02d-ajakan.jpg" % (len(tampil) + 2))
    io.open(os.path.join(keluar, "caption.txt"), "w", encoding="utf-8").write(caption(l))
    json.dump({"kode": l["kode"], "berkas": berkas, "jumlahFotoListing": len(l.get("foto") or [])},
              io.open(os.path.join(keluar, "info.json"), "w", encoding="utf-8"), indent=1)
    print("bahan %s siap: %d slide di %s" % (l["kode"], len(berkas), keluar))


if __name__ == "__main__":
    main()
