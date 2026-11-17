import { API, esc, fotoKecil, labelHarga, rupiahPenuh, tempat, tipeLabel, namaKab, tampilPesan, AKAR, hrefListing } from './inti.js';
import * as akunFb from './akun.js';

const WILAYAH = {
  'Bali': ['Kota Denpasar', 'Kabupaten Badung', 'Kabupaten Gianyar', 'Kabupaten Tabanan', 'Kabupaten Klungkung', 'Kabupaten Bangli', 'Kabupaten Karangasem', 'Kabupaten Buleleng', 'Kabupaten Jembrana'],
  'Nusa Tenggara Barat': ['Kota Mataram', 'Kabupaten Lombok Barat', 'Kabupaten Lombok Tengah', 'Kabupaten Lombok Timur', 'Kabupaten Lombok Utara', 'Kabupaten Sumbawa Barat', 'Kabupaten Sumbawa', 'Kabupaten Dompu', 'Kabupaten Bima', 'Kota Bima'],
};
const PUSAT = { 'Bali': [-8.6705, 115.2126], 'Nusa Tenggara Barat': [-8.5833, 116.1167] };
const TIPE = ['toko', 'ruko', 'rumah', 'kontrakan', 'gudang', 'tanah', 'villa', 'kantor'];
const STATUS = { tersedia: 'Tersedia', tersewa: 'Tersewa', terjual: 'Terjual', ditahan: 'Ditahan' };
const STATUS_JADWAL = { baru: 'Baru', dikonfirmasi: 'Dikonfirmasi', selesai: 'Selesai', batal: 'Batal' };
const JENIS_JADWAL = { konsultasi: 'Konsultasi', survei: 'Survei lokasi', titip: 'Titip properti' };
const CARA = { kantor: 'di kantor', lokasi: 'di lokasi', online: 'panggilan video' };

let token = '';
try { token = localStorage.getItem('sewain.token') || ''; } catch (_) {}
// Anggota tim boleh masuk dengan Google (Firebase). Token Firebase berumur
// satu jam, jadi selalu diminta ulang lewat akunFb.token() sebelum memanggil API.
let modeGoogle = false;
try { modeGoogle = localStorage.getItem('sewain.pengurus.google') === '1'; } catch (_) {}
const tokenSaatIni = async () => (modeGoogle ? await akunFb.token() : token);
let saya = null, semuaListing = [], semuaJadwal = [], saringJadwal = 'mendatang', saringListing = 'semua';
// Kanal sosmed yang dilacak. Facebook sengaja tidak ada: Instagram Sewain
// meneruskan postingannya ke Facebook secara otomatis.
const KANAL = [['instagram', 'IG', 'Instagram'], ['tiktok', 'TT', 'TikTok']];
const belumDiposting = l => l.terbit !== false && KANAL.some(([k]) => !l.posting?.[k]);
const hariKe = tgl => Math.ceil((Date.parse(tgl + 'T00:00:00') - Date.now()) / 864e5);
const kontrakSegera = l => { const b = l.internal?.penyewa?.berakhir; return !!b && hariKe(b) <= 60; };
const titipanBaru = l => !!l.titipan && l.terbit === false;
const mentahBelum = l => (l.internal?.mentah || []).some(x => !x.diolah);
const SARING = { semua: () => true, belum: belumDiposting, draf: l => l.terbit === false, titipan: titipanBaru, kontrak: kontrakSegera, mentah: mentahBelum };
const KOSONG = { belum: 'Semua listing sudah diposting.', titipan: 'Tidak ada titipan yang menunggu pemeriksaan.', kontrak: 'Tidak ada kontrak yang berakhir dalam 60 hari.', mentah: 'Semua bahan mentah sudah diolah.' };
const tglPendek = t => new Date(t + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const waTautan = t => 'https://wa.me/' + String(t).replace(/^0/, '62').replace(/^\+/, '');
const $ = id => document.getElementById(id);

async function panggil(jalur, opsi = {}) {
  const t = await tokenSaatIni();
  const kepala = Object.assign({}, opsi.headers, t ? { Authorization: 'Bearer ' + t } : {});
  if (opsi.json !== undefined) { kepala['Content-Type'] = 'application/json'; opsi.body = JSON.stringify(opsi.json); }
  let r;
  try { r = await fetch(API + jalur, { method: opsi.method || 'GET', headers: kepala, body: opsi.body }); }
  catch (_) { throw new Error('Tidak bisa terhubung ke server. Periksa koneksi internet.'); }
  let d = {};
  try { d = await r.json(); } catch (_) {}
  if (r.status === 401 && jalur !== '/api/pengurus/masuk') { keluar(); throw new Error(d.galat || 'Sesi berakhir.'); }
  if (!r.ok) { const e = new Error(d.galat || 'Permintaan gagal (' + r.status + ').'); e.status = r.status; throw e; }
  return d;
}

function tampilkan(layar) {
  for (const id of ['layar-masuk', 'layar-sandi', 'layar-panel', 'layar-sunting']) $(id).hidden = id !== layar;
  scrollTo(0, 0);
}

function keluar() {
  if (token) fetch(API + '/api/pengurus/keluar', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }).catch(() => {});
  if (modeGoogle) akunFb.keluar().catch(() => {});
  token = ''; saya = null; modeGoogle = false;
  try { localStorage.removeItem('sewain.token'); localStorage.removeItem('sewain.pengurus.google'); } catch (_) {}
  $('akun-kepala').innerHTML = '';
  tampilkan('layar-masuk');
}

// ---------------------------------------------------------------- masuk
$('form-masuk').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, pesan = f.querySelector('.pesan'), tombol = f.querySelector('button');
  tombol.disabled = true;
  try {
    const r = await panggil('/api/pengurus/masuk', { method: 'POST', json: { email: f.email.value, sandi: f.sandi.value } });
    token = r.token;
    try { localStorage.setItem('sewain.token', token); } catch (_) {}
    f.reset(); pesan.className = 'pesan';
    await mulai(r.pengurus);
  } catch (err) { tampilPesan(pesan, 'galat', err.message); }
  finally { tombol.disabled = false; }
});

$('masuk-google-panel').addEventListener('click', async e => {
  const pesan = $('form-masuk').querySelector('.pesan');
  e.target.disabled = true;
  try {
    await akunFb.masukGoogle();
    modeGoogle = true;
    try { localStorage.setItem('sewain.pengurus.google', '1'); } catch (_) {}
    const r = await panggil('/api/pengurus/saya');
    await mulai(r.pengurus);
  } catch (err) {
    const email = akunFb.pengguna()?.email;
    modeGoogle = false;
    try { localStorage.removeItem('sewain.pengurus.google'); } catch (_) {}
    await akunFb.keluar().catch(() => {});
    tampilPesan(pesan, 'galat', err.status === 401 || /Sesi/.test(err.message)
      ? (email || 'Akun Google itu') + ' belum terdaftar sebagai pengurus. Minta admin menambahkannya di tab Akun, lalu coba lagi.'
      : err.message);
    $('layar-masuk').hidden = false;
  } finally { e.target.disabled = false; }
});

