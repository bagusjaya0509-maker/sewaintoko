# -*- coding: utf-8 -*-
"""Ubah listing Blogger sewatoko.com menjadi data terstruktur untuk situs Sewain.

Pakai:  python alat/migrasi-blogger.py
Hasil:  data/listing.json  (cuplikan publik, juga dipakai sebagai cadangan
        kalau API tidak terjangkau)

Prinsip: hanya memindahkan apa yang TERTULIS di listing asli. Harga yang tidak
bisa dibaca dengan yakin dibiarkan kosong (tampil "Hubungi kami"), bukan ditebak.
Koordinat dari geocoding nama kelurahan = PERKIRAAN AREA, ditandai demikian.
"""
import hashlib
import html
import io
import json
import os
import re
import time
import urllib.parse
import urllib.request

AKAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEED = "https://www.sewatoko.com/feeds/posts/default?alt=json&max-results=500"
CACHE_GEO = os.path.join(AKAR, "alat", "cache-geocode.json")
UA = "SewainMigrasi/1.0 (+https://www.sewatoko.com)"

KABUPATEN = {
    "denpasar": "Kota Denpasar",
    "badung": "Kabupaten Badung",
    "klungkung": "Kabupaten Klungkung",
    "gianyar": "Kabupaten Gianyar",
    "tabanan": "Kabupaten Tabanan",
}


