"""
gabung-impor.py — menggabungkan hasil impor-excel.py ke listing.json milik API.

  python alat/gabung-impor.py <listing.json> <folder-impor> <MEDIA_URL> <sub-folder, mis. 2026/11>

- Listing yang SUDAH ada: data internal (pemilik, harga asli, proses, survei)
  diisi dari buku kerja TANPA menimpa isian pengurus yang sudah ada; status
  tersewa/terjual dari buku kerja ikut dipasang; tanda posting IG/FB "Done"
  dicatat.
- Kode yang BELUM ada: dibuat sebagai DRAF (terbit: false) lengkap dengan foto
  toko dari buku kerja, supaya pengurus tinggal melengkapi lalu menayangkan.

Keluaran: <folder-impor>/listing-baru.json dan <folder-impor>/unggah/<nama>.jpg
(foto yang harus disalin ke MEDIA_DIR/<sub-folder>/ sebelum listing-baru dipasang).
"""
import json, os, re, secrets, shutil, sys
from datetime import datetime, timezone

LISTING, IMPOR, MEDIA_URL, SUB = sys.argv[1:5]
data = json.load(open(LISTING, encoding='utf8'))
bungkus = isinstance(data, dict)
semua = data['listing'] if bungkus else data
baris = json.load(open(os.path.join(IMPOR, 'impor.json'), encoding='utf8'))
os.makedirs(os.path.join(IMPOR, 'unggah'), exist_ok=True)
kini = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S')
OLEH = 'impor buku kerja (Excel)'

# ---- plus code pendek (mis. "85QR+Q85") -> titik tengah, dipulihkan dari acuan Denpasar
ABJAD = '23456789CFGHJMPQRVWX'
def plus_code(alamat, acuan=(-8.65, 115.22)):
    m = re.match(r'^\s*([23456789CFGHJMPQRVWX]{4})\+([23456789CFGHJMPQRVWX]{2,3})\b', alamat or '')
    if not m:
        return None
    la, ln = acuan[0] + 90, acuan[1] + 180
    awal = ABJAD[int(la // 20)] + ABJAD[int(ln // 20)] + ABJAD[int(la % 20)] + ABJAD[int(ln % 20)]
    kode = awal + m.group(1) + m.group(2)[:2]
    lat, lng, res = -90.0, -180.0, [20, 1, 0.05, 0.0025, 0.000125]
    for i in range(5):
        lat += ABJAD.index(kode[2 * i]) * res[i]
        lng += ABJAD.index(kode[2 * i + 1]) * res[i]
    lat += res[4] / 2; lng += res[4] / 2
    # kode pendek berlaku dalam sel 1 derajat; geser bila lebih dekat ke sel sebelah
    if lat - acuan[0] > 0.5: lat -= 1
    elif acuan[0] - lat > 0.5: lat += 1
    if lng - acuan[1] > 0.5: lng -= 1
    elif acuan[1] - lng > 0.5: lng += 1
    return round(lat, 6), round(lng, 6)

def kab_dari_alamat(alamat, cadangan):
    a = (alamat or '').lower()
    if 'denpasar' in a: return 'Kota Denpasar'
    for k in ('Badung', 'Tabanan', 'Klungkung', 'Gianyar', 'Bangli', 'Karangasem', 'Buleleng', 'Jembrana'):
        if 'kabupaten ' + k.lower() in a: return 'Kabupaten ' + k
    return cadangan

def area_dari_alamat(alamat):
    m = re.match(r'^\s*[23456789CFGHJMPQRVWX]{4}\+[23456789CFGHJMPQRVWX]{2,3},?\s+([^,]+),', alamat or '')
    return m.group(1).strip() if m else None

def isi_kosong(lama, baru):
    """Gabung dict: nilai lama yang sudah terisi tidak pernah ditimpa."""
    o = dict(lama or {})
    for k, v in baru.items():
        if isinstance(v, dict):
            o[k] = isi_kosong(o.get(k), v)
        elif o.get(k) in (None, '', [], False) and v not in (None, ''):
            o[k] = v
    return o

def posting_dari(b):
    p = {}
    for kanal, kolom in (('instagram', 'instagram'), ('facebook', 'facebook')):
        if b['posting'].get(kolom, '').lower() == 'done':
            p[kanal] = {'tanggal': kini, 'oleh': OLEH, 'tautan': None}
    return p

menurut_kode = {l['kode']: l for l in semua}
laporan = {'diisi': [], 'status': [], 'draf': []}
for b in baris:
    kode = b['kode']
    internal = dict(b['internal'])
    internal['proses'] = {k: v for k, v in (internal.get('proses') or {}).items() if v}
    l = menurut_kode.get(kode)
    if l:
        l['internal'] = isi_kosong({'pemilik': {}, 'penyewa': {}, 'catatan': None, 'mentah': []} | (l.get('internal') or {}), internal)
        if b['status'] and l.get('status') == 'tersedia':
            l['status'] = b['status']
            laporan['status'].append(kode + ' -> ' + b['status'])
        p = posting_dari(b)
        if p:
            l['posting'] = {**p, **(l.get('posting') or {})}
        l['diubah'] = kini
        laporan['diisi'].append(kode)
        continue
    # ---- prospek baru -> draf
    pr = b['prospek']
    alamat = internal['pemilik'].get('alamat')
    kab = kab_dari_alamat(alamat, pr['lokasi']['kabupaten'])
    area = area_dari_alamat(alamat) or pr['lokasi']['area']
    lokasi = {'provinsi': 'Bali', 'kabupaten': kab, 'area': area, 'alamat': None}
    titik = plus_code(alamat)
    if titik:
        lokasi.update(lat=titik[0], lng=titik[1], presisi='area')
    foto = []
    if b.get('foto'):
        nama = secrets.token_hex(9) + '.jpg'
        shutil.copyfile(os.path.join(IMPOR, 'foto', b['foto']), os.path.join(IMPOR, 'unggah', nama))
        foto = [MEDIA_URL.rstrip('/') + '/' + SUB + '/' + nama]
    tipe = pr['tipe']
    judul = ('Dijual ' if pr['jenis'] == 'jual' else 'Disewakan ') + tipe.capitalize() + (' di ' + area if area else '')
    baru = {
        'kode': kode, 'judul': judul, 'jenis': pr['jenis'], 'tipe': tipe,
        'status': b['status'] or 'tersedia', 'unggulan': False,
        'harga': None, 'hargaMulai': False, 'periode': 'tahun' if pr['jenis'] == 'sewa' else None, 'hargaTeks': None,
        'lokasi': lokasi, 'spesifikasi': {}, 'fitur': [], 'deskripsi': [],
        'foto': foto, 'video': [],
        'dibuat': kini, 'diubah': kini, 'oleh': OLEH, 'terbit': False,
        'internal': {'pemilik': {}, 'penyewa': {}, 'catatan': None, 'mentah': []} | internal,
    }
    if posting_dari(b):
        baru['posting'] = posting_dari(b)
    semua.append(baru)
    laporan['draf'].append(kode)

json.dump(data, open(os.path.join(IMPOR, 'listing-baru.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('diisi', len(laporan['diisi']), '| draf baru', len(laporan['draf']), '| status:', ', '.join(laporan['status']) or '-')
print('total listing', len(semua))