async function gantiSandi(f) {
  const pesan = f.querySelector('.pesan');
  try {
    await panggil('/api/pengurus/sandi', { method: 'POST', json: { lama: f.lama.value, baru: f.baru.value } });
    f.reset();
    tampilPesan(pesan, 'ok', 'Sandi baru tersimpan.');
    return true;
  } catch (err) { tampilPesan(pesan, 'galat', err.message); return false; }
}
$('form-sandi-awal').addEventListener('submit', async e => {
  e.preventDefault();
  if (await gantiSandi(e.target)) { saya.wajibGantiSandi = false; await mulai(saya); }
});
$('form-sandi').addEventListener('submit', e => { e.preventDefault(); gantiSandi(e.target); });

async function mulai(pengurus) {
  saya = pengurus;
  $('akun-kepala').innerHTML = `<span style="color:var(--lumut)">${esc(saya.nama)} · ${esc(saya.peran)}</span>
    <a class="tombol tombol--garis tombol--kecil" href="${AKAR}" target="_blank" rel="noopener">Lihat situs</a>
    <button class="tombol tombol--kecil" type="button" id="tombol-keluar">Keluar</button>`;
  $('tombol-keluar').onclick = keluar;
  if (saya.wajibGantiSandi) return tampilkan('layar-sandi');
  $('kelola-akun').hidden = saya.peran !== 'admin';
  $('form-sandi').hidden = !!saya.lewatGoogle;
  $('kelola-pelanggan').hidden = saya.peran !== 'admin';
  tampilkan('layar-panel');
  await Promise.all([muatListing(), muatJadwal()]);
  if (saya.peran === 'admin') { muatAkun(); muatPelanggan(); }
}

// ---------------------------------------------------------------- tab
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', x === b));
  for (const t of ['listing', 'jadwal', 'akun']) $('tab-' + t).hidden = t !== b.dataset.tab;
}));

// ---------------------------------------------------------------- daftar listing
async function muatListing() {
  try { semuaListing = (await panggil('/api/pengurus/listing')).listing; gambarTabel(); }
  catch (err) { $('tabel-listing').innerHTML = `<tr><td>${esc(err.message)}</td></tr>`; }
}
function gambarTabel() {
  const kata = $('cari-listing').value.trim().toLowerCase();
  for (const k of ['belum', 'titipan', 'kontrak', 'mentah']) {
    const n = semuaListing.filter(SARING[k]).length, el = $('lencana-' + k);
    if (el) { el.hidden = !n; el.textContent = n; }
  }
  const daftar = semuaListing
    .filter(SARING[saringListing] || SARING.semua)
    .filter(l => !kata || [l.kode, l.judul, l.lokasi?.area, l.lokasi?.kabupaten].join(' ').toLowerCase().includes(kata));
  $('tabel-listing').innerHTML = `
    <thead><tr><th></th><th>Kode</th><th>Properti</th><th>Harga</th><th>Status</th><th>Pendataan</th><th>Tayang</th><th>Sosmed</th><th></th></tr></thead>
    <tbody>${daftar.map(l => {
      const h = labelHarga(l);
      return `<tr>
        <td>${l.foto?.[0] ? `<img class="mini" src="${esc(fotoKecil(l.foto[0], 160))}" alt="" loading="lazy">` : '<span class="mini mini--kosong"></span>'}</td>
        <td><span class="plakat" style="font-size:13px">${esc(l.kode)}</span></td>
        <td><b>${esc(l.judul)}</b><br><small>${esc(tempat(l))} · ${(l.foto || []).length} foto · ${(l.video || []).length} video${l.oleh ? ' · diunggah ' + esc(l.oleh.split('@')[0]) : ''}</small></td>
        <td>${h.angka ? esc((h.mulai ? 'mulai ' : '') + h.angka + ' ' + h.satuan) : '<small>belum diisi</small>'}</td>
        <td><span class="status status--${esc(l.status || 'tersedia')}">${esc(STATUS[l.status || 'tersedia'])}</span>${titipanBaru(l) ? '<br><span class="status status--ditahan" style="margin-top:4px">Titipan baru</span>' : ''}</td>
        <td class="pendataan">${(() => {
          const i = l.internal || {}, pm = i.pemilik || {}, py = i.penyewa || {}, b = [];
          if (pm.nama || pm.telepon) b.push(`<span>Pemilik: <b>${esc(pm.nama || '—')}</b>${pm.telepon ? ` · <a href="${waTautan(pm.telepon)}" target="_blank" rel="noopener">${esc(pm.telepon)}</a>` : ''}</span>`);
          if (py.nama || py.berakhir) {
            const h = py.berakhir ? hariKe(py.berakhir) : null;
            b.push(`<span>${l.jenis === 'jual' ? 'Pembeli' : 'Penyewa'}: <b>${esc(py.nama || '—')}</b>${py.berakhir ? ` · s.d. ${esc(tglPendek(py.berakhir))} <em class="${h <= 60 ? 'tanda-kontrak' : ''}">${h < 0 ? 'lewat ' + -h + ' hari' : h + ' hari lagi'}</em>` : ''}</span>`);
          }
          const m = (i.mentah || []).filter(x => !x.diolah).length;
          if (m) b.push(`<span class="tanda-mentah">${m} bahan mentah belum diolah</span>`);
          return b.join('') || '<small>Belum didata</small>';
        })()}</td>
        <td>${l.terbit === false ? '<small>Draf</small>' : 'Ya'}${l.unggulan ? ' · ★' : ''}</td>
        <td class="kanal-posting">${KANAL.map(([k, singkat, nama]) => {
          const p = l.posting?.[k];
          return `<button type="button" class="chip-kanal${p ? ' chip-kanal--sudah' : ''}" data-kanal="${k}" data-kode="${esc(l.kode)}"
            aria-pressed="${!!p}" title="${p ? esc(nama + ' diposting ' + p.tanggal.slice(0, 10) + ' oleh ' + p.oleh) : esc(nama + ': belum diposting. Klik bila sudah.')}">${singkat}</button>`;
        }).join('')}</td>
        <td class="aksi">
          <button class="tombol tombol--garis tombol--kecil" data-ubah="${esc(l.kode)}">Ubah</button>
          <button class="tombol tombol--garis tombol--kecil" data-sosmed="${esc(l.kode)}">Sosmed</button>
        </td></tr>`;
    }).join('') || `<tr><td colspan="9">${KOSONG[saringListing] || 'Tidak ada listing yang cocok.'}</td></tr>`}</tbody>`;
}
$('cari-listing').addEventListener('input', gambarTabel);
$('tabel-listing').addEventListener('click', e => {
  const kanal = e.target.closest('[data-kanal]');
  if (kanal) return tandaiPosting(kanal);
  const u = e.target.closest('[data-ubah]'), s = e.target.closest('[data-sosmed]');
  if (u) bukaSunting(semuaListing.find(l => l.kode === u.dataset.ubah));
  if (s) bukaSosmed(s.dataset.sosmed);
});
$('tambah-listing').addEventListener('click', () => bukaSunting(null));
document.querySelectorAll('[data-saring-listing]').forEach(b => b.addEventListener('click', () => {
  saringListing = b.dataset.saringListing;
  document.querySelectorAll('[data-saring-listing]').forEach(x => x.setAttribute('aria-pressed', x === b));
  gambarTabel();
}));
async function tandaiPosting(tombol) {
  const l = semuaListing.find(x => x.kode === tombol.dataset.kode);
  const sudah = !l.posting?.[tombol.dataset.kanal];
  tombol.disabled = true;
  try {
    const r = await panggil('/api/pengurus/listing/' + encodeURIComponent(l.kode) + '/posting',
      { method: 'PATCH', json: { kanal: tombol.dataset.kanal, sudah } });
    l.posting = r.posting;
    gambarTabel();
  } catch (err) { tombol.disabled = false; alert(err.message); }
}

