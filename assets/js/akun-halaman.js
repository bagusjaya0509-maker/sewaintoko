import { esc, AKAR, ambilListing, kartuListing, fotoKecil, rupiahRingkas, tampilPesan, hrefListing } from './inti.js';
import * as akun from './akun.js?v=20261123a';

const isi = document.getElementById('isi');
const q = new URLSearchParams(location.search);
const LOGO_G = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>';
const JENIS = { konsultasi: 'Konsultasi', survei: 'Survei lokasi', titip: 'Titip properti' };
const STATUS = { baru: 'Menunggu konfirmasi', dikonfirmasi: 'Dikonfirmasi', selesai: 'Selesai', batal: 'Dibatalkan' };

// ---------------------------------------------------------------- belum masuk
function tampilMasuk(mode = 'masuk') {
  const daftar = mode === 'daftar';
  isi.innerHTML = `
  <div class="masuk-kotak">
    <div class="kotak">
      <p class="alis">Akun Sewain</p>
      <h1 class="judul-3" style="margin-bottom:8px">${daftar ? 'Buat akun' : 'Masuk'}</h1>
      <p class="bantu" style="font-size:15px">${q.get('simpan') ? 'Masuk untuk menyimpan ' + esc(q.get('simpan')) + ' ke favorit.' : 'Simpan properti favorit, pantau jadwal survei, dan titipkan properti Anda.'}</p>
      <button class="tombol tombol--penuh tombol-google" type="button" id="masuk-google">${LOGO_G} ${daftar ? 'Daftar' : 'Masuk'} dengan Google</button>
      <div class="pemisah">atau dengan email</div>
      <form id="form-email" style="display:grid;gap:12px" novalidate>
        ${daftar ? '<label class="medan"><span>Nama lengkap</span><input class="masukan" name="nama" autocomplete="name" required></label>' : ''}
        <label class="medan"><span>Email</span><input class="masukan" name="email" type="email" autocomplete="email" required></label>
        <label class="medan"><span>Sandi</span><input class="masukan" name="sandi" type="password" autocomplete="${daftar ? 'new-password' : 'current-password'}" minlength="8" required>${daftar ? '<small>Minimal 8 karakter.</small>' : ''}</label>
        <div class="pesan" role="status" id="pesan-masuk"></div>
        <button class="tombol tombol--penuh" type="submit">${daftar ? 'Buat akun' : 'Masuk'}</button>
      </form>
      <p style="margin:16px 0 0;font-size:14px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <button class="tautan-teks" type="button" id="ganti-mode">${daftar ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Buat akun'}</button>
        ${daftar ? '' : '<button class="tautan-teks" type="button" id="lupa">Lupa sandi</button>'}
      </p>
    </div>
    <p class="bantu" style="text-align:center;margin-top:14px">Dengan membuat akun, Anda menyetujui <a href="${AKAR}p/privacy-policy.html">kebijakan privasi</a> Sewain.</p>
  </div>`;
  const pesan = document.getElementById('pesan-masuk');
  const f = document.getElementById('form-email');
  document.getElementById('ganti-mode').onclick = () => tampilMasuk(daftar ? 'masuk' : 'daftar');
  akun.siapkanMasuk();
  document.getElementById('masuk-google').onclick = async e => {
    e.target.disabled = true;
    try { await akun.masukGoogle(); } catch (err) { tampilPesan(pesan, 'galat', err.message); } finally { e.target.disabled = false; }
  };
  document.getElementById('lupa')?.addEventListener('click', async () => {
    const email = f.email.value.trim();
    if (!email) { tampilPesan(pesan, 'galat', 'Isi email Anda dulu, lalu tekan "Lupa sandi" lagi.'); f.email.focus(); return; }
    try { await akun.lupaSandi(email); tampilPesan(pesan, 'ok', 'Tautan atur ulang sandi sudah dikirim ke ' + email + '. Periksa juga folder spam.'); }
    catch (err) { tampilPesan(pesan, 'galat', err.message); }
  });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const tombol = f.querySelector('[type=submit]');
    tombol.disabled = true;
    try {
      if (daftar) {
        if ((f.nama.value || '').trim().length < 2) throw new Error('Isi nama lengkap Anda.');
        await akun.daftarEmail(f.nama.value.trim(), f.email.value.trim(), f.sandi.value);
      } else await akun.masukEmail(f.email.value.trim(), f.sandi.value);
    } catch (err) { tampilPesan(pesan, 'galat', err.message); }
    finally { tombol.disabled = false; }
  });
}

// ---------------------------------------------------------------- sudah masuk
let tabAktif = q.get('tab') || 'favorit';

