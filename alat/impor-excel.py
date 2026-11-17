"""
impor-excel.py — memindahkan buku kerja tim ("List Doc Sewain Toko.xlsx",
lembar LIST TOKO BALI) ke data internal panel pengurus.

  python alat/impor-excel.py "<berkas.xlsx>" <folder-keluaran>

Keluaran: <folder>/impor.json + <folder>/foto/<KODE>.jpg (foto toko dari kolom B).
Berkas ini berisi nomor pemilik & harga asli -> JANGAN di-commit; hasilnya
dipasang ke VPS (data internal yang tidak pernah ikut API publik).

Pemetaan kolom (baris 4 dst.):
  C Kode · D Alamat/plus code · F Catatan toko · G Nomor pemilik · H Promote ADS
  I Dihubungi · J Take video · K Izin upload · L Status sewa · M Web · N IG · O FB
  P & Q Informasi tambahan hasil kontak & survei (harga asli pemilik ada di sini)
"""
import io, json, os, re, sys, zipfile
import openpyxl
from PIL import Image

BERKAS, KELUAR = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(KELUAR, 'foto'), exist_ok=True)

KAB = {'DPS': ('Bali', 'Kota Denpasar'), 'BDG': ('Bali', 'Kabupaten Badung'), 'KLK': ('Bali', 'Kabupaten Klungkung'),
       'TBN': ('Bali', 'Kabupaten Tabanan'), 'TAB': ('Bali', 'Kabupaten Tabanan'), 'GIA': ('Bali', 'Kabupaten Gianyar')}
DIHUBUNGI = {'confirmed': 'terhubung', 'unreplay': 'belum-dibalas', 'unchat': 'belum'}
VIDEO = {'taken': 'sudah', 'confirmed': 'sudah', 'untake': 'belum'}
IZIN = {'confirmed': 'diizinkan', 'tanpa ijin': 'tanpa-izin', 'ditolak': 'ditolak', 'unknown': 'belum-jelas', 'unknow': 'belum-jelas', 'unreplay': 'belum-jelas'}
STATUS = {'tersewa': 'tersewa', 'terjual': 'terjual'}

def bersih(v):
    return '' if v is None else str(v).replace('\r', '').strip()

def harga_dari(teks, jenis_tebakan='sewa'):
    """Harga asli pemilik dari catatan bebas. Hanya mengembalikan angka bila
    polanya jelas; teks aslinya selalu ikut disimpan untuk diperiksa pengurus."""
    t = ' ' + teks.lower().replace('\n', ' ') + ' '
    t = re.sub(r'\d+(?:[.,]\d+)?\s*m?\s*[x×]\s*\d+(?:[.,]\d+)?\s*m?\b', ' ', t)          # dimensi '3,5m x 12m'
    t = re.sub(r'\d+(?:[.,]\d+)?\s*(m2|m²|meter|mtr|watt|kwh|va|are|lt|lantai|unit|blok)\b', ' ', t)   # ukuran, bukan harga
    kandidat = []
    pola = (r'rp\.?\s*(?P<penuh>\d{1,3}(?:\.\d{3}){2,})'
            r'|(?:rp\.?\s*)?(?P<angka>\d{1,4}(?:[.,]\d{1,3})?)\s*(?P<satuan>miliar|milyar|million|juta|jt|m)?(?![a-z0-9])')
    for m in re.finditer(pola, t):
        ekor = t[m.end():m.end() + 30]
        sebelum = t[max(0, m.start() - 25):m.start()]
        periode = None
        if re.match(r'\s*(idr\s*)?(nego\s*)?(/|per)\s*(\w+\s+per\s*)?(th|thn|thun|tahun|year)', ekor) or re.search(r'per\s*(th|thn|tahun)\s*$', sebelum):
            periode = 'tahun'
        elif re.match(r'\s*(nego\s*)?(/|per)\s*(bln|bulan|month)', ekor):
            periode = 'bulan'
        if m.group('penuh'):
            nilai = float(m.group('penuh').replace('.', ''))
        else:
            a_s, satuan = m.group('angka'), m.group('satuan')
            try:
                n = float(a_s.replace('.', '')) if re.match(r'^\d{1,3}\.\d{3}$', a_s) else float(a_s.replace(',', '.'))
            except ValueError:
                continue
            if satuan in ('miliar', 'milyar') or (satuan == 'm' and periode is None and n < 100):
                nilai = n * 1e9
            elif satuan in ('juta', 'jt', 'million'):
                nilai = n * 1e6
            elif satuan is None and periode and 5 <= n <= 2000:
                nilai = n * 1e6                                   # "200 nego/th", "150/tahun"
            else:
                continue
        kandidat.append((nilai, periode))
    for nilai, periode in kandidat:
        if periode is None and jenis_tebakan == 'sewa' and nilai < 5e8:
            periode = 'tahun'                                  # sewa toko di Bali lazim dihitung per tahun
        if periode and 3e6 <= nilai <= 3e9:
            return int(nilai), periode
        if not periode and 5e8 <= nilai <= 2e11:
            return int(nilai), None
    return None, None