// ---------------------------------------------------------------- bahan sosmed
async function bukaSosmed(kode) {
  const d = $('dialog-sosmed');
  $('caption-sosmed').value = 'Menyusun caption…';
  $('foto-sosmed').innerHTML = '';
  d.showModal();
  try {
    const r = await panggil('/api/pengurus/sosmed/' + encodeURIComponent(kode));
    $('judul-sosmed').textContent = 'Bahan posting ' + r.kode;
    $('caption-sosmed').value = r.caption;
    $('foto-sosmed').innerHTML = [...r.foto.map(f => `<a href="${esc(f)}" target="_blank" rel="noopener" title="Buka foto ukuran penuh"><img src="${esc(fotoKecil(f, 320))}" alt=""></a>`),
      ...r.video.map(v => `<a class="tombol tombol--garis tombol--kecil" href="${esc(v)}" target="_blank" rel="noopener">Video</a>`)].join('');
  } catch (err) { $('caption-sosmed').value = err.message; }
}
$('salin-caption').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('caption-sosmed').value);
  $('salin-caption').textContent = 'Tersalin';
  setTimeout(() => { $('salin-caption').textContent = 'Salin caption'; }, 1600);
});

// ---------------------------------------------------------------- penyunting
let sunting = null, petaSunting = null, penandaSunting = null;

function opsi(daftar, pilih, label = x => x) {
  return daftar.map(v => `<option value="${esc(v)}" ${v === pilih ? 'selected' : ''}>${esc(label(v))}</option>`).join('');
}

