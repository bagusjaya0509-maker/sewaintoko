// Modul bersama untuk semua halaman Sewain.
const LOKAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export const API = (() => {
  try { const s = localStorage.getItem('sewain.api'); if (s) return s; } catch (_) {}
  return LOKAL ? 'http://127.0.0.1:4199' : 'https://sewain.103-253-145-38.sslip.io';
})();
export const AKAR = document.body.dataset.akar || './';
export const WA_LINK = 'https://wa.me/message/6HMVH6NMUEAQD1';
export const WA_TAMPIL = 'Sewain.id';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function api(jalur, pilihan = {}) {
  const kontrol = new AbortController();
  const waktu = setTimeout(() => kontrol.abort(), pilihan.batasWaktu || 15000);
  const kepala = Object.assign({}, pilihan.headers);
  if (pilihan.json !== undefined) { kepala['Content-Type'] = 'application/json'; pilihan.body = JSON.stringify(pilihan.json); }
  try {
    const r = await fetch(API + jalur, { method: pilihan.method || 'GET', headers: kepala, body: pilihan.body, signal: kontrol.signal });
    let d = {};
    try { d = await r.json(); } catch (_) {}
    if (!r.ok) { const e = new Error(d.galat || 'Permintaan gagal (' + r.status + ').'); e.status = r.status; throw e; }
    return d;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Server terlalu lama menjawab. Periksa koneksi lalu coba lagi.');
    if (e instanceof TypeError) throw new Error('Tidak bisa terhubung ke server. Periksa koneksi internet Anda.');
    throw e;
  } finally { clearTimeout(waktu); }
}

// Daftar listing: API dulu, kalau tidak terjangkau pakai cuplikan statis di repo
// supaya pengunjung tetap melihat properti walau server sedang perawatan.
export async function ambilListing(saring = {}) {
  const q = new URLSearchParams(Object.entries(saring).filter(([, v]) => v !== '' && v != null)).toString();
  try {
    return Object.assign(await api('/api/listing' + (q ? '?' + q : '')), { dariCadangan: false });
  } catch (e) {
    const r = await fetch(AKAR + 'data/listing.json', { cache: 'no-cache' });
    if (!r.ok) throw e;
    const d = await r.json();
    let h = d.listing.filter(l => l.terbit !== false && (!l.status || l.status === 'tersedia'));
    if (saring.jenis) h = h.filter(l => l.jenis === saring.jenis);
    if (saring.tipe) h = h.filter(l => saring.tipe.split(',').includes(l.tipe));
    if (saring.provinsi) h = h.filter(l => l.lokasi?.provinsi === saring.provinsi);
    if (saring.kabupaten) h = h.filter(l => l.lokasi?.kabupaten === saring.kabupaten);
    if (saring.maks) h = h.filter(l => l.harga != null && l.harga <= Number(saring.maks));
    if (saring.urut === 'termurah') h.sort((a, b) => (a.harga ?? Infinity) - (b.harga ?? Infinity));
    if (saring.urut === 'termahal') h.sort((a, b) => (b.harga ?? -1) - (a.harga ?? -1));
    return { jumlah: h.length, listing: h, dariCadangan: true };
  }
}

export async function ambilSatu(kode) {
  try { return (await api('/api/listing/' + encodeURIComponent(kode))).listing; }
  catch (e) {
    if (e.status === 404) throw e;
    const r = await fetch(AKAR + 'data/listing.json', { cache: 'no-cache' });
    const l = r.ok ? (await r.json()).listing.find(x => x.kode.toLowerCase() === kode.toLowerCase()) : null;
    if (!l) throw e;
    return l;
  }
}

