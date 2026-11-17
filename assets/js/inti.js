// Modul bersama untuk semua halaman Sewain.
const LOKAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export const API = (() => {
  try { const s = localStorage.getItem('sewain.api'); if (s) return s; } catch (_) {}
  return LOKAL ? 'http://127.0.0.1:4199' : 'https://sewain.103-253-145-38.sslip.io';
})();
export const AKAR = document.body.dataset.akar || './';
export const WA_LINK = 'https://wa.me/message/6HMVH6NMUEAQD1';
export const WA_TAMPIL = 'Sewain.id';
export const SOSMED = {
  instagram: { url: 'https://www.instagram.com/sewaintoko.id', nama: 'Instagram', akun: '@sewaintoko.id' },
  tiktok: { url: 'https://www.tiktok.com/@sewain.com', nama: 'TikTok', akun: '@sewain.com' },
  facebook: { url: 'https://www.facebook.com/profile.php?id=122391479252232151', nama: 'Facebook', akun: 'Sewa Toko Bali-Nusra' },
  whatsapp: { url: WA_LINK, nama: 'WhatsApp', akun: WA_TAMPIL },
};

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

/** Alamat halaman detail. Listing pindahan Blogger memakai URL lamanya
 *  (sudah dikenal mesin pencari); listing baru memakai /listing/?kode=. */