async function tampilAkun(u, p, pengurus) {
  const nama = (p && p.nama) || u.displayName || u.email;
  const foto = u.photoURL;
  isi.innerHTML = `
  <div class="akun-susun">
    <aside class="kotak">
      <div class="profil-bulat">${foto ? `<img src="${esc(foto)}" alt="" referrerpolicy="no-referrer">` : esc(nama.charAt(0).toUpperCase())}</div>
      <b style="font-size:18px">${esc(nama)}</b>
      <span class="bantu" style="margin:2px 0 0">${esc(u.email || '')}</span>
      ${u.email && !u.emailVerified ? '<span class="bantu" style="color:var(--jerami-tua)">Email belum terverifikasi. Buka tautan yang kami kirim ke email Anda.</span>' : ''}
      <nav class="menu-akun" role="tablist" aria-label="Menu akun">
        <button role="tab" data-tab="favorit">Favorit <span>${(p?.favorit || []).length}</span></button>
        <button role="tab" data-tab="jadwal">Jadwal survei</button>
        <button role="tab" data-tab="titip">Properti titipan saya</button>
        <button role="tab" data-tab="profil">Profil</button>
      </nav>
      ${pengurus ? `<a class="tombol tombol--penuh" style="margin-top:16px" href="${AKAR}pengurus/">Buka panel pengurus</a>` : ''}
      <button class="tombol tombol--garis tombol--penuh tombol--kecil" style="margin-top:12px" type="button" id="keluar">Keluar</button>
    </aside>
    <section id="panel-akun" aria-live="polite"></section>
  </div>`;
  document.getElementById('keluar').onclick = () => akun.keluar();
  isi.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { tabAktif = b.dataset.tab; gambarTab(u, p); }));
  gambarTab(u, p);
}

function gambarTab(u, p) {
  isi.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tabAktif));
  history.replaceState(null, '', '?tab=' + tabAktif);
  const panel = document.getElementById('panel-akun');
  ({ favorit: tabFavorit, jadwal: tabJadwal, titip: tabTitip, profil: tabProfil })[tabAktif]?.(panel, u, p);
}

async function tabFavorit(panel, u, p) {
  const kode = p?.favorit || [];
  panel.innerHTML = `<div class="bagian-kepala" style="margin-bottom:18px"><div><h1 class="judul-2">Properti favorit</h1></div></div><div id="grid-favorit" class="grid-listing"></div>`;
  const grid = document.getElementById('grid-favorit');
  if (!kode.length) { grid.outerHTML = `<div class="kosong">Belum ada yang disimpan. Tekan ikon hati pada properti mana pun untuk menyimpannya di sini.<br><a class="tombol" href="${AKAR}properti/">Telusuri properti</a></div>`; return; }
  grid.innerHTML = '<div class="memuat" style="height:380px"></div>';
  try {
    const { listing } = await ambilListing({});
    const ada = kode.map(k => listing.find(l => l.kode === k)).filter(Boolean);
    const hilang = kode.length - ada.length;
    grid.innerHTML = ada.map(kartuListing).join('');
    if (hilang) grid.insertAdjacentHTML('afterend', `<p class="bantu" style="margin-top:14px">${hilang} properti favorit Anda sudah tidak ditawarkan (tersewa, terjual, atau ditarik pemilik).</p>`);
  } catch (e) { grid.innerHTML = `<div class="kosong">${esc(e.message)}</div>`; }
}