def ambil(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8")


def judul_huruf(s):
    return " ".join(w[:1].upper() + w[1:] for w in s.strip().split())


def bersihkan(html_isi):
    t = re.sub(r"\[fitur[^\]]*\].*?\[/fitur\]", " ", html_isi, flags=re.S)
    t = re.sub(r"<br\s*/?>", "\n", t)
    t = re.sub(r"</(p|div|li|h\d|tr)>", "\n", t)
    t = re.sub(r"<[^>]+>", " ", t)
    t = html.unescape(t).replace("²", "2")
    t = re.sub(r"[ \t ]+", " ", t)
    baris, lihat = [], set()
    for b in (x.strip() for x in t.split("\n")):
        if len(b) < 3:
            continue
        kunci = b.lower()[:80]
        if kunci in lihat:          # listing lama sering mengulang paragraf pembuka
            continue
        lihat.add(kunci)
        baris.append(b)
    return baris


def fitur(html_isi):
    hasil = []
    for m in re.finditer(r'\[fitur[^\]]*title="([^"]*)"[^\]]*\](.*?)\[/fitur\]', html_isi, flags=re.S):
        isi = html.unescape(re.sub(r"<[^>]+>", " ", m.group(2)))
        isi = re.sub(r"\s+", " ", isi).strip()
        if isi:
            hasil.append({"judul": m.group(1).strip(), "isi": isi})
    return hasil


ANGKA = r"(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)"


def ke_angka(s):
    s = s.strip()
    if re.fullmatch(r"\d{1,3}(?:\.\d{3})+", s):   # 1.500.000
        return float(s.replace(".", ""))
    if re.fullmatch(r"\d{1,3}(?:,\d{3})+", s):    # 1,500,000
        return float(s.replace(",", ""))
    return float(s.replace(",", "."))             # 1,5 atau 65


POLA_HARGA = re.compile(
    r"Rp\.?\s*" + ANGKA + r"\s*(miliar|milyar|juta|jt|m|rb|ribu)?\b([^\n]{0,40})", re.I)


def semua_harga(teks):
    """Semua nominal Rupiah >= 1 juta dalam teks: [(nilai, periode, posisi)]."""
    hasil = []
    for m in POLA_HARGA.finditer(teks):
        nilai = ke_angka(m.group(1))
        s = (m.group(2) or "").lower()
        if s in ("miliar", "milyar", "m"):
            nilai *= 1_000_000_000
        elif s in ("juta", "jt"):
            nilai *= 1_000_000
        elif s in ("rb", "ribu"):
            nilai *= 1_000
        if nilai < 1_000_000:          # terlalu kecil untuk harga properti
            continue
        ekor = (m.group(3) or "").lower()
        periode = "bulan" if "bulan" in ekor else ("tahun" if ("tahun" in ekor or "thn" in ekor) else None)
        hasil.append((int(nilai), periode, m.start(), m.end()))
    return hasil


def jendela(teks, awal, akhir, lebar=90):
    """Potongan teks di sekitar nominal, dipotong di batas kata - BUKAN di titik,
    karena titik juga dipakai di '1.300 watt' dan 'Rp1.500.000'."""
    a = max(0, awal - lebar)
    b = min(len(teks), akhir + lebar)
    if a > 0:
        a = teks.find(" ", a) + 1
    if b < len(teks):
        b = teks.rfind(" ", 0, b)
    return ("..." if a > 0 else "") + teks[a:b].strip() + ("..." if b < len(teks) else "")


def baca_harga(fitur_list, teks):
    """(harga_terendah, periode, kalimat_asli, mulai) atau (None, None, None, False).
    Prioritas: blok fitur berjudul 'Harga'; kalau tidak ada, teks deskripsi."""
    for f in fitur_list:
        if "harga" in f["judul"].lower():
            daftar = semua_harga(f["isi"])
            if daftar:
                terendah = min(daftar, key=lambda x: x[0])
                return terendah[0], terendah[1], f["isi"], len({d[0] for d in daftar}) > 1
    daftar = semua_harga(teks)
    if daftar:
        # satu listing bisa punya beberapa harga (per ukuran, per masa sewa,
        # dengan/tanpa furnitur). Ambil yang berdekatan dengan harga pertama.
        gugus = [d for d in daftar if d[2] - daftar[0][2] <= 400]
        terendah = min(gugus, key=lambda x: x[0])
        teks_gugus = jendela(teks, gugus[0][2], gugus[-1][3])
        return terendah[0], terendah[1] or gugus[0][1], teks_gugus, len({d[0] for d in gugus}) > 1
    return None, None, None, False


def cari(pola, teks, ubah=lambda x: x):
    m = re.search(pola, teks, re.I)
    return ubah(m.group(1)) if m else None


def spesifikasi(teks):
    s = {}
    lt = cari(r"luas tanah\s*(?:sekitar\s*)?" + ANGKA + r"\s*m", teks, ke_angka)
    lb = cari(r"luas bangunan\s*(?:sekitar\s*)?" + ANGKA + r"\s*m", teks, ke_angka)
    dim = re.search(r"(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:meter|m\b)", teks, re.I)
    listrik = cari(r"listrik\s*(?:sebesar\s*)?" + ANGKA + r"\s*(?:watt|w\b|va)", teks, ke_angka)
    km = cari(r"(\d+)\s*kamar mandi", teks, int)
    kt = cari(r"(\d+)\s*kamar tidur", teks, int)
    lantai = cari(r"(\d+)\s*lantai", teks, int)
    if lt: s["luasTanah"] = lt
    if lb: s["luasBangunan"] = lb
    if dim: s["dimensi"] = "%s x %s m" % (dim.group(1), dim.group(2))
    if listrik and listrik >= 450: s["listrikWatt"] = int(listrik)
    if km: s["kamarMandi"] = km
    if kt: s["kamarTidur"] = kt
    if lantai and lantai <= 6: s["lantai"] = lantai
    air = []
    if re.search(r"\bPAM\b|PDAM", teks): air.append("PAM")
    if re.search(r"sumur", teks, re.I): air.append("Sumur bor")
    if air: s["air"] = air
    sert = [x for x in ("SHM", "HGB", "IMB", "PBG", "SHGB") if re.search(r"\b" + x + r"\b", teks)]
    if sert: s["legalitas"] = sert
    if re.search(r"parkir", teks, re.I): s["parkir"] = True
    if re.search(r"jalan utama|jalan raya|pinggir jalan", teks, re.I): s["jalanUtama"] = True
    return s


def jenis_dan_tipe(judul):
    j = judul.lower()
    jenis = "jual" if j.startswith("jual") else "sewa"
    if "kontrakan" in j: tipe = "kontrakan"
    elif "rumah" in j: tipe = "rumah"
    elif "gudang" in j: tipe = "gudang"
    elif "tanah" in j: tipe = "tanah"
    elif "ruko" in j: tipe = "ruko"
    else: tipe = "toko"
    return jenis, tipe


def geocode(area, kab, cache):
    kunci = "%s|%s" % (area, kab)
    if kunci in cache:
        return cache[kunci]
    for q in ("%s, %s, Bali, Indonesia" % (area, kab), "%s, Bali, Indonesia" % area):
        url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
            {"q": q, "format": "json", "limit": 1, "countrycodes": "id"})
        try:
            data = json.loads(ambil(url))
        except Exception as e:
            print("   geocode gagal:", q, e)
            data = []
        time.sleep(1.1)   # kebijakan Nominatim: maksimal 1 permintaan/detik
        if data:
            hasil = {"lat": round(float(data[0]["lat"]), 6), "lng": round(float(data[0]["lon"]), 6)}
            cache[kunci] = hasil
            return hasil
    cache[kunci] = None
    return None


