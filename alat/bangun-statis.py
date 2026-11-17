"""
bangun-statis.py — membangun halaman statis situs Sewain dari data.

  python alat/bangun-statis.py

Yang dibangun:
  1. Artikel pindahan Blogger di URL LAMANYA (/2026/MM/slug.html) + artikel/index.html
     + artikel/daftar.json (dipakai beranda). Gambar sampul ditarik ke repo.
  2. Halaman listing pindahan di URL lamanya (/2026/MM/sewa-toko-xxx.html):
     isi inti (judul, harga, foto, deskripsi) DITULIS di HTML supaya terbaca
     mesin pencari, lalu listing.js menggantinya dengan tampilan lengkap.
  3. /p/profile-tim.html (Tentang), /p/privacy-policy.html, /p/list-status-....html
  4. sitemap.xml + robots.txt untuk domain www.sewatoko.com

ATURAN: URL lama TIDAK BOLEH diubah — GitHub Pages tidak bisa 301, jadi
mengubah URL = membuang indeks Google (pelajaran migrasi Aromara).
"""
import html, io, json, os, re, sys, urllib.request
from datetime import datetime, timezone

AKAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOMAIN = 'https://www.sewatoko.com'
API = 'https://sewain.103-253-145-38.sslip.io'
CACHE = os.path.join(AKAR, 'alat', 'cache-blogger')

def tulis(jalur, isi):
    p = os.path.join(AKAR, jalur)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8', newline='\n') as f:
        f.write(isi)

def e(s):
    return html.escape(str(s or ''), quote=True)

# ------------------------------------------------------------------ kerangka
def halaman(*, judul, deskripsi, kanonik, kedalaman, isi, kepala_tambahan='', body_attr='', skrip='', gambar=None, jenis='website', noindex=False):
    akar = '../' * kedalaman or './'
    og = gambar or DOMAIN + '/assets/img/stok/hero-atap-canggu.jpg'
    return f'''<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(judul)}</title>
<meta name="description" content="{e(deskripsi)}">
<meta name="theme-color" content="#1D3125">
{'<meta name="robots" content="noindex">' if noindex else ''}
<link rel="canonical" href="{e(kanonik)}">
<meta property="og:type" content="{jenis}">
<meta property="og:site_name" content="Sewain Property Agency">
<meta property="og:title" content="{e(judul)}">
<meta property="og:description" content="{e(deskripsi)}">
<meta property="og:image" content="{e(og)}">
<meta property="og:url" content="{e(kanonik)}">
<link rel="icon" href="{akar}assets/img/ikon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="{akar}assets/img/ikon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet">
{kepala_tambahan}<link rel="stylesheet" href="{akar}assets/css/sewain.css?v=20261117d">
<link rel="stylesheet" href="{akar}assets/css/sewain-v2.css?v=20261117d">
<link rel="stylesheet" href="{akar}assets/css/sewain-v3.css?v=20261117d">
</head>
<body data-akar="{akar}"{body_attr}>

<header class="kepala" data-kerangka></header>

{isi}

<footer class="kaki" data-kerangka></footer>

{skrip or f'<script type="module" src="{akar}assets/js/inti.js?v=20261117d"></script>'}
</body>
</html>
'''

