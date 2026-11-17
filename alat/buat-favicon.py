"""
buat-favicon.py — favicon tanpa latar dari tanda atap Sewain (path sama dengan
TANDA_SVG di assets/js/inti.js).

  python alat/buat-favicon.py

Keluaran (assets/img/):
  favicon.svg  — hijau hutan; di tab gelap otomatis krem (prefers-color-scheme)
  ikon-32.png, ikon-48.png — cadangan PNG transparen (hijau)
ikon-192/512 (apple-touch / PWA) SENGAJA tetap berlatar: iOS mengisi bagian
transparan dengan hitam.
"""
import os
from PIL import Image, ImageDraw

AKAR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'img')
HIJAU, KREM = '#1D3125', '#F3EFE4'
BENTUK = [
    [(218, 497), (521, 298), (806, 493), (806, 535), (521, 334), (218, 539)],   # atap
    [(294, 545), (327, 523), (327, 727), (294, 727)],
    [(390, 477), (423, 455), (423, 727), (390, 727)],
    [(488, 410), (521, 388), (521, 727), (488, 727)],
    [(650, 473), (684, 496), (684, 727), (650, 727)],
]
# kotak pandang persegi: isi 588 x 437 di tengah, sedikit ruang tepi
X0, Y0, SISI = 194, 194, 636

path = ' '.join('M' + ' '.join(f'{x} {y}' for x, y in b) + 'Z' for b in BENTUK)
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{X0} {Y0} {SISI} {SISI}">
<style>path{{fill:{HIJAU}}}@media (prefers-color-scheme:dark){{path{{fill:{KREM}}}}}</style>
<path d="{path}"/>
</svg>
'''
open(os.path.join(AKAR, 'favicon.svg'), 'w', encoding='utf8').write(svg)

def png(ukuran, warna, nama):
    besar = ukuran * 16                                   # gambar besar lalu perkecil = tepi halus
    im = Image.new('RGBA', (besar, besar), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    k = besar / SISI
    for b in BENTUK:
        d.polygon([((x - X0) * k, (y - Y0) * k) for x, y in b], fill=warna)
    im.resize((ukuran, ukuran), Image.LANCZOS).save(os.path.join(AKAR, nama), optimize=True)

png(32, HIJAU, 'ikon-32.png')
png(48, HIJAU, 'ikon-48.png')
print('ok')