def buang_gambar_pengganti(listing, ambang_listing=5, ambang_bit=20):
    """Situs lama menyisipkan gambar promosi ('Foto detail properti akan segera
    tersedia', 'Situs sedang maintenance', infografis keunggulan) di banyak
    posting - tiap kali diunggah ulang, jadi URL-nya berbeda. Dikenali dari
    ISINYA: sidik dHash 256 bit; gambar yang mirip di >= 5 listing berbeda
    bukan foto bangunan. Foto asli yang dipakai 2-3 listing (unit berbeda di
    satu gedung) tetap aman di bawah ambang ini."""
    from concurrent.futures import ThreadPoolExecutor
    from PIL import Image
    folder = os.path.join(AKAR, "alat", "cache-foto")
    os.makedirs(folder, exist_ok=True)

    def sidik(url):
        nama = hashlib.sha1(url.encode()).hexdigest()[:16] + ".jpg"
        p = os.path.join(folder, nama)
        if not os.path.exists(p):
            kecil = re.sub(r"/s\d+(-[a-z0-9-]+)?/", "/s320/", url)
            req = urllib.request.Request(kecil, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                open(p, "wb").write(r.read())
        im = Image.open(p).convert("L").resize((17, 16), Image.LANCZOS)
        px = list(im.getdata())
        b = 0
        for y in range(16):
            for x in range(16):
                b = (b << 1) | (px[y * 17 + x] > px[y * 17 + x + 1])
        return b

    semua = [(l["kode"], u) for l in listing for u in l["foto"]]
    with ThreadPoolExecutor(8) as ex:
        sidiknya = list(ex.map(lambda t: sidik(t[1]), semua))
    gugus = []
    for (kode, url), s in zip(semua, sidiknya):
        for g in gugus:
            if bin(g["wakil"] ^ s).count("1") <= ambang_bit:
                g["anggota"].append((kode, url))
                break
        else:
            gugus.append({"wakil": s, "anggota": [(kode, url)]})
    terlarang = set()
    for g in gugus:
        if len({k for k, _ in g["anggota"]}) >= ambang_listing:
            terlarang.update(u for _, u in g["anggota"])
    dibuang = 0
    for l in listing:
        sebelum = len(l["foto"])
        l["foto"] = [u for u in l["foto"] if u not in terlarang]
        dibuang += sebelum - len(l["foto"])
    print("gambar pengganti dibuang:", dibuang, "dari", len(semua), "| listing jadi tanpa foto:",
          [l["kode"] for l in listing if not l["foto"]])


def main():
    feed = json.loads(ambil(FEED))
    cache = json.load(io.open(CACHE_GEO, encoding="utf-8")) if os.path.exists(CACHE_GEO) else {}
    listing, dilewati = [], []

    for e in feed["feed"].get("entry", []):
        judul = e["title"]["$t"].strip()
        label = [c["term"] for c in e.get("category", [])]
        if "Artikel" in label:
            continue
        mk = re.search(r"\b([A-Z]{2,4}-\d{2,4})\b", judul)
        if not mk:
            dilewati.append(judul)
            continue
        kode = mk.group(1)
        isi = e["content"]["$t"]
        teks = " ".join(bersihkan(isi))
        teks_lengkap = teks + " " + " ".join(f["isi"] for f in fitur(isi))
        jenis, tipe = jenis_dan_tipe(judul)

        kab_label = next((l for l in label if l.lower() in KABUPATEN), None)
        area_label = next((l for l in label if l.lower() not in KABUPATEN), None)
        kabupaten = KABUPATEN.get((kab_label or "").lower())
        area = judul_huruf(area_label) if area_label else None

        daftar_fitur = fitur(isi)
        harga, periode, kalimat, mulai = baca_harga(daftar_fitur, teks)
        if jenis == "jual":
            periode = None          # harga jual = harga total, tidak pernah "per tahun"
        if kalimat and re.search(r"mulai\s+Rp", kalimat, re.I):
            mulai = True            # listing sendiri menulis "mulai Rp..."
        foto = []
        for src in re.findall(r'<img[^>]+src="([^"]+)"', isi):
            src = re.sub(r"/s\d+(-[a-z0-9-]+)?/", "/s1600/", src)
            src = re.sub(r"=s\d+(-[a-z0-9-]+)?$", "=s1600", src)
            if src not in foto:
                foto.append(src)

        lokasi = {"provinsi": "Bali", "kabupaten": kabupaten, "area": area}
        if area and kabupaten:
            titik = geocode(area, kabupaten, cache)
            if titik:
                lokasi.update(titik)
                lokasi["presisi"] = "area"     # BUKAN titik properti
        tautan = next((l["href"] for l in e["link"] if l["rel"] == "alternate"), None)

        listing.append({
            "kode": kode,
            "judul": "%s %s %s" % ("Dijual" if jenis == "jual" else "Disewakan",
                                   tipe.capitalize(), ("di " + area) if area else ""),
            "jenis": jenis,
            "tipe": tipe,
            "status": "tersedia",
            "unggulan": False,
            "harga": harga,
            "hargaMulai": mulai,
            "periode": periode,
            "hargaTeks": kalimat,
            "lokasi": lokasi,
            "spesifikasi": spesifikasi(teks_lengkap),
            "fitur": daftar_fitur,
            "deskripsi": bersihkan(isi)[:8],
            "foto": foto,
            "video": [],
            "dibuat": e["published"]["$t"][:19],
            "diubah": e["updated"]["$t"][:19],
            "sumber": tautan,
            "terbit": True,
        })
        time.sleep(0)

    json.dump(cache, io.open(CACHE_GEO, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    buang_gambar_pengganti(listing)
    listing.sort(key=lambda x: x["dibuat"], reverse=True)
    keluar = os.path.join(AKAR, "data", "listing.json")
    json.dump({"diperbarui": time.strftime("%Y-%m-%dT%H:%M:%S"), "listing": listing},
              io.open(keluar, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print("listing dimigrasi :", len(listing))
    print("dilewati (tanpa kode):", dilewati)
    print("tanpa harga terbaca:", [l["kode"] for l in listing if not l["harga"]])
    print("tanpa koordinat     :", [l["kode"] for l in listing if "lat" not in l["lokasi"]])
    print("tanpa foto          :", [l["kode"] for l in listing if not l["foto"]])


if __name__ == "__main__":
    main()