# ------------------------------------------------------------------ pembersih HTML Blogger
IZIN = {'p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'br', 'blockquote', 'table', 'tr', 'td', 'th', 'tbody', 'thead'}
GANTI = {'b': 'strong', 'i': 'em', 'h1': 'h2', 'h4': 'h3'}

def bersihkan(isi):
    isi = re.sub(r'<(script|style|noscript)[^>]*>.*?</\1>', '', isi, flags=re.S | re.I)
    isi = re.sub(r'<!--.*?-->', '', isi, flags=re.S)
    isi = re.sub(r'</?o:p>', '', isi, flags=re.I)
    isi = re.sub(r'<img[^>]*>', '', isi, flags=re.I)
    def tag(m):
        tutup, nama, attr = m.group(1), m.group(2).lower(), m.group(3) or ''
        nama = GANTI.get(nama, nama)
        if nama not in IZIN:
            return '\n' if nama in ('div', 'section', 'article') else ''
        if tutup:
            return f'</{nama}>'
        if nama == 'a':
            h = re.search(r'href\s*=\s*"([^"]+)"', attr)
            href = h.group(1) if h else ''
            if not href or href.startswith('javascript'):
                return '<a>'
            href = href.replace('http://www.sewatoko.com', '').replace('https://www.sewatoko.com', '')
            luar = href.startswith('http')
            return f'<a href="{e(href)}"' + (' rel="noopener" target="_blank"' if luar else '') + '>'
        return f'<{nama}>'
    isi = re.sub(r'<(/?)([a-zA-Z][\w:]*)([^>]*)>', tag, isi)
    isi = re.sub(r'<a>(.*?)</a>', r'\1', isi, flags=re.S)
    isi = isi.replace('&nbsp;', ' ')
    # Teks tempelan Word berisi pindah baris DI DALAM paragraf: ratakan semua
    # spasi dulu, baru pisahkan lagi di batas blok yang sebenarnya.
    isi = re.sub(r'\s+', ' ', isi)
    isi = re.sub(r'\s*(</(?:p|h2|h3|ul|ol|li|blockquote|table)>)\s*', r'\1\n', isi)
    isi = re.sub(r'\s*(<(?:p|h2|h3|ul|ol|blockquote|table)>)', r'\n\1', isi)
    isi = re.sub(r'<a [^>]*>\s*</a>', '', isi)
    # teks yang menggantung di luar <p> dibungkus paragraf
    potong = []
    for blok in re.split(r'\n\s*\n|\n', isi):
        b = blok.strip()
        if not b:
            continue
        if not re.match(r'<(p|h2|h3|ul|ol|li|blockquote|table|/)', b):
            b = f'<p>{b}</p>'
        potong.append(b)
    isi = '\n'.join(potong)
    for _ in range(3):
        isi = re.sub(r'<(p|strong|em|h2|h3|li)>\s*(<br>\s*)*</\1>', '', isi)
    isi = re.sub(r'(<br>\s*){2,}', '<br>', isi)
    isi = re.sub(r'<p>\s*<br>', '<p>', isi)
    # Judul gaya Word (paragraf berisi teks tebal pendek saja) jadi <h2> sungguhan.
    isi = re.sub(r'<p>\s*<strong>([^<]{4,90})</strong>\s*</p>', lambda m: '<h2>' + m.group(1).strip().rstrip(':') + '</h2>', isi)
    return isi.strip()

def teks_polos(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()

def unduh_gambar(url, nama):
    """Sampul artikel: WebP untuk halaman, JPG 1200 untuk pratinjau WhatsApp/Facebook."""
    from PIL import Image
    tuju_webp = os.path.join(AKAR, 'assets', 'img', 'artikel', nama + '.webp')
    tuju_jpg = os.path.join(AKAR, 'assets', 'img', 'artikel', nama + '.jpg')
    if os.path.exists(tuju_webp) and os.path.exists(tuju_jpg):
        return
    os.makedirs(os.path.dirname(tuju_webp), exist_ok=True)
    url = re.sub(r'/s\d+(-[\w-]+)?/', '/s1600/', url)
    data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60).read()
    im = Image.open(io.BytesIO(data)).convert('RGB')
    if im.width > 1400:
        im = im.resize((1400, round(im.height * 1400 / im.width)), Image.LANCZOS)
    im.save(tuju_webp, 'WEBP', quality=80, method=6)
    j = im.copy()
    if j.width > 1200:
        j = j.resize((1200, round(j.height * 1200 / j.width)), Image.LANCZOS)
    j.save(tuju_jpg, 'JPEG', quality=82, optimize=True, progressive=True)

# ------------------------------------------------------------------ 1. artikel
def bangun_artikel():
    d = json.load(open(os.path.join(CACHE, 'posts.json'), encoding='utf-8'))
    daftar = []
    for en in d['feed']['entry']:
        tautan = [l['href'] for l in en['link'] if l['rel'] == 'alternate'][0]
        if re.search(r'/(sewa|jual)-toko-', tautan):
            continue
        jalur = re.sub(r'^https?://[^/]+', '', tautan)
        slug = jalur.rsplit('/', 1)[1][:-5]
        judul = re.sub(r'\s*-\s*sewatoko\.com\s*$', '', en['title']['$t']).strip()
        mentah = en['content']['$t']
        gambar = re.search(r'<img[^>]+src="([^"]+)"', mentah)
        isi = bersihkan(mentah)
        polos = teks_polos(isi)
        ringkas = polos[:155].rsplit(' ', 1)[0] + '…' if len(polos) > 158 else polos
        terbit = en['published']['$t'][:10]
        ubah = en['updated']['$t'][:10]
        url_gambar = None
        if gambar:
            unduh_gambar(gambar.group(1), slug)
            url_gambar = '/assets/img/artikel/' + slug
        kedalaman = jalur.count('/') - 1
        akar = '../' * kedalaman
        kata = len(polos.split())
        ld = {'@context': 'https://schema.org', '@type': 'Article', 'headline': judul, 'datePublished': terbit, 'dateModified': ubah,
              'author': {'@type': 'Organization', 'name': 'Sewain Property Agency'},
              'publisher': {'@type': 'Organization', 'name': 'Sewain Property Agency', 'logo': {'@type': 'ImageObject', 'url': DOMAIN + '/assets/img/ikon-512.png'}},
              'mainEntityOfPage': DOMAIN + jalur, 'wordCount': kata}
        if url_gambar:
            ld['image'] = DOMAIN + url_gambar + '.jpg'
        tgl_tampil = datetime.strptime(terbit, '%Y-%m-%d').strftime('%d %B %Y')
        BULAN = dict(January='Januari', February='Februari', March='Maret', April='April', May='Mei', June='Juni', July='Juli',
                     August='Agustus', September='September', October='Oktober', November='November', December='Desember')
        for en_b, id_b in BULAN.items():
            tgl_tampil = tgl_tampil.replace(en_b, id_b)
        badan = f'''<main class="wadah">
  <article class="artikel">
    <nav class="remah" aria-label="Lokasi halaman"><a href="{akar}">Beranda</a> / <a href="{akar}artikel/">Artikel</a></nav>
    <p class="alis">Artikel</p>
    <h1>{e(judul)}</h1>
    <p class="meta"><time datetime="{terbit}">{tgl_tampil}</time> · {max(1, round(kata / 200))} menit membaca</p>
    {f'<img src="{akar}{url_gambar[1:]}.webp" alt="" width="1400" class="sampul-artikel">' if url_gambar else ''}
    <div class="artikel-isi">
{isi}
    </div>
    <aside class="artikel-ajak">
      <p><b>Sedang mencari tempat usaha?</b><br>Lihat toko, ruko, dan rumah yang sedang ditawarkan Sewain di Bali dan NTB, atau jadwalkan konsultasi lokasi.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="tombol tombol--terang" href="{akar}properti/">Lihat properti</a><a class="tombol tombol--garis" style="color:var(--krem);border-color:rgba(243,239,228,.4)" href="{akar}konsultasi/">Jadwalkan konsultasi</a></div>
    </aside>
  </article>
</main>'''
        tulis(jalur.lstrip('/'), halaman(judul=judul + ' — Sewain', deskripsi=ringkas, kanonik=DOMAIN + jalur, kedalaman=kedalaman, isi=badan,
                                          gambar=(DOMAIN + url_gambar + '.jpg') if url_gambar else None, jenis='article',
                                          kepala_tambahan=f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>\n',
                                          body_attr=' data-halaman="artikel"'))
        daftar.append({'judul': judul, 'jalur': jalur, 'tanggal': terbit, 'diubah': ubah, 'ringkas': ringkas,
                       'gambar': (url_gambar[1:] + '.webp') if url_gambar else None})
    daftar.sort(key=lambda a: a['tanggal'], reverse=True)
    tulis('artikel/daftar.json', json.dumps({'artikel': daftar}, ensure_ascii=False, indent=1))
    kartu = '\n'.join(f'''      <a class="kartu-artikel" href="../{a['jalur'][1:]}">
        <figure>{f'<img src="../{a["gambar"]}" alt="" loading="lazy">' if a['gambar'] else ''}</figure>
        <div><time datetime="{a['tanggal']}">{a['tanggal'][8:10]}/{a['tanggal'][5:7]}/{a['tanggal'][:4]}</time><h3>{e(a['judul'])}</h3><p>{e(a['ringkas'])}</p></div>
      </a>''' for a in daftar)
    badan = f'''<main>
  <section class="halaman-kepala"><div class="wadah">
    <p class="alis">Artikel</p>
    <h1 class="judul-1">Panduan sewa &amp; jual-beli properti</h1>
    <p class="lead">Hal yang perlu diperiksa sebelum menyewa tempat usaha, menandatangani kontrak, atau membeli properti di Bali dan NTB.</p>
  </div></section>
  <section class="bagian" style="padding-top:32px"><div class="wadah"><div class="grid-artikel">
{kartu}
  </div></div></section>
</main>'''
    tulis('artikel/index.html', halaman(judul='Artikel Properti & Tempat Usaha — Sewain', deskripsi='Panduan memilih lokasi usaha, kontrak sewa, dan negosiasi harga properti di Bali dan NTB dari Sewain Property Agency.',
                                         kanonik=DOMAIN + '/artikel/', kedalaman=1, isi=badan, body_attr=' data-halaman="artikel"'))
    return daftar

# ------------------------------------------------------------------ 2. listing di URL lama
def rupiah(n):
    if n is None:
        return None
    if n >= 1e9:
        return 'Rp' + f'{n / 1e9:.2f}'.rstrip('0').rstrip('.').replace('.', ',') + ' M'
    if n >= 1e6:
        return 'Rp' + f'{n / 1e6:.1f}'.rstrip('0').rstrip('.').replace('.', ',') + ' jt'
    return 'Rp' + f'{n:,.0f}'.replace(',', '.')

def ambil_listing():
    try:
        with urllib.request.urlopen(API + '/api/listing', timeout=20) as r:
            dari_api = json.load(r)['listing']
    except Exception as x:
        print('  API tidak terjangkau (' + str(x) + '), memakai data/listing.json')
        dari_api = []
    lokal = json.load(open(os.path.join(AKAR, 'data', 'listing.json'), encoding='utf-8'))['listing']
    sumber = {l['kode']: l.get('sumber') for l in lokal}
    hasil = {l['kode']: l for l in lokal}
    for l in dari_api:                      # data terbaru menang, sumber tetap dari arsip
        l = dict(l)
        l['sumber'] = sumber.get(l['kode']) or (DOMAIN + l['halaman'] if l.get('halaman') else None)
        hasil[l['kode']] = l
    return list(hasil.values())

def bangun_listing(semua):
    jalur_semua = []
    for l in semua:
        m = re.match(r'^https?://(?:www\.)?sewatoko\.com(/\d{4}/\d{2}/[a-z0-9_-]+\.html)$', l.get('sumber') or '')
        if not m:
            continue
        jalur = m.group(1)
        tempat = ', '.join(x for x in [(l.get('lokasi') or {}).get('area'), re.sub(r'^(Kabupaten|Kota)\s+', '', (l.get('lokasi') or {}).get('kabupaten') or '')] if x)
        harga = rupiah(l.get('harga'))
        satuan = ('/ ' + l['periode']) if l.get('periode') else ('harga jual' if l.get('jenis') == 'jual' else '')
        jenis = 'Dijual' if l.get('jenis') == 'jual' else 'Disewakan'
        desk = f"{jenis} {l.get('tipe', '')} di {tempat}" + (f", {'mulai ' if l.get('hargaMulai') else ''}{harga} {satuan}" if harga else '') + f". Kode {l['kode']}. Lihat foto, video, dan lokasi, lalu jadwalkan survei bersama Sewain."
        foto = l.get('foto') or []
        badan = f'''<main class="detail">
  <div class="wadah" id="isi">
    <nav class="remah" aria-label="Lokasi halaman"><a href="../../">Beranda</a> / <a href="../../properti/">Properti</a> / {e(l['kode'])}</nav>
    <div class="detail-kepala"><div>
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px"><span class="plakat">{e(l['kode'])}</span><span class="lencana-kartu">{jenis}</span></div>
      <h1 class="judul-1">{e(l.get('judul'))}</h1>
      <p class="kartu-lokasi" style="font-size:15px;margin:12px 0 0">{e(tempat)}{', ' + e((l.get('lokasi') or {}).get('provinsi')) if (l.get('lokasi') or {}).get('provinsi') else ''}</p>
    </div></div>
    {f'<img src="{e(foto[0])}" alt="{e(l.get("judul"))}" style="width:100%;max-height:560px;object-fit:cover;border-radius:6px">' if foto else ''}
    <div class="detail-susun"><div>
      <section class="blok"><h2>Harga</h2><p class="harga-besar" style="color:var(--hutan)">{('mulai ' if l.get('hargaMulai') else '') + harga + ' <small>' + e(satuan) + '</small>' if harga else 'Hubungi kami'}</p>{f'<p>{e(l.get("hargaTeks"))}</p>' if l.get('hargaTeks') else ''}</section>
      <section class="blok prosa"><h2>Deskripsi</h2>{''.join(f'<p>{e(p)}</p>' for p in (l.get('deskripsi') or []))}</section>
      {''.join(f'<section class="blok"><h3>{e(f.get("judul"))}</h3><p>{e(f.get("isi"))}</p></section>' for f in (l.get('fitur') or [])[:8])}
    </div></div>
  </div>
</main>'''
        skrip = '''<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script type="module" src="../../assets/js/listing.js?v=20261117d"></script>'''
        sorot = '''<div class="sorot" id="sorot" role="dialog" aria-modal="true" aria-label="Foto properti">
  <img alt="">
  <button class="tutup" type="button" aria-label="Tutup">×</button>
  <button class="sebelum" type="button" aria-label="Foto sebelumnya">‹</button>
  <button class="sesudah" type="button" aria-label="Foto berikutnya">›</button>
  <span class="hitung"></span>
</div>'''
        tulis(jalur.lstrip('/'), halaman(judul=f"{l.get('judul')} ({l['kode']}) — Sewain", deskripsi=desk, kanonik=DOMAIN + jalur, kedalaman=2,
                                          isi=badan + '\n\n' + sorot, skrip=skrip, gambar=foto[0] if foto else None,
                                          kepala_tambahan='<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">\n',
                                          body_attr=f' data-halaman="listing" data-kode="{e(l["kode"])}"'))
        jalur_semua.append((jalur, l.get('diubah') or l.get('dibuat')))
    # Posting ganda di Blogger (DPS-038 terbit dua kali): URL keduanya dipertahankan,
    # kanonik menunjuk ke URL utama supaya tidak dianggap konten ganda.
    ganda = {'/2026/05/sewa-toko-dps-038_02101024298.html': '/2026/05/sewa-toko-dps-038.html'}
    for lama, utama in ganda.items():
        p = os.path.join(AKAR, utama.lstrip('/'))
        if os.path.exists(p):
            s = open(p, encoding='utf-8').read().replace(f'<link rel="canonical" href="{DOMAIN}{utama}">', f'<link rel="canonical" href="{DOMAIN}{utama}">', 1)
            tulis(lama.lstrip('/'), s)
    return jalur_semua

# ------------------------------------------------------------------ 3. halaman /p/
def bangun_halaman_p():
    tim = f'''<main>
  <section class="halaman-kepala"><div class="wadah">
    <p class="alis">Tentang kami</p>
    <h1 class="judul-1">Sewain Property Agency</h1>
    <p class="lead">Agen sewa dan jual-beli toko, ruko, dan rumah di Bali dan Nusa Tenggara Barat. Kami menampilkan harga, ukuran, foto, dan lokasi secara terbuka, lalu mendampingi survei hingga perjanjian tertulis.</p>
  </div></section>
  <section class="bagian" style="padding-top:36px"><div class="wadah">
    <div class="detail-susun" style="margin-top:0">
      <div>
        <section class="blok prosa">
          <h2>Cara kami bekerja</h2>
          <p>Setiap properti yang kami tawarkan diberi kode, misalnya DPS-028 untuk Denpasar. Kode itu dipakai di situs, media sosial, dan percakapan WhatsApp, supaya Anda dan agen selalu membicarakan unit yang sama.</p>
          <p>Calon penyewa dan pembeli bisa memilih jadwal survei langsung dari halaman properti. Pemilik properti bisa menitipkan unitnya lewat akun, lengkap dengan foto dan data, lalu agen memeriksa sebelum menayangkannya.</p>
          <p>Kami mendorong setiap transaksi memakai perjanjian tertulis yang jelas: harga, jangka waktu, deposit, dan pembagian biaya perawatan.</p>
        </section>
        <section class="blok prosa">
          <h2>Pendiri</h2>
          <h3 style="margin:0 0 6px">Bagus Jayepuspite</h3>
          <p>Saya melihat permasalahan properti sering terjadi karena kurangnya kepastian hukum. Untuk itu saya mengembangkan platform yang mengedepankan transparansi, validitas informasi, dan kontrak yang jelas agar transaksi lebih aman.</p>
          <ul>
            <li>2017–2021 · Mahasiswa Hukum Universitas Mataram</li>
            <li>2021–2024 · Freelance Legal Counsel, PT Fastwork Asia Indonesia</li>
            <li>2022–2025 · Teller &amp; Bisnis Support, PT Bank Mandiri (Persero) Tbk</li>
            <li>2023–2024 · Web Project &amp; Legal Counsel</li>
          </ul>
        </section>
      </div>
      <aside class="panel-samping">
        <div class="kotak-harga">
          <p class="alis">Hubungi kami</p>
          <p style="margin:0 0 14px">Senin–Sabtu, 09.00–17.00 WITA</p>
          <a class="tombol tombol--terang tombol--penuh" href="https://wa.me/message/6HMVH6NMUEAQD1" target="_blank" rel="noopener">WhatsApp Sewain.id</a>
          <a class="tombol tombol--garis tombol--penuh" style="margin-top:10px;color:var(--krem);border-color:rgba(243,239,228,.4)" href="../konsultasi/">Jadwalkan konsultasi</a>
        </div>
      </aside>
    </div>
  </div></section>
</main>'''
    tulis('p/profile-tim.html', halaman(judul='Tentang Sewain Property Agency', deskripsi='Sewain Property Agency: agen sewa dan jual-beli toko, ruko, dan rumah di Bali dan Nusa Tenggara Barat. Cara kerja dan pendiri kami.',
                                         kanonik=DOMAIN + '/p/profile-tim.html', kedalaman=1, isi=tim, body_attr=' data-halaman="tentang"'))
    tulis('p/profile-bagus-jayepuspite.html', halaman(judul='Bagus Jayepuspite — Sewain', deskripsi='Profil pendiri Sewain Property Agency.',
        kanonik=DOMAIN + '/p/profile-tim.html', kedalaman=1, body_attr=' data-halaman="tentang"',
        isi='<main class="wadah" style="padding:56px 0"><p>Profil ini sudah dipindahkan ke halaman <a href="profile-tim.html">Tentang Sewain</a>.</p></main>',
        kepala_tambahan='<meta http-equiv="refresh" content="0; url=profile-tim.html">\n'))
    tulis('p/list-status-properti-tersedia-tersewa.html', halaman(judul='Status Properti — Sewain', deskripsi='Daftar properti Sewain yang tersedia, tersewa, dan terjual.',
        kanonik=DOMAIN + '/properti/', kedalaman=1, body_attr=' data-halaman="sewa"',
        isi='<main class="wadah" style="padding:56px 0"><p>Status properti terbaru ada di halaman <a href="../properti/">Properti</a>.</p></main>',
        kepala_tambahan='<meta http-equiv="refresh" content="0; url=../properti/">\n'))

    tgl = datetime.now(timezone.utc).strftime('%d %B %Y').replace('November', 'November').replace('December', 'Desember')
    privasi = f'''<main class="wadah"><article class="artikel">
  <p class="alis">Kebijakan privasi</p>
  <h1>Kebijakan Privasi Sewain</h1>
  <p class="meta">Berlaku sejak {tgl} untuk situs www.sewatoko.com</p>
  <div class="artikel-isi">
    <p>Kebijakan ini menjelaskan data apa yang dikumpulkan Sewain Property Agency ("Sewain", "kami") saat Anda memakai situs ini, untuk apa data itu dipakai, dan bagaimana Anda dapat meminta perubahan atau penghapusannya.</p>
    <h2>Data yang kami kumpulkan</h2>
    <ul>
      <li><strong>Akun.</strong> Saat Anda membuat akun atau masuk dengan Google, kami menerima nama, alamat email, dan foto profil dari layanan Firebase Authentication milik Google. Sandi akun email disimpan oleh Firebase, bukan oleh Sewain.</li>
      <li><strong>Jadwal konsultasi dan survei.</strong> Nama, nomor WhatsApp, email (bila diisi), tanggal, jam, dan pesan yang Anda tulis.</li>
      <li><strong>Titip properti.</strong> Data properti, alamat, foto, video, serta nama dan nomor WhatsApp pemilik.</li>
      <li><strong>Favorit.</strong> Kode properti yang Anda simpan.</li>
      <li><strong>Data teknis.</strong> Alamat IP dipakai sementara untuk membatasi penyalahgunaan formulir. Kami tidak memasang iklan pihak ketiga maupun pelacak iklan.</li>
    </ul>
    <h2>Untuk apa data dipakai</h2>
    <ul>
      <li>Mengonfirmasi dan menjalankan jadwal survei atau konsultasi.</li>
      <li>Memeriksa, menayangkan, dan memasarkan properti yang Anda titipkan di situs dan media sosial Sewain.</li>
      <li>Menghubungi Anda tentang properti yang Anda tanyakan, simpan, atau titipkan.</li>
    </ul>
    <p>Alamat lengkap dan kontak pemilik properti tidak ditampilkan di situs. Foto dan deskripsi properti titipan baru tayang setelah diperiksa agen.</p>
    <h2>Siapa yang dapat melihat data Anda</h2>
    <p>Data hanya dapat dibuka oleh pengurus Sewain yang memiliki akun panel. Kami tidak menjual data pribadi. Data disimpan di server Sewain dan layanan Firebase Authentication (Google).</p>
    <h2>Hak Anda</h2>
    <p>Anda dapat mengubah nama dan nomor WhatsApp di halaman Akun saya, dan meminta salinan atau penghapusan data akun, jadwal, maupun titipan Anda dengan menghubungi kami lewat WhatsApp Sewain.id. Permintaan penghapusan kami proses paling lambat 14 hari kerja.</p>
    <h2>Perubahan kebijakan</h2>
    <p>Bila kebijakan ini berubah, tanggal berlaku di atas akan diperbarui.</p>
  </div>
</article></main>'''
    tulis('p/privacy-policy.html', halaman(judul='Kebijakan Privasi — Sewain', deskripsi='Data apa yang dikumpulkan Sewain Property Agency, untuk apa dipakai, dan cara meminta penghapusannya.',
                                            kanonik=DOMAIN + '/p/privacy-policy.html', kedalaman=1, isi=privasi))

# ------------------------------------------------------------------ 4. sitemap
def bangun_sitemap(artikel, listing):
    kini = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    url = [('/', kini), ('/properti/', kini), ('/properti/?jenis=sewa', kini), ('/properti/?jenis=jual', kini), ('/rekomendasi/', kini),
           ('/konsultasi/', kini), ('/titip/', kini), ('/artikel/', kini), ('/p/profile-tim.html', kini), ('/p/privacy-policy.html', kini)]
    url += [(a['jalur'], a['diubah']) for a in artikel]
    url += [(j, (t or kini)[:10]) for j, t in listing]
    isi = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + \
          ''.join(f'  <url><loc>{e(DOMAIN + j)}</loc><lastmod>{t}</lastmod></url>\n' for j, t in url) + '</urlset>\n'
    tulis('sitemap.xml', isi)
    tulis('robots.txt', f'User-agent: *\nDisallow: /pengurus/\nDisallow: /akun/\nAllow: /\n\nSitemap: {DOMAIN}/sitemap.xml\n')
    return len(url)

if __name__ == '__main__':
    a = bangun_artikel()
    print('artikel:', len(a))
    s = ambil_listing()
    l = bangun_listing(s)
    print('listing di URL lama:', len(l))
    bangun_halaman_p()
    print('halaman /p/ selesai')
    print('sitemap:', bangun_sitemap(a, l), 'URL')