function bukaSunting(l) {
  sunting = JSON.parse(JSON.stringify(l || {
    jenis: 'sewa', tipe: 'ruko', status: 'tersedia', terbit: true, unggulan: false,
    lokasi: { provinsi: 'Bali' }, spesifikasi: {}, fitur: [], deskripsi: [], foto: [], video: [], periode: 'tahun',
  }));
  sunting.internal = Object.assign({ pemilik: {}, penyewa: {}, catatan: '', mentah: [] }, sunting.internal || {});
  const pm = sunting.internal.pemilik || {}, py = sunting.internal.penyewa || {}, tt = sunting.titipan;
  const s = sunting.spesifikasi || {}, lk = sunting.lokasi || { provinsi: 'Bali' };
  const cek = (nilai, daftar) => daftar.includes(nilai) ? 'checked' : '';
  $('layar-sunting').innerHTML = `
    <div class="bilah-hasil" style="padding-top:0">
      <button class="tombol tombol--garis tombol--kecil" type="button" id="kembali">← Kembali ke daftar</button>
      <span>${l ? `<span class="plakat">${esc(l.kode)}</span>` : '<b>Listing baru</b> — kode dibuat otomatis dari kabupaten'}</span>
    </div>
    <form id="form-sunting" class="sunting-susun" novalidate>
      <div class="sunting-kolom">
        <fieldset class="langkah"><h2>Penawaran</h2>
          <div class="baris-medan">
            <label class="medan"><span>Jenis</span><select class="masukan" name="jenis">${opsi(['sewa', 'jual'], sunting.jenis, v => v === 'sewa' ? 'Disewakan' : 'Dijual')}</select></label>
            <label class="medan"><span>Tipe</span><select class="masukan" name="tipe">${opsi(TIPE, sunting.tipe, tipeLabel)}</select></label>
            <label class="medan"><span>Status</span><select class="masukan" name="status">${opsi(Object.keys(STATUS), sunting.status || 'tersedia', v => STATUS[v])}</select></label>
          </div>
          <label class="medan" style="margin-top:12px"><span>Judul <small>(kosongkan untuk dibuat otomatis)</small></span><input class="masukan" name="judul" maxlength="140" value="${esc(sunting.judul || '')}" placeholder="mis. Disewakan Ruko 2 Lantai di Kerobokan"></label>
          <div class="baris-medan" style="margin-top:12px">
            <label class="medan"><span>Harga (Rp)</span><input class="masukan" name="harga" type="number" min="0" step="1000000" inputmode="numeric" value="${sunting.harga ?? ''}" placeholder="mis. 65000000"><small id="harga-baca">${sunting.harga ? esc(rupiahPenuh(sunting.harga)) : 'Kosongkan bila harga tidak dipublikasikan'}</small></label>
            <label class="medan"><span>Per</span><select class="masukan" name="periode">${opsi(['tahun', 'bulan', ''], sunting.periode || '', v => v ? v.charAt(0).toUpperCase() + v.slice(1) : 'Total (harga jual)')}</select></label>
          </div>
          <label style="display:flex;gap:8px;margin-top:10px;font-size:14px"><input type="checkbox" name="hargaMulai" ${sunting.hargaMulai ? 'checked' : ''}> Tampilkan sebagai "mulai" (ada beberapa pilihan harga)</label>
          <label class="medan" style="margin-top:12px"><span>Keterangan harga <small>(tampil di bawah harga)</small></span><textarea class="masukan" name="hargaTeks" maxlength="400" rows="2" placeholder="mis. Minimal sewa 2 tahun, masih bisa dinegosiasikan.">${esc(sunting.hargaTeks || '')}</textarea></label>
        </fieldset>

        <fieldset class="langkah"><h2>Foto</h2>
          <p class="bantu">Foto pertama jadi sampul. Foto diperkecil otomatis dan data lokasi GPS di dalamnya dibuang sebelum diunggah.</p>
          <div class="galeri-sunting" id="galeri-sunting"></div>
          <label class="tombol tombol--garis tombol--kecil" style="margin-top:12px">+ Pilih foto<input type="file" id="pilih-foto" accept="image/jpeg,image/png,image/webp" multiple hidden></label>
          <div class="kemajuan" id="kemajuan-foto" hidden><span></span></div>
        </fieldset>

        <fieldset class="langkah"><h2>Video</h2>
          <p class="bantu">Unggah berkas video (maks. 300 MB), atau tempel tautan YouTube, Instagram Reels, atau TikTok.</p>
          <div id="daftar-video"></div>
          <div class="baris-medan" style="margin-top:12px">
            <label class="tombol tombol--garis tombol--kecil">+ Unggah video<input type="file" id="pilih-video" accept="video/mp4,video/quicktime,video/webm" hidden></label>
            <div style="display:flex;gap:8px"><input class="masukan" id="tautan-video" placeholder="https://youtube.com/… atau instagram.com/reel/…"><button class="tombol tombol--kecil" type="button" id="tambah-tautan-video">Tambah</button></div>
          </div>
          <div class="kemajuan" id="kemajuan-video" hidden><span></span></div>
        </fieldset>

        <fieldset class="langkah"><h2>Bahan mentah <small class="bantu" style="font-family:var(--f-teks);letter-spacing:0">tidak tayang</small></h2>
          <p class="bantu">Foto dan video asli dari lapangan, disimpan apa adanya tanpa diperkecil, untuk diedit lalu diposting. Centang "sudah diolah" setelah dipakai, supaya daftar "Bahan mentah" di panel tetap rapi.</p>
          <div id="daftar-mentah"></div>
          <label class="tombol tombol--garis tombol--kecil" style="margin-top:12px">+ Unggah bahan mentah<input type="file" id="pilih-mentah" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" multiple hidden></label>
          <div class="kemajuan" id="kemajuan-mentah" hidden><span></span></div>
        </fieldset>

        <fieldset class="langkah"><h2>Deskripsi</h2>
          <label class="medan"><span>Paragraf <small>(pisahkan paragraf dengan baris kosong)</small></span>
            <textarea class="masukan" name="deskripsi" rows="7">${esc((sunting.deskripsi || []).join('\n\n'))}</textarea></label>
          <h3 style="margin:18px 0 8px;font-size:15px">Fasilitas &amp; ketentuan</h3>
          <div id="daftar-fitur"></div>
          <button class="tombol tombol--garis tombol--kecil" type="button" id="tambah-fitur" style="margin-top:8px">+ Tambah poin</button>
        </fieldset>
      </div>

      <div class="sunting-kolom">
        <fieldset class="langkah"><h2>Lokasi</h2>
          <div class="baris-medan">
            <label class="medan"><span>Provinsi</span><select class="masukan" name="provinsi">${opsi(Object.keys(WILAYAH), lk.provinsi || 'Bali')}</select></label>
            <label class="medan"><span>Kabupaten / kota</span><select class="masukan" name="kabupaten" id="sunting-kab"></select></label>
          </div>
          <div class="baris-medan" style="margin-top:12px">
            <label class="medan"><span>Kelurahan / desa</span><input class="masukan" name="area" maxlength="80" value="${esc(lk.area || '')}" placeholder="mis. Kerobokan"></label>
            <label class="medan"><span>Alamat / nama jalan <small>(tampil di situs)</small></span><input class="masukan" name="alamat" maxlength="200" value="${esc(lk.alamat || '')}" placeholder="opsional"></label>
          </div>
          <p class="bantu" style="margin-top:12px">Ketuk peta untuk menandai lokasi properti.</p>
          <div class="peta" id="peta-sunting" style="height:300px"></div>
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:8px;font-size:14px">
            <span id="koordinat">${lk.lat != null ? lk.lat.toFixed(5) + ', ' + lk.lng.toFixed(5) : 'Belum ditandai'}</span>
            <label style="display:flex;gap:6px"><input type="checkbox" name="presisi" ${lk.presisi === 'titik' ? 'checked' : ''}> Tampilkan titik persis ke publik</label>
          </div>
        </fieldset>

        <fieldset class="langkah"><h2>Spesifikasi</h2>
          <div class="baris-medan">
            <label class="medan"><span>Luas tanah (m²)</span><input class="masukan" name="luasTanah" type="number" min="0" value="${s.luasTanah ?? ''}"></label>
            <label class="medan"><span>Luas bangunan (m²)</span><input class="masukan" name="luasBangunan" type="number" min="0" value="${s.luasBangunan ?? ''}"></label>
            <label class="medan"><span>Ukuran</span><input class="masukan" name="dimensi" maxlength="40" value="${esc(s.dimensi || '')}" placeholder="mis. 4,5 x 16 m"></label>
            <label class="medan"><span>Lantai</span><input class="masukan" name="lantai" type="number" min="0" value="${s.lantai ?? ''}"></label>
            <label class="medan"><span>Kamar tidur</span><input class="masukan" name="kamarTidur" type="number" min="0" value="${s.kamarTidur ?? ''}"></label>
            <label class="medan"><span>Kamar mandi</span><input class="masukan" name="kamarMandi" type="number" min="0" value="${s.kamarMandi ?? ''}"></label>
            <label class="medan"><span>Listrik (watt)</span><input class="masukan" name="listrikWatt" type="number" min="0" step="100" value="${s.listrikWatt ?? ''}"></label>
          </div>
          <div class="cek-baris"><span>Air</span>
            <label><input type="checkbox" name="air" value="PAM" ${cek('PAM', s.air || [])}> PAM</label>
            <label><input type="checkbox" name="air" value="Sumur bor" ${cek('Sumur bor', s.air || [])}> Sumur bor</label></div>
          <div class="cek-baris"><span>Legalitas</span>
            ${['SHM', 'HGB', 'IMB', 'PBG'].map(x => `<label><input type="checkbox" name="legalitas" value="${x}" ${cek(x, s.legalitas || [])}> ${x}</label>`).join('')}</div>
          <div class="cek-baris"><span>Lainnya</span>
            <label><input type="checkbox" name="parkir" ${s.parkir ? 'checked' : ''}> Parkir</label>
            <label><input type="checkbox" name="jalanUtama" ${s.jalanUtama ? 'checked' : ''}> Jalan utama</label>
            <label><input type="checkbox" name="furnitur" ${s.furnitur ? 'checked' : ''}> Furnitur</label></div>
        </fieldset>

        <fieldset class="langkah"><h2>Pendataan <small class="bantu" style="font-family:var(--f-teks);letter-spacing:0">hanya untuk pengurus</small></h2>
          ${tt ? `<div class="catatan-titipan"><b>Titipan dari pemilik</b> · diterima ${esc(String(tt.diterima || '').slice(0, 10))}<br>${esc(tt.nama || '')} · <a href="${waTautan(tt.telepon)}" target="_blank" rel="noopener">${esc(tt.telepon)}</a>${tt.email ? ' · ' + esc(tt.email) : ''}${tt.catatan ? `<br><small>${esc(tt.catatan)}</small>` : ''}</div>` : ''}
          <h3 class="sub-pendataan">Pemilik</h3>
          <div class="baris-medan">
            <label class="medan"><span>Nama</span><input class="masukan" name="pmNama" maxlength="80" value="${esc(pm.nama || '')}"></label>
            <label class="medan"><span>WhatsApp</span><input class="masukan" name="pmTelepon" inputmode="tel" value="${esc(pm.telepon || '')}" placeholder="0812xxxxxxx"></label>
            <label class="medan"><span>Email</span><input class="masukan" name="pmEmail" type="email" value="${esc(pm.email || '')}"></label>
          </div>
          <label class="medan" style="margin-top:12px"><span>Alamat lengkap properti</span><input class="masukan" name="pmAlamat" maxlength="240" value="${esc(pm.alamat || '')}"></label>
          <h3 class="sub-pendataan" id="judul-penyewa">${sunting.jenis === 'jual' ? 'Pembeli' : 'Penyewa saat ini'}</h3>
          <div class="baris-medan">
            <label class="medan"><span>Nama</span><input class="masukan" name="pyNama" maxlength="80" value="${esc(py.nama || '')}"></label>
            <label class="medan"><span>WhatsApp</span><input class="masukan" name="pyTelepon" inputmode="tel" value="${esc(py.telepon || '')}"></label>
          </div>
          <div class="baris-medan" style="margin-top:12px">
            <label class="medan"><span>Kontrak mulai</span><input class="masukan" name="pyMulai" type="date" value="${esc(py.mulai || '')}"></label>
            <label class="medan"><span>Kontrak berakhir</span><input class="masukan" name="pyBerakhir" type="date" value="${esc(py.berakhir || '')}"><small id="sisa-kontrak"></small></label>
            <label class="medan"><span>Nilai kontrak (Rp)</span><input class="masukan" name="pyNilai" type="number" min="0" step="1000000" value="${py.nilai ?? ''}"></label>
          </div>
          <label class="medan" style="margin-top:12px"><span>Catatan kontrak</span><textarea class="masukan" name="pyCatatan" rows="2" maxlength="600" placeholder="mis. Penyewa berminat memperpanjang, tanyakan 2 bulan sebelum berakhir.">${esc(py.catatan || '')}</textarea></label>
          <label class="medan" style="margin-top:12px"><span>Catatan internal</span><textarea class="masukan" name="catatanInternal" rows="3" maxlength="2000" placeholder="Hasil survei, kondisi bangunan, komisi yang disepakati, dan lain-lain.">${esc(sunting.internal.catatan || '')}</textarea></label>
          <p class="bantu" style="margin:10px 0 0">Kontrak yang berakhir dalam 60 hari muncul di saringan "Kontrak segera berakhir" supaya penyewa bisa ditawari perpanjangan.</p>
        </fieldset>

        <fieldset class="langkah"><h2>Penayangan</h2>
          <label style="display:flex;gap:8px"><input type="checkbox" name="terbit" ${sunting.terbit !== false ? 'checked' : ''}> Tayangkan di situs</label>
          <label style="display:flex;gap:8px;margin-top:8px"><input type="checkbox" name="unggulan" ${sunting.unggulan ? 'checked' : ''}> Jadikan unggulan (tampil paling atas)</label>
        </fieldset>

        <div class="simpan-lekat">
          <div class="pesan" id="pesan-sunting" role="status"></div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="tombol" type="submit" style="flex:1">${l ? 'Simpan perubahan' : 'Simpan listing'}</button>
            ${l && saya.peran === 'admin' ? '<button class="tombol tombol--garis" type="button" id="hapus-listing" style="color:var(--merah);border-color:var(--merah)">Hapus</button>' : ''}
          </div>
          ${l ? `<a class="tautan-panah" style="font-size:14px;display:inline-block;margin-top:10px" href="${hrefListing(l)}" target="_blank" rel="noopener">Lihat di situs →</a>` : ''}
        </div>
      </div>
    </form>`;
  tampilkan('layar-sunting');

  const f = $('form-sunting');
  const isiKab = () => {
    const pilih = f.kabupaten.value || lk.kabupaten;
    f.kabupaten.innerHTML = opsi(WILAYAH[f.provinsi.value], WILAYAH[f.provinsi.value].includes(pilih) ? pilih : WILAYAH[f.provinsi.value][0], namaKab);
  };
  isiKab();
  f.provinsi.addEventListener('change', () => { isiKab(); if (petaSunting && sunting.lokasi?.lat == null) petaSunting.setView(PUSAT[f.provinsi.value], 10); });
  f.harga.addEventListener('input', () => { $('harga-baca').textContent = f.harga.value ? rupiahPenuh(Number(f.harga.value)) : 'Kosongkan bila harga tidak dipublikasikan'; });
  f.jenis.addEventListener('change', () => { if (f.jenis.value === 'jual') f.periode.value = ''; else if (!f.periode.value) f.periode.value = 'tahun'; });
  $('kembali').onclick = () => { tampilkan('layar-panel'); muatListing(); };

  gambarFoto(); gambarVideo(); gambarFitur(); gambarMentah();
  $('pilih-mentah').addEventListener('change', e => unggahMentah([...e.target.files]).finally(() => { e.target.value = ''; }));
  const sisa = () => { const v = f.pyBerakhir.value; $('sisa-kontrak').textContent = v ? (hariKe(v) < 0 ? 'Sudah lewat ' + -hariKe(v) + ' hari' : hariKe(v) + ' hari lagi') : ''; };
  f.pyBerakhir.addEventListener('input', sisa); sisa();
  f.jenis.addEventListener('change', () => { $('judul-penyewa').textContent = f.jenis.value === 'jual' ? 'Pembeli' : 'Penyewa saat ini'; });
  $('tambah-fitur').onclick = () => { simpanFiturDariForm(); sunting.fitur.push({ judul: '', isi: '' }); gambarFitur(); };
  $('pilih-foto').addEventListener('change', e => unggahFoto([...e.target.files]).finally(() => { e.target.value = ''; }));
  $('pilih-video').addEventListener('change', e => unggahVideo(e.target.files[0]).finally(() => { e.target.value = ''; }));
  $('tambah-tautan-video').onclick = () => {
    const u = $('tautan-video').value.trim();
    if (!/^https:\/\/(www\.)?(youtube\.com|youtu\.be|instagram\.com|tiktok\.com|vt\.tiktok\.com)\//.test(u)) return tampilPesan($('pesan-sunting'), 'galat', 'Tautan harus dari YouTube, Instagram, atau TikTok (diawali https://).');
    sunting.video.push({ url: u }); $('tautan-video').value = ''; gambarVideo();
  };
  pasangPetaSunting(f);
  f.addEventListener('submit', e => { e.preventDefault(); simpan(f, l); });
  $('hapus-listing')?.addEventListener('click', () => hapus(l));
}

function pasangPetaSunting(f) {
  if (!window.L) { $('peta-sunting').innerHTML = '<div class="kosong">Peta gagal dimuat.</div>'; return; }
  if (petaSunting) { petaSunting.remove(); petaSunting = null; }
  const lk = sunting.lokasi || {};
  const pusat = lk.lat != null ? [lk.lat, lk.lng] : PUSAT[f.provinsi.value];
  petaSunting = L.map('peta-sunting').setView(pusat, lk.lat != null ? 15 : 10);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(petaSunting);
  const pasang = (lat, lng) => {
    sunting.lokasi = Object.assign({}, sunting.lokasi, { lat: +lat.toFixed(6), lng: +lng.toFixed(6) });
    if (penandaSunting) penandaSunting.setLatLng([lat, lng]);
    else penandaSunting = L.marker([lat, lng], { draggable: true }).addTo(petaSunting).on('dragend', e => { const p = e.target.getLatLng(); pasang(p.lat, p.lng); });
    $('koordinat').textContent = lat.toFixed(5) + ', ' + lng.toFixed(5);
  };
  penandaSunting = null;
  if (lk.lat != null) pasang(lk.lat, lk.lng);
  petaSunting.on('click', e => pasang(e.latlng.lat, e.latlng.lng));
  setTimeout(() => petaSunting.invalidateSize(), 80);
}

function gambarFoto() {
  $('galeri-sunting').innerHTML = sunting.foto.map((u, i) => `
    <figure>
      <img src="${esc(fotoKecil(u, 320))}" alt="Foto ${i + 1}">
      ${i === 0 ? '<span class="sampul">Sampul</span>' : ''}
      <div class="foto-aksi">
        <button type="button" data-geser="${i}" data-arah="-1" ${i === 0 ? 'disabled' : ''} aria-label="Geser ke kiri">‹</button>
        <button type="button" data-geser="${i}" data-arah="1" ${i === sunting.foto.length - 1 ? 'disabled' : ''} aria-label="Geser ke kanan">›</button>
        <button type="button" data-buang-foto="${i}" aria-label="Buang foto">×</button>
      </div>
    </figure>`).join('') || '<p class="bantu" style="margin:0">Belum ada foto.</p>';
  $('galeri-sunting').onclick = e => {
    const g = e.target.closest('[data-geser]'), b = e.target.closest('[data-buang-foto]');
    if (g) { const i = +g.dataset.geser, j = i + +g.dataset.arah; [sunting.foto[i], sunting.foto[j]] = [sunting.foto[j], sunting.foto[i]]; gambarFoto(); }
    if (b) { sunting.foto.splice(+b.dataset.buangFoto, 1); gambarFoto(); }
  };
}

function gambarVideo() {
  $('daftar-video').innerHTML = sunting.video.map((v, i) => `
    <div class="baris-video"><span>${esc(v.url.replace(/^https:\/\//, '').slice(0, 64))}</span>
      <button class="tombol tombol--garis tombol--kecil" type="button" data-buang-video="${i}">Buang</button></div>`).join('') || '<p class="bantu" style="margin:0">Belum ada video.</p>';
  $('daftar-video').onclick = e => { const b = e.target.closest('[data-buang-video]'); if (b) { sunting.video.splice(+b.dataset.buangVideo, 1); gambarVideo(); } };
}

function gambarFitur() {
  $('daftar-fitur').innerHTML = sunting.fitur.map((x, i) => `
    <div class="baris-fitur">
      <input class="masukan" data-fitur-judul="${i}" placeholder="Judul, mis. Harga sewa" value="${esc(x.judul)}" maxlength="60">
      <textarea class="masukan" data-fitur-isi="${i}" rows="2" placeholder="Isi" maxlength="400">${esc(x.isi)}</textarea>
      <button class="tombol tombol--garis tombol--kecil" type="button" data-buang-fitur="${i}">Buang</button>
    </div>`).join('');
  $('daftar-fitur').onclick = e => { const b = e.target.closest('[data-buang-fitur]'); if (b) { simpanFiturDariForm(); sunting.fitur.splice(+b.dataset.buangFitur, 1); gambarFitur(); } };
}
function simpanFiturDariForm() {
  sunting.fitur = sunting.fitur.map((_, i) => ({
    judul: document.querySelector(`[data-fitur-judul="${i}"]`)?.value || '',
    isi: document.querySelector(`[data-fitur-isi="${i}"]`)?.value || '',
  }));
}

function gambarMentah() {
  const m = sunting.internal.mentah;
  $('daftar-mentah').innerHTML = m.map((x, i) => `
    <div class="baris-mentah${x.diolah ? ' baris-mentah--diolah' : ''}">
      ${x.jenis === 'foto' ? `<a href="${esc(x.url)}" target="_blank" rel="noopener"><img src="${esc(x.url)}" alt="" loading="lazy"></a>` : `<a class="mentah-video" href="${esc(x.url)}" target="_blank" rel="noopener">Video</a>`}
      <span><b>${esc(x.nama || (x.jenis === 'foto' ? 'Foto' : 'Video'))}</b><br><small>${esc(String(x.waktu || '').slice(0, 10))}${x.oleh ? ' · ' + esc(String(x.oleh).split('@')[0]) : ''}</small></span>
      <span class="mentah-aksi">
        <label><input type="checkbox" data-diolah="${i}" ${x.diolah ? 'checked' : ''}> Sudah diolah</label>
        ${x.jenis === 'foto' ? `<button class="tombol tombol--garis tombol--kecil" type="button" data-tayangkan="${i}" ${sunting.foto.includes(x.url) ? 'disabled' : ''}>${sunting.foto.includes(x.url) ? 'Sudah di galeri' : 'Tambahkan ke galeri'}</button>`
          : `<button class="tombol tombol--garis tombol--kecil" type="button" data-tayangkan="${i}" ${sunting.video.some(v => v.url === x.url) ? 'disabled' : ''}>${sunting.video.some(v => v.url === x.url) ? 'Sudah tayang' : 'Tayangkan video'}</button>`}
        <button class="tombol tombol--garis tombol--kecil" type="button" data-buang-mentah="${i}" aria-label="Keluarkan dari daftar">×</button>
      </span>
    </div>`).join('') || '<p class="bantu" style="margin:0">Belum ada bahan mentah.</p>';
  $('daftar-mentah').onclick = e => {
    const d = e.target.closest('[data-diolah]'), t = e.target.closest('[data-tayangkan]'), b = e.target.closest('[data-buang-mentah]');
    if (d) { m[+d.dataset.diolah].diolah = d.checked; gambarMentah(); }
    if (t) { const x = m[+t.dataset.tayangkan]; if (x.jenis === 'foto') { sunting.foto.push(x.url); gambarFoto(); } else { sunting.video.push({ url: x.url }); gambarVideo(); } gambarMentah(); }
    if (b && confirm('Keluarkan bahan ini dari daftar? Berkasnya tetap tersimpan.')) { m.splice(+b.dataset.buangMentah, 1); gambarMentah(); }
  };
}

async function unggahMentah(berkas) {
  const pesan = $('pesan-sunting');
  for (let i = 0; i < berkas.length; i++) {
    const b = berkas[i], video = /^video\//.test(b.type);
    if (b.size > (video ? 300 : 15) * 1048576) { tampilPesan(pesan, 'galat', b.name + ' melebihi batas ' + (video ? '300' : '15') + ' MB.'); continue; }
    try {
      const r = await kirimBerkas(b, b.name, p => tampilKemajuan('kemajuan-mentah', p, `Mengunggah ${i + 1} dari ${berkas.length}: ${Math.round(p * 100)}%`));
      sunting.internal.mentah.push({ url: r.url, jenis: r.jenis, nama: b.name, diolah: false, waktu: new Date().toISOString().slice(0, 19), oleh: saya.email });
      gambarMentah();
    } catch (err) { tampilPesan(pesan, 'galat', err.message); }
  }
  tampilKemajuan('kemajuan-mentah', null);
  tampilPesan(pesan, 'ok', 'Bahan mentah terunggah. Tekan simpan supaya tercatat.');
}

// ---------- unggahan
async function kirimBerkas(berkas, nama, kemajuan) {
  const t = await tokenSaatIni();
  return new Promise((ok, gagal) => {
    const fd = new FormData();
    fd.append('berkas', berkas, nama);
    const x = new XMLHttpRequest();
    x.open('POST', API + '/api/pengurus/media');
    x.setRequestHeader('Authorization', 'Bearer ' + t);
    x.upload.onprogress = e => { if (e.lengthComputable && kemajuan) kemajuan(e.loaded / e.total); };
    x.onload = () => {
      let d = {};
      try { d = JSON.parse(x.responseText); } catch (_) {}
      if (x.status === 401) { keluar(); return gagal(new Error('Sesi berakhir.')); }
      x.status === 200 ? ok(d) : gagal(new Error(d.galat || 'Unggahan gagal (' + x.status + ').'));
    };
    x.onerror = () => gagal(new Error('Koneksi terputus saat mengunggah.'));
    x.send(fd);
  });
}

async function perkecilFoto(berkas) {
  // gambar ulang lewat kanvas: ukurannya turun DAN metadata EXIF (termasuk GPS) ikut terbuang
  let gambar;
  try { gambar = await createImageBitmap(berkas, { imageOrientation: 'from-image' }); }
  catch (_) { throw new Error(berkas.name + ': format foto tidak terbaca. Simpan ulang sebagai JPG lalu coba lagi.'); }
  const sisiMaks = 1800, skala = Math.min(1, sisiMaks / Math.max(gambar.width, gambar.height));
  const k = document.createElement('canvas');
  k.width = Math.round(gambar.width * skala); k.height = Math.round(gambar.height * skala);
  k.getContext('2d').drawImage(gambar, 0, 0, k.width, k.height);
  return new Promise(ok => k.toBlob(ok, 'image/jpeg', 0.84));
}

function tampilKemajuan(id, nilai, teks) {
  const el = $(id);
  el.hidden = nilai == null;
  if (nilai != null) { el.firstElementChild.style.width = Math.round(nilai * 100) + '%'; el.dataset.teks = teks || ''; }
}

async function unggahFoto(berkas) {
  const pesan = $('pesan-sunting');
  for (let i = 0; i < berkas.length; i++) {
    const b = berkas[i];
    try {
      tampilKemajuan('kemajuan-foto', 0, `Memperkecil foto ${i + 1} dari ${berkas.length}…`);
      const kecil = await perkecilFoto(b);
      const r = await kirimBerkas(kecil, 'foto.jpg', p => tampilKemajuan('kemajuan-foto', p, `Mengunggah foto ${i + 1} dari ${berkas.length}…`));
      sunting.foto.push(r.url); gambarFoto();
    } catch (err) { tampilPesan(pesan, 'galat', err.message); }
  }
  tampilKemajuan('kemajuan-foto', null);
}

async function unggahVideo(b) {
  if (!b) return;
  const pesan = $('pesan-sunting');
  if (b.size > 300 * 1024 * 1024) return tampilPesan(pesan, 'galat', 'Video ' + Math.round(b.size / 1048576) + ' MB melebihi batas 300 MB. Kompres dulu di ponsel atau unggah ke YouTube lalu tempel tautannya.');
  try {
    const r = await kirimBerkas(b, b.name, p => tampilKemajuan('kemajuan-video', p, 'Mengunggah video ' + Math.round(p * 100) + '%…'));
    sunting.video.push({ url: r.url }); gambarVideo();
    tampilPesan(pesan, 'ok', 'Video terunggah. Jangan lupa simpan listing.');
  } catch (err) { tampilPesan(pesan, 'galat', err.message); }
  tampilKemajuan('kemajuan-video', null);
}

// ---------- simpan & hapus
async function simpan(f, lama) {
  simpanFiturDariForm();
  const angka = n => f[n].value === '' ? null : Number(f[n].value);
  const centang = n => [...f.querySelectorAll(`[name=${n}]:checked`)].map(x => x.value);
  const data = {
    jenis: f.jenis.value, tipe: f.tipe.value, status: f.status.value, judul: f.judul.value.trim(),
    harga: angka('harga'), periode: f.periode.value || null, hargaMulai: f.hargaMulai.checked, hargaTeks: f.hargaTeks.value.trim(),
    lokasi: { provinsi: f.provinsi.value, kabupaten: f.kabupaten.value, area: f.area.value.trim(), alamat: f.alamat.value.trim(),
      lat: sunting.lokasi?.lat, lng: sunting.lokasi?.lng, presisi: f.presisi.checked ? 'titik' : 'area' },
    spesifikasi: {
      luasTanah: angka('luasTanah'), luasBangunan: angka('luasBangunan'), dimensi: f.dimensi.value.trim(), lantai: angka('lantai'),
      kamarTidur: angka('kamarTidur'), kamarMandi: angka('kamarMandi'), listrikWatt: angka('listrikWatt'),
      air: centang('air'), legalitas: centang('legalitas'), parkir: f.parkir.checked, jalanUtama: f.jalanUtama.checked, furnitur: f.furnitur.checked,
    },
    fitur: sunting.fitur.filter(x => x.judul.trim() && x.isi.trim()),
    deskripsi: f.deskripsi.value.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean),
    foto: sunting.foto, video: sunting.video, terbit: f.terbit.checked, unggulan: f.unggulan.checked,
    internal: {
      pemilik: { nama: f.pmNama.value.trim(), telepon: f.pmTelepon.value.trim(), email: f.pmEmail.value.trim(), alamat: f.pmAlamat.value.trim() },
      penyewa: { nama: f.pyNama.value.trim(), telepon: f.pyTelepon.value.trim(), mulai: f.pyMulai.value, berakhir: f.pyBerakhir.value,
        nilai: f.pyNilai.value === '' ? null : Number(f.pyNilai.value), catatan: f.pyCatatan.value.trim() },
      catatan: f.catatanInternal.value.trim(),
      mentah: sunting.internal.mentah,
    },
  };
  const pesan = $('pesan-sunting'), tombol = f.querySelector('[type=submit]');
  tombol.disabled = true;
  try {
    const r = lama
      ? await panggil('/api/pengurus/listing/' + encodeURIComponent(lama.kode), { method: 'PUT', json: data })
      : await panggil('/api/pengurus/listing', { method: 'POST', json: data });
    tampilPesan(pesan, 'ok', (lama ? 'Perubahan tersimpan' : 'Listing tersimpan dengan kode ' + r.listing.kode) + '.');
    await muatListing();
    if (!lama) bukaSunting(semuaListing.find(x => x.kode === r.listing.kode));
  } catch (err) { tampilPesan(pesan, 'galat', err.message); }
  finally { tombol.disabled = false; }
}