async function tabJadwal(panel) {
  panel.innerHTML = `<h1 class="judul-2" style="margin-bottom:18px">Jadwal survei &amp; konsultasi</h1><div id="daftar-jadwal"><div class="memuat" style="height:120px"></div></div>`;
  const el = document.getElementById('daftar-jadwal');
  try {
    const { jadwal } = await akun.apiAkun('/api/akun/jadwal');
    if (!jadwal.length) { el.innerHTML = `<div class="kosong">Belum ada jadwal. Jadwal yang Anda buat saat sedang masuk akan muncul di sini.<br><a class="tombol" href="${AKAR}konsultasi/">Jadwalkan konsultasi</a></div>`; return; }
    el.innerHTML = jadwal.map(b => {
      const tgl = new Date(b.tanggal + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      return `<div class="kartu-jadwal status-${esc(b.status)}">
        <div class="kartu-jadwal-waktu"><span class="angka">${esc(b.jam)}</span><small>${esc(tgl)}</small></div>
        <div><b>${esc(JENIS[b.jenis] || b.jenis)}</b>${b.kode ? ` · <span class="plakat" style="font-size:12px">${esc(b.kode)}</span>` : ''}<br><small>Nomor jadwal ${esc(b.id)}</small></div>
        <div><span class="status ${b.status === 'baru' ? 'status--ditahan' : b.status === 'batal' || b.status === 'selesai' ? 'status--tersewa' : ''}">${esc(STATUS[b.status] || b.status)}</span></div>
      </div>`;
    }).join('');
  } catch (e) { el.innerHTML = `<div class="kosong">${esc(e.message)}</div>`; }
}

async function tabTitip(panel) {
  panel.innerHTML = `<div class="bagian-kepala" style="margin-bottom:18px"><div><h1 class="judul-2">Properti titipan saya</h1><p class="lead" style="margin-top:8px">Properti yang Anda titipkan tayang setelah diperiksa agen.</p></div><a class="tombol" href="${AKAR}titip/">+ Titip properti</a></div>
    <div class="kotak" id="daftar-titip"><div class="memuat" style="height:80px"></div></div>`;
  const el = document.getElementById('daftar-titip');
  try {
    const { titip } = await akun.apiAkun('/api/akun/titip');
    if (!titip.length) { el.innerHTML = '<p style="margin:0">Belum ada properti yang Anda titipkan.</p>'; return; }
    el.innerHTML = titip.map(t => {
      const isiBaris = `${t.foto[0] ? `<img src="${esc(fotoKecil(t.foto[0], 200))}" alt="">` : '<span class="mini-kosong"></span>'}
        <div><b>${esc(t.judul)}</b><br><small class="bantu"><span class="plakat" style="font-size:11px">${esc(t.kode)}</span> ${t.harga ? esc(rupiahRingkas(t.harga)) + (t.periode ? ' / ' + esc(t.periode) : '') : ''}</small></div>
        <span class="status-titip ${t.tayang ? 'status-titip--tayang' : ''}">${t.tayang ? 'Tayang' : 'Menunggu pemeriksaan'}</span>`;
      return t.tayang ? `<a class="baris-titip" href="${hrefListing(t)}">${isiBaris}</a>` : `<div class="baris-titip">${isiBaris}</div>`;
    }).join('');
  } catch (e) { el.innerHTML = esc(e.message); }
}

function tabProfil(panel, u, p) {
  panel.innerHTML = `<h1 class="judul-2" style="margin-bottom:18px">Profil</h1>
  <form class="kotak" id="form-profil" style="display:grid;gap:14px;max-width:520px" novalidate>
    <label class="medan"><span>Nama</span><input class="masukan" name="nama" value="${esc(p?.nama || u.displayName || '')}" required></label>
    <label class="medan"><span>Nomor WhatsApp</span><input class="masukan" name="telepon" inputmode="tel" value="${esc(p?.telepon || '')}" placeholder="0812xxxxxxx"><small>Dipakai agen untuk mengonfirmasi jadwal dan titipan Anda.</small></label>
    <label class="medan"><span>Email</span><input class="masukan" value="${esc(u.email || '')}" disabled></label>
    <div class="pesan" role="status" id="pesan-profil"></div>
    <button class="tombol" type="submit">Simpan profil</button>
  </form>`;
  const f = document.getElementById('form-profil');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const pesan = document.getElementById('pesan-profil');
    try {
      await akun.apiAkun('/api/akun', { method: 'PATCH', json: { nama: f.nama.value, telepon: f.telepon.value } });
      tampilPesan(pesan, 'ok', 'Profil tersimpan.');
    } catch (err) { tampilPesan(pesan, 'galat', err.message); }
  });
}

// ---------------------------------------------------------------- alur
let sudahLanjut = false;
akun.pantau(async (u, p) => {
  if (!u) { if (!akun.pernahMasuk()) tampilMasuk(q.get('mode') === 'daftar' ? 'daftar' : 'masuk'); return; }
  // Kembali ke halaman asal (mis. setelah menekan ikon hati sebelum masuk).
  if (!sudahLanjut && q.get('lanjut')) {
    sudahLanjut = true;
    if (q.get('simpan')) { try { await akun.aturFavorit(q.get('simpan'), true); } catch (_) {} }
    const tujuan = q.get('lanjut');
    if (/^\/[^/]/.test(tujuan)) { location.replace(tujuan); return; }
  }
  let pengurus = false;
  try { pengurus = (await akun.apiAkun('/api/akun')).pengurus; } catch (_) {}
  tampilAkun(u, p, pengurus);
});
if (akun.pernahMasuk()) akun.muatAuth().then(() => { if (!akun.pengguna()) tampilMasuk(); });