export const hrefListing = l => {
  const jalur = l.halaman || (String(l.sumber || '').match(/sewatoko\.com(\/\d{4}\/\d{2}\/[a-z0-9_-]+\.html)$/) || [])[1];
  return jalur ? AKAR + jalur.replace(/^\//, '') : AKAR + 'listing/?kode=' + encodeURIComponent(l.kode);
};

// ---------- ikon garis tipis (satu gaya, 24px kanvas)
const ik = d => `<svg class="ikon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const IKON = {
  luas: ik('<path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"/>'),
  tanah: ik('<path d="M3 19h18M5 19V9l7-5 7 5v10"/><path d="M9 19v-5h6v5"/>'),
  lantai: ik('<path d="M4 20h16M4 14h16M4 8h16M8 20V8M16 20V8"/>'),
  listrik: ik('<path d="M13 3 5 13h6l-1 8 8-10h-6z"/>'),
  kamar: ik('<path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 18h18M3 21v-3M21 21v-3M7 10V7h4v3"/>'),
  mandi: ik('<path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM6 12V6a2 2 0 0 1 4 0"/>'),
  ukuran: ik('<path d="M3 7h18v10H3zM7 7v3M11 7v4M15 7v3M19 7v4"/>'),
  hati: '<svg class="ikon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-9.2-9.2C1.6 7.4 3.8 4 7.2 4c2 0 3.6 1.1 4.8 2.8C13.2 5.1 14.8 4 16.8 4c3.4 0 5.6 3.4 4.4 6.8C19.5 15.4 12 20 12 20z" fill="var(--isi-hati, none)" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  pin: '<svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true"><path d="M6 0a5 5 0 0 0-5 5c0 3.6 5 9 5 9s5-5.4 5-9a5 5 0 0 0-5-5Zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" fill="currentColor"/></svg>',
  video: ik('<path d="M3 6h12v12H3zM15 10l6-3v10l-6-3"/>'),
  foto: ik('<path d="M3 7h4l2-2h6l2 2h4v12H3z"/><circle cx="12" cy="13" r="3.5"/>'),
};
export const ikonPin = () => IKON.pin;

export const LOGO_SOSMED = {
  instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.4" cy="6.6" r="1.2" fill="currentColor"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.6 3c.3 2.2 1.6 3.7 3.9 3.9v3.2c-1.4.1-2.7-.3-3.9-1.1v6.1c0 3.6-3 5.9-6.2 5.4-2.6-.4-4.4-2.6-4.3-5.3.1-3 2.7-5.3 5.8-5v3.3c-.4-.1-.8-.2-1.2-.1-1.2.1-2.1 1.1-2 2.3.1 1.2 1.2 2.1 2.4 2 1.1-.1 1.9-1 1.9-2.2V3h3.6z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 21v-7.6h2.6l.4-3h-3V8.5c0-.9.3-1.5 1.5-1.5h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21z"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5a9.4 9.4 0 0 0-8.1 14.2L2.6 21.5l4.9-1.3A9.4 9.4 0 1 0 12 2.5Zm0 17.1c-1.4 0-2.8-.4-4-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A7.7 7.7 0 1 1 12 19.6Zm4.3-5.8c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1-.7-.3-1.4-.7-2-1.3-.5-.5-.9-1-1.2-1.6-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.6.6-.9 1.4-.9 2.2 0 .9.4 1.8.9 2.5 1.1 1.5 2.4 2.7 4 3.4 1.6.7 2.2.7 2.9.6.6-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1-.1-.1-.2-.2-.4-.3Z"/></svg>',
};

export function spekRingkas(l) {
  const s = l.spesifikasi || {}, b = [];
  if (s.luasBangunan) b.push([IKON.luas, s.luasBangunan + ' m²', 'Luas bangunan']);
  else if (s.dimensi) b.push([IKON.ukuran, s.dimensi, 'Ukuran']);
  if (s.luasTanah) b.push([IKON.tanah, s.luasTanah + ' m²', 'Luas tanah']);
  if (s.lantai) b.push([IKON.lantai, s.lantai + ' lt', 'Jumlah lantai']);
  if (s.kamarTidur) b.push([IKON.kamar, s.kamarTidur + ' KT', 'Kamar tidur']);
  if (s.kamarMandi) b.push([IKON.mandi, s.kamarMandi + ' KM', 'Kamar mandi']);
  if (s.listrikWatt) b.push([IKON.listrik, s.listrikWatt.toLocaleString('id-ID') + ' W', 'Daya listrik']);
  return b.slice(0, 4);
}

/** Kartu listing: karosel foto (gulir-jepret, tanpa pustaka), lencana, tombol
 *  favorit, plakat kode. Tombol tidak boleh di dalam <a>, jadi tautannya
 *  dipasang pada foto dan bagian isi secara terpisah. */
export function kartuListing(l) {
  const h = labelHarga(l);
  const href = hrefListing(l);
  const foto = (l.foto || []).slice(0, 5);
  const spek = spekRingkas(l);
  const baru = l.dibuat && Date.now() - Date.parse(l.dibuat) < 21 * 864e5;
  const lencana = [
    `<span class="lencana-kartu ${l.jenis === 'jual' ? 'lencana-kartu--jual' : ''}">${l.jenis === 'jual' ? 'Dijual' : 'Disewakan'}</span>`,
    l.unggulan ? '<span class="lencana-kartu lencana-kartu--terang">Pilihan agen</span>' : '',
    baru ? '<span class="lencana-kartu lencana-kartu--terang">Baru</span>' : '',
    (l.video || []).length ? `<span class="lencana-kartu lencana-kartu--terang">${IKON.video} Video</span>` : '',
  ].join('');
  const alt = esc(tipeLabel(l.tipe) + ' ' + tempat(l));
  return `
  <article class="kartu" data-kode="${esc(l.kode)}">
    <div class="kartu-foto">
      ${foto.length ? `<div class="karosel" data-karosel>
        ${foto.map((f, i) => `<a class="karosel-slide" href="${href}" tabindex="${i ? -1 : 0}" aria-label="${i ? 'Foto ' + (i + 1) : esc(l.judul)}"><img src="${esc(fotoKecil(f, 640))}" alt="${i ? '' : alt}" loading="lazy" decoding="async"></a>`).join('')}
      </div>
      ${foto.length > 1 ? `<button class="karosel-geser karosel-geser--kiri" type="button" aria-label="Foto sebelumnya" data-geser="-1">‹</button>
      <button class="karosel-geser karosel-geser--kanan" type="button" aria-label="Foto berikutnya" data-geser="1">›</button>
      <span class="karosel-titik" aria-hidden="true">${foto.map((_, i) => `<i${i ? '' : ' class="aktif"'}></i>`).join('')}</span>` : ''}`
      : `<a class="tanpa-foto" href="${href}">${tandaLogo()}<small>Foto segera menyusul</small></a>`}
      <div class="kartu-lencana">${lencana}</div>
      <button class="hati" type="button" data-favorit="${esc(l.kode)}" aria-pressed="false" aria-label="Simpan ${esc(l.kode)} ke favorit">${IKON.hati}</button>
      <span class="plakat">${esc(l.kode)}</span>
    </div>
    <a class="kartu-isi" href="${href}">
      <span class="kartu-lokasi">${IKON.pin} ${esc(tempat(l) || 'Bali')} · ${esc(tipeLabel(l.tipe))}</span>
      <h3 class="kartu-judul">${esc(l.judul)}</h3>
      <span class="kartu-harga-baris">
        ${h.angka
          ? `<span class="kartu-harga">${h.mulai ? '<small>mulai </small>' : ''}${esc(h.angka)} <small>${esc(h.satuan)}</small></span>`
          : '<span class="kartu-harga kartu-harga--tanya">Harga: hubungi kami</span>'}
      </span>
      ${spek.length ? `<span class="spek-ringkas">${spek.map(([i, v, t]) => `<span title="${t}">${i}<b>${esc(v)}</b></span>`).join('')}</span>` : ''}
    </a>
  </article>`;
}

export const tandaLogo = () => '<svg viewBox="210 290 606 445" aria-hidden="true"><path fill="currentColor" d="M218 497 521 298 806 493 806 535 521 334 218 539Z M294 545 327 523 327 727 294 727Z M390 477 423 455 423 727 390 727Z M488 410 521 388 521 727 488 727Z M650 473 684 496 684 727 650 727Z"/></svg>';

/* Tautan pendek WhatsApp Business tidak menerima ?text=, jadi pesan isian
   tidak bisa dibawa. Argumen dibiarkan supaya pemanggil lama tetap jalan. */
export function tautanWA(_pesan) {
  return WA_LINK;
}

export function tampilPesan(el, jenis, teks) {
  el.className = 'pesan pesan--' + jenis + ' tampil';
  el.textContent = teks;
}

// =========================================================================
// Kerangka halaman: kepala, kaki, gelembung WhatsApp - satu sumber untuk
// semua halaman supaya menu dan tautan sosmed tidak pernah berbeda-beda.
// =========================================================================
const MENU = [
  ['sewa', 'properti/?jenis=sewa', 'Disewakan'],
  ['jual', 'properti/?jenis=jual', 'Dijual'],
  ['rekomendasi', 'rekomendasi/', 'Rekomendasi'],
  ['titip', 'titip/', 'Titip properti'],
  ['artikel', 'artikel/', 'Artikel'],
  ['tentang', 'p/profile-tim.html', 'Tentang'],
];

function pasangKepala() {
  const el = document.querySelector('header.kepala[data-kerangka]');
  if (!el) return;
  const kini = document.body.dataset.halaman || '';
  el.innerHTML = `
  <div class="wadah">
    <a class="merek" href="${AKAR}" aria-label="Sewain Property Agency, ke beranda">
      <svg class="merek-tanda" viewBox="210 290 606 445" aria-hidden="true"><path fill="currentColor" d="M218 497 521 298 806 493 806 535 521 334 218 539Z M294 545 327 523 327 727 294 727Z M390 477 423 455 423 727 390 727Z M488 410 521 388 521 727 488 727Z M650 473 684 496 684 727 650 727Z"/></svg>
      <span class="merek-garis" aria-hidden="true"></span>
      <img class="merek-nama" src="${AKAR}assets/img/wordmark-hutan.png" alt="Sewain Property Agency" width="445" height="118">
    </a>
    <button class="menu-buka" type="button" aria-label="Buka menu" aria-expanded="false"><span></span><span></span><span></span></button>
    <nav class="nav" aria-label="Utama">
      ${MENU.map(([id, href, label]) => `<a href="${AKAR}${href}"${id === kini ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
      <a class="nav-akun" href="${AKAR}akun/" id="nav-akun"${kini === 'akun' ? ' aria-current="page"' : ''}><span class="nav-akun-bulat" aria-hidden="true"></span><span class="nav-akun-teks">Masuk</span></a>
      <a class="tombol tombol--kecil" href="${AKAR}konsultasi/">Jadwalkan konsultasi</a>
    </nav>
  </div>`;
  const atur = () => el.classList.toggle('bergulir', scrollY > 8);
  addEventListener('scroll', atur, { passive: true }); atur();
  const tombol = el.querySelector('.menu-buka');
  tombol.addEventListener('click', () => {
    const buka = el.classList.toggle('menu-terbuka');
    tombol.setAttribute('aria-expanded', buka);
  });
  el.querySelectorAll('.nav a').forEach(a => a.addEventListener('click', () => el.classList.remove('menu-terbuka')));
}

function pasangKaki() {
  const el = document.querySelector('footer.kaki[data-kerangka]');
  if (!el) return;
  const s = SOSMED;
  el.innerHTML = `
  <div class="wadah">
    <div class="kaki-grid">
      <div class="kaki-merek">
        <img src="${AKAR}assets/img/wordmark-krem.png" alt="Sewain Property Agency" width="445" height="118">
        <p>Agen sewa dan jual-beli toko, ruko, dan rumah di Bali dan Nusa Tenggara Barat.</p>
        <div class="sosmed">${['instagram', 'tiktok', 'facebook', 'whatsapp'].map(k =>
          `<a href="${s[k].url}" target="_blank" rel="noopener" aria-label="${s[k].nama} ${esc(s[k].akun)}" title="${s[k].nama} ${esc(s[k].akun)}">${LOGO_SOSMED[k]}</a>`).join('')}</div>
      </div>
      <div><h4>Properti</h4><ul>
        <li><a href="${AKAR}properti/?jenis=sewa">Disewakan</a></li>
        <li><a href="${AKAR}properti/?jenis=jual">Dijual</a></li>
        <li><a href="${AKAR}properti/?tipe=toko,ruko">Toko &amp; ruko</a></li>
        <li><a href="${AKAR}properti/?tipe=rumah">Rumah</a></li>
        <li><a href="${AKAR}rekomendasi/">Rekomendasi sesuai usaha</a></li>
      </ul></div>
      <div><h4>Layanan</h4><ul>
        <li><a href="${AKAR}konsultasi/">Jadwalkan konsultasi</a></li>
        <li><a href="${AKAR}konsultasi/?jenis=survei">Survei lokasi</a></li>
        <li><a href="${AKAR}titip/">Titip properti</a></li>
        <li><a href="${AKAR}akun/">Akun saya</a></li>
        <li><a href="${AKAR}artikel/">Artikel</a></li>
      </ul></div>
      <div><h4>Hubungi</h4><ul>
        ${['whatsapp', 'instagram', 'tiktok', 'facebook'].map(k => `<li><a href="${s[k].url}" target="_blank" rel="noopener">${s[k].nama} ${esc(s[k].akun)}</a></li>`).join('')}
        <li>Senin–Sabtu, 09.00–17.00 WITA</li>
      </ul></div>
    </div>
    <div class="kaki-bawah">
      <span>© <span data-tahun></span> Sewain Property Agency</span>
      <span class="kaki-tautan"><a href="${AKAR}p/privacy-policy.html">Kebijakan privasi</a><a href="${AKAR}p/profile-tim.html">Tentang kami</a><a href="${AKAR}pengurus/">Masuk pengurus</a></span>
    </div>
  </div>`;
}

function pasangGelembungWA() {
  if (document.body.dataset.tanpaWa !== undefined || document.querySelector('.gelembung-wa')) return;
  const a = document.createElement('a');
  a.className = 'gelembung-wa';
  a.href = WA_LINK; a.target = '_blank'; a.rel = 'noopener';
  a.setAttribute('aria-label', 'Chat WhatsApp dengan agen Sewain');
  a.innerHTML = LOGO_SOSMED.whatsapp + '<span>Tanya agen</span>';
  document.body.appendChild(a);
}

pasangKepala();
pasangKaki();
pasangGelembungWA();
document.querySelectorAll('[data-tahun]').forEach(el => { el.textContent = new Date().getFullYear(); });

// ---------- karosel kartu: geser dengan tombol, titik mengikuti gulir
document.addEventListener('click', e => {
  const b = e.target.closest('[data-geser]');
  if (!b) return;
  const k = b.parentElement.querySelector('[data-karosel]');
  k.scrollBy({ left: k.clientWidth * Number(b.dataset.geser), behavior: 'smooth' });
});
document.addEventListener('scroll', e => {
  const k = e.target;
  if (!(k instanceof Element) || !k.matches('[data-karosel]')) return;
  const i = Math.round(k.scrollLeft / k.clientWidth);
  k.parentElement.querySelectorAll('.karosel-titik i').forEach((t, j) => t.classList.toggle('aktif', i === j));
}, true);

// ---------- status masuk di kepala + tombol favorit di mana pun
let modAkun = null;
const akunMod = () => (modAkun ||= import('./akun.js'));

function tandaiFavorit(set) {
  // Hanya tulis bila nilainya berubah: menulis ulang teks tombol memicu
  // MutationObserver di bawah, dan tanpa penjaga ini halaman berputar tanpa henti.
  document.querySelectorAll('[data-favorit]').forEach(b => {
    const ya = set.has(b.dataset.favorit);
    if (b.getAttribute('aria-pressed') !== String(ya)) b.setAttribute('aria-pressed', ya);
    const label = (ya ? 'Hapus ' : 'Simpan ') + b.dataset.favorit + (ya ? ' dari favorit' : ' ke favorit');
    if (b.getAttribute('aria-label') !== label) b.setAttribute('aria-label', label);
    const teks = ya ? 'Tersimpan' : 'Simpan';
    if (b.classList.contains('tombol') && b.textContent !== teks) b.textContent = teks;
  });
}
export function segarkanFavorit() { if (modAkun) modAkun.then(m => tandaiFavorit(m.favoritSaya())); }

akunMod().then(m => m.pantau((u, p) => {
  const nav = document.getElementById('nav-akun');
  if (nav) {
    nav.querySelector('.nav-akun-teks').textContent = u ? 'Akun saya' : 'Masuk';
    const bulat = nav.querySelector('.nav-akun-bulat');
    bulat.textContent = u ? ((p && p.nama) || u.displayName || u.email || '?').trim().charAt(0).toUpperCase() : '';
    nav.classList.toggle('nav-akun--masuk', !!u);
  }
  tandaiFavorit(m.favoritSaya());
}));

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-favorit]');
  if (!b) return;
  e.preventDefault();
  const m = await akunMod();
  if (!m.pengguna()) {
    if (!m.pernahMasuk()) await m.muatAuth();
    if (!m.pengguna()) { location.href = AKAR + 'akun/?lanjut=' + encodeURIComponent(location.pathname + location.search) + '&simpan=' + encodeURIComponent(b.dataset.favorit); return; }
  }
  const simpan = b.getAttribute('aria-pressed') !== 'true';
  b.setAttribute('aria-pressed', simpan);
  b.disabled = true;
  try { await m.aturFavorit(b.dataset.favorit, simpan); }
  catch (err) { b.setAttribute('aria-pressed', !simpan); alert(err.message); }
  finally { b.disabled = false; }
});

// Konten yang dirender belakangan (kartu dari API) ikut ditandai.
let jadwalSegar = 0;
new MutationObserver(() => {
  if (jadwalSegar) return;
  jadwalSegar = requestAnimationFrame(() => { jadwalSegar = 0; segarkanFavorit(); });
}).observe(document.body, { childList: true, subtree: true });