async function hapus(l) {
  if (!confirm(`Hapus ${l.kode} beserta semua foto dan video unggahannya? Tindakan ini tidak bisa dibatalkan.\n\nKalau properti sudah tersewa atau terjual, lebih baik ubah statusnya saja.`)) return;
  try { await panggil('/api/pengurus/listing/' + encodeURIComponent(l.kode), { method: 'DELETE' }); tampilkan('layar-panel'); await muatListing(); }
  catch (err) { tampilPesan($('pesan-sunting'), 'galat', err.message); }
}

// ---------------------------------------------------------------- jadwal tamu
async function muatJadwal() {
  try { semuaJadwal = (await panggil('/api/pengurus/booking')).booking; gambarJadwal(); }
  catch (err) { $('daftar-jadwal').innerHTML = `<div class="kosong">${esc(err.message)}</div>`; }
}
function gambarJadwal() {
  const hariIni = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const baru = semuaJadwal.filter(b => b.status === 'baru' && b.tanggal >= hariIni).length;
  $('lencana-jadwal').hidden = !baru; $('lencana-jadwal').textContent = baru;
  let daftar = saringJadwal === 'mendatang'
    ? semuaJadwal.filter(b => b.tanggal >= hariIni && b.status !== 'batal').sort((a, b) => (a.tanggal + a.jam).localeCompare(b.tanggal + b.jam))
    : semuaJadwal;
  if (!daftar.length) { $('daftar-jadwal').innerHTML = '<div class="kosong">Belum ada jadwal tamu' + (saringJadwal === 'mendatang' ? ' yang akan datang' : '') + '.</div>'; return; }
  $('daftar-jadwal').innerHTML = daftar.map(b => {
    const tgl = new Date(b.tanggal + 'T00:00:00Z').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    const wa = 'https://wa.me/' + b.telepon.replace(/^0/, '62').replace(/^\+/, '') + '?text=' + encodeURIComponent(`Halo ${b.nama}, kami dari Sewain mengonfirmasi ${JENIS_JADWAL[b.jenis].toLowerCase()}${b.kode ? ' ' + b.kode : ''} pada ${tgl} pukul ${b.jam} WITA.`);
    return `<article class="kartu-jadwal status-${esc(b.status)}">
      <div class="kartu-jadwal-waktu"><span class="angka">${esc(b.jam)}</span><small>${esc(tgl)}</small></div>
      <div>
        <b>${esc(b.nama)}</b> · ${esc(JENIS_JADWAL[b.jenis])}${b.kode ? ` · <a href="${AKAR}listing/?kode=${encodeURIComponent(b.kode)}" target="_blank" rel="noopener">${esc(b.kode)}</a>` : ''} · ${esc(CARA[b.cara] || '')}
        <div style="font-size:14px;color:var(--lumut);margin-top:4px">${esc(b.telepon)}${b.email ? ' · ' + esc(b.email) : ''}</div>
        ${b.pesan ? `<p style="margin:8px 0 0;font-size:14px">${esc(b.pesan)}</p>` : ''}
      </div>
      <div class="kartu-jadwal-aksi">
        <select class="masukan" data-status-jadwal="${esc(b.id)}" aria-label="Status jadwal">${opsi(Object.keys(STATUS_JADWAL), b.status, v => STATUS_JADWAL[v])}</select>
        <a class="tombol tombol--wa tombol--kecil" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>
      </div>
    </article>`;
  }).join('');
}
$('daftar-jadwal').addEventListener('change', async e => {
  const s = e.target.closest('[data-status-jadwal]');
  if (!s) return;
  try { await panggil('/api/pengurus/booking/' + s.dataset.statusJadwal, { method: 'PATCH', json: { status: s.value } }); await muatJadwal(); }
  catch (err) { alert(err.message); }
});
document.querySelectorAll('[data-saring-jadwal]').forEach(b => b.addEventListener('click', () => {
  saringJadwal = b.dataset.saringJadwal;
  document.querySelectorAll('[data-saring-jadwal]').forEach(x => x.setAttribute('aria-pressed', x === b));
  gambarJadwal();
}));