# ---------- foto per baris (gambar mengambang di kolom B)
def foto_per_baris(path):
    z = zipfile.ZipFile(path)
    s = z.read('xl/drawings/drawing1.xml').decode('utf8')
    rels = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="([^"]+)"', z.read('xl/drawings/_rels/drawing1.xml.rels').decode('utf8')))
    hasil = {}
    for a in re.findall(r'<xdr:(?:twoCellAnchor|oneCellAnchor)[^>]*>(.*?)</xdr:(?:twoCellAnchor|oneCellAnchor)>', s, re.S):
        pos = re.search(r'<xdr:from><xdr:col>(\d+)</xdr:col>.*?<xdr:row>(\d+)</xdr:row>', a, re.S)
        emb = re.search(r'r:embed="(rId\d+)"', a)
        if pos and emb and int(pos.group(1)) == 1:
            target = rels.get(emb.group(1), '').replace('../', 'xl/')
            if target:
                hasil[int(pos.group(2)) + 1] = z.read(target)
    return hasil

wb = openpyxl.load_workbook(BERKAS, data_only=True)
ws = wb['LIST TOKO BALI']
foto = foto_per_baris(BERKAS)
keluar = []
for idx, r in enumerate(ws.iter_rows(min_row=4, values_only=True), start=4):
    kode = bersih(r[2]).upper()
    if not re.match(r'^[A-Z]{3}-\d{3}$', kode):
        continue
    v = [bersih(x) for x in r] + [''] * 20
    alamat, catatan, telepon = v[3], v[5], v[6]
    info = '\n'.join(x for x in [v[15], v[16]] if x)
    teks_semua = (catatan + ' ' + info).lower()
    jenis = 'jual' if re.search(r'\bdi\s*jual\b|\bjual\b', teks_semua) and not re.search(r'disewakan|dikontrakan|sewa\s', teks_semua) else 'sewa'
    harga, periode = harga_dari(info, jenis)
    if periode is None and harga and harga >= 5e8:
        jenis = 'jual'
    rec = {
        'kode': kode,
        'baris': idx,
        'internal': {
            'pemilik': {'nama': None, 'telepon': telepon or None, 'email': None, 'alamat': alamat or None},
            'hargaPemilik': harga,
            'hargaPemilikPeriode': periode if harga else None,
            'hargaPemilikTeks': (v[15] or '')[:600] or None,
            'punyaAgen': bool(re.search(r'punya\s*agen', teks_semua)),
            'catatanSurvei': '\n'.join(x for x in [('Catatan toko: ' + catatan) if catatan else '', info] if x)[:3000] or None,
            'proses': {
                'dihubungi': DIHUBUNGI.get(v[8].lower()),
                'video': VIDEO.get(v[9].lower()),
                'izin': IZIN.get(v[10].lower()),
            },
        },
        'status': STATUS.get(v[11].lower()),
        'statusTeks': v[11],
        'posting': {'web': v[12], 'instagram': v[13], 'facebook': v[14]},
        'promote': v[7],
    }
    pre = kode.split('-')[0]
    prov, kab = KAB.get(pre, ('Bali', None))
    area = None
    m = re.match(r'^[A-Z0-9]{4}\+[A-Z0-9]{2,3}\s+([^,]+),', alamat)
    if m:
        area = m.group(1).strip()
    rec['prospek'] = {
        'jenis': jenis,
        'tipe': 'ruko' if 'ruko' in teks_semua else 'toko',
        'lokasi': {'provinsi': prov, 'kabupaten': kab, 'area': area},
    }
    gambar = foto.get(idx)
    if gambar:
        im = Image.open(io.BytesIO(gambar)).convert('RGB')
        if max(im.size) > 1600:
            im.thumbnail((1600, 1600), Image.LANCZOS)
        im.save(os.path.join(KELUAR, 'foto', kode + '.jpg'), 'JPEG', quality=84, optimize=True)
        rec['foto'] = kode + '.jpg'
    keluar.append(rec)

json.dump(keluar, open(os.path.join(KELUAR, 'impor.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('baris:', len(keluar), '| foto:', sum(1 for x in keluar if x.get('foto')),
      '| harga terbaca:', sum(1 for x in keluar if x['internal']['hargaPemilik']))