// ---------- format
export function rupiahRingkas(n) {
  if (n == null) return '';
  if (n >= 1e9) return 'Rp' + (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
  if (n >= 1e6) return 'Rp' + (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}
export const rupiahPenuh = n => 'Rp' + Math.round(n).toLocaleString('id-ID');

export function labelHarga(l) {
  if (l.harga == null) return { angka: null, satuan: '', mulai: false };
  return {
    angka: rupiahRingkas(l.harga),
    satuan: l.periode ? '/ ' + l.periode : (l.jenis === 'jual' ? 'harga jual' : ''),
    mulai: !!l.hargaMulai,
  };
}

export const namaKab = k => (k || '').replace(/^(Kabupaten|Kota)\s+/, '');
export const tempat = l => [l.lokasi?.area, namaKab(l.lokasi?.kabupaten)].filter(Boolean).join(', ');
export const tipeLabel = t => ({ toko: 'Toko', ruko: 'Ruko', rumah: 'Rumah', kontrakan: 'Kontrakan', gudang: 'Gudang', tanah: 'Tanah', villa: 'Villa', kantor: 'Kantor' }[t] || t);

export function fotoKecil(url, lebar = 800) {
  if (!url) return '';
  if (/blogger\.googleusercontent\.com/.test(url)) return url.replace(/\/s\d+(-[a-z0-9-]+)?\//, '/s' + lebar + '/').replace(/=s\d+(-[a-z0-9-]+)?$/, '=s' + lebar);
  return url;
}

export function spekRingkas(l) {
  const s = l.spesifikasi || {}, b = [];
  if (s.luasBangunan) b.push(['LB', s.luasBangunan + ' m²']);
  else if (s.dimensi) b.push(['Ukuran', s.dimensi]);
  if (s.luasTanah) b.push(['LT', s.luasTanah + ' m²']);
  if (s.lantai) b.push(['Lantai', s.lantai]);
  if (s.listrikWatt) b.push(['Listrik', s.listrikWatt.toLocaleString('id-ID') + ' W']);
  if (s.kamarTidur) b.push(['KT', s.kamarTidur]);
  return b.slice(0, 4);
}

export function kartuListing(l) {
  const h = labelHarga(l);
  const foto = (l.foto || [])[0];
  const spek = spekRingkas(l);
  const media = [];
  if ((l.foto || []).length > 1) media.push((l.foto.length) + ' foto');
  if ((l.video || []).length) media.push('Video');
  return `
  <a class="kartu" href="${AKAR}listing/?kode=${encodeURIComponent(l.kode)}">
    <div class="kartu-foto">
      ${foto ? `<img src="${esc(fotoKecil(foto, 640))}" alt="${esc(tipeLabel(l.tipe))} ${esc(tempat(l))}" loading="lazy" decoding="async">` : `<span class="tanpa-foto">${tandaLogo()}<small>Foto segera menyusul</small></span>`}
      <span class="plakat">${esc(l.kode)}</span>
      <span class="kartu-jenis ${l.jenis === 'jual' ? 'kartu-jenis--jual' : ''}">${l.jenis === 'jual' ? 'Dijual' : 'Disewakan'}</span>
      ${media.length ? `<span class="kartu-media-tanda">${media.map(m => `<span>${esc(m)}</span>`).join('')}</span>` : ''}
    </div>
    <div class="kartu-isi">
      <span class="kartu-lokasi">${ikonPin()} ${esc(tempat(l) || 'Bali')}</span>
      <h3 class="kartu-judul">${esc(l.judul)}</h3>
      ${h.angka
        ? `<span class="kartu-harga">${h.mulai ? '<small>mulai </small>' : ''}${esc(h.angka)} <small>${esc(h.satuan)}</small></span>`
        : `<span class="kartu-harga kartu-harga--tanya">Harga: hubungi kami</span>`}
      ${spek.length ? `<div class="spek-ringkas">${spek.map(([k, v]) => `<span>${esc(k)} <b>${esc(v)}</b></span>`).join('')}</div>` : ''}
    </div>
  </a>`;
}

export const tandaLogo = () => '<svg viewBox="210 290 606 445" aria-hidden="true"><path fill="currentColor" d="M218 497 521 298 806 493 806 535 521 334 218 539Z M294 545 327 523 327 727 294 727Z M390 477 423 455 423 727 390 727Z M488 410 521 388 521 727 488 727Z M650 473 684 496 684 727 650 727Z"/></svg>';

export const ikonPin = () => '<svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true"><path d="M6 0a5 5 0 0 0-5 5c0 3.6 5 9 5 9s5-5.4 5-9a5 5 0 0 0-5-5Zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" fill="currentColor"/></svg>';

/* Tautan pendek WhatsApp Business tidak menerima ?text=, jadi pesan isian
   tidak bisa dibawa. Argumen dibiarkan supaya pemanggil lama tetap jalan. */
export function tautanWA(_pesan) {
  return WA_LINK;
}

export function tampilPesan(el, jenis, teks) {
  el.className = 'pesan pesan--' + jenis + ' tampil';
  el.textContent = teks;
}

// ---------- kepala halaman: bayangan saat bergulir + menu ponsel
const kepala = document.querySelector('.kepala');
if (kepala) {
  const atur = () => kepala.classList.toggle('bergulir', scrollY > 8);
  addEventListener('scroll', atur, { passive: true }); atur();
  const tombol = kepala.querySelector('.menu-buka');
  tombol?.addEventListener('click', () => {
    const buka = kepala.classList.toggle('menu-terbuka');
    tombol.setAttribute('aria-expanded', buka);
  });
  kepala.querySelectorAll('.nav a').forEach(a => a.addEventListener('click', () => kepala.classList.remove('menu-terbuka')));
}
document.querySelectorAll('[data-tahun]').forEach(el => { el.textContent = new Date().getFullYear(); });