// ---------------------------------------------------------------- akun pengurus
async function muatAkun() {
  try {
    const r = await panggil('/api/pengurus/akun');
    $('daftar-akun').innerHTML = r.akun.map(a => `<div class="baris-video"><span><b>${esc(a.nama)}</b> · ${esc(a.email)} · ${esc(a.peran)} · <small>${a.pakaiSandi ? 'sandi atau Google' : 'Google'}</small></span>
      ${a.email !== saya.email ? `<button class="tombol tombol--garis tombol--kecil" type="button" data-hapus-akun="${esc(a.email)}">Hapus</button>` : '<small>Anda</small>'}</div>`).join('');
  } catch (err) { $('daftar-akun').textContent = err.message; }
}
$('daftar-akun').addEventListener('click', async e => {
  const b = e.target.closest('[data-hapus-akun]');
  if (!b || !confirm('Hapus akun ' + b.dataset.hapusAkun + '?')) return;
  try { await panggil('/api/pengurus/akun/' + encodeURIComponent(b.dataset.hapusAkun), { method: 'DELETE' }); muatAkun(); } catch (err) { alert(err.message); }
});
$('form-akun').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, pesan = f.querySelector('.pesan');
  try {
    await panggil('/api/pengurus/akun', { method: 'POST', json: { nama: f.nama.value, email: f.email.value, sandi: f.sandi.value, peran: f.peran.value } });
    tampilPesan(pesan, 'ok', f.sandi.value ? 'Akun dibuat. Berikan email dan sandi awal kepada anggota itu; ia wajib menggantinya saat pertama masuk.' : 'Akun dibuat. Anggota itu sekarang bisa masuk dengan tombol "Masuk dengan Google" memakai email tersebut.');
    f.reset(); muatAkun();
  } catch (err) { tampilPesan(pesan, 'galat', err.message); }
});

async function muatPelanggan() {
  const el = $('daftar-pelanggan');
  if (!el) return;
  try {
    const { pelanggan } = await panggil('/api/pengurus/pelanggan');
    el.innerHTML = pelanggan.length ? `<div class="tabel-wadah"><table class="tabel"><thead><tr><th>Nama</th><th>Email</th><th>WhatsApp</th><th>Favorit</th><th>Daftar</th></tr></thead><tbody>${pelanggan.map(p => `<tr>
      <td>${esc(p.nama || '—')}</td><td>${esc(p.email || '—')}</td><td>${p.telepon ? `<a href="${waTautan(p.telepon)}" target="_blank" rel="noopener">${esc(p.telepon)}</a>` : '—'}</td>
      <td>${p.favorit}</td><td><small>${esc(String(p.dibuat).slice(0, 10))} · ${esc(p.penyedia === 'google.com' ? 'Google' : 'Email')}</small></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="bantu" style="margin:0">Belum ada pengunjung yang membuat akun.</p>';
  } catch (err) { el.textContent = err.message; }
}

// ---------------------------------------------------------------- awal
(async () => {
  if (modeGoogle) {
    await akunFb.muatAuth();
    if (!akunFb.pengguna()) { modeGoogle = false; try { localStorage.removeItem('sewain.pengurus.google'); } catch (_) {} return tampilkan('layar-masuk'); }
  } else if (!token) return tampilkan('layar-masuk');
  try { await mulai((await panggil('/api/pengurus/saya')).pengurus); }
  catch (_) { tampilkan('layar-masuk'); }
})();
