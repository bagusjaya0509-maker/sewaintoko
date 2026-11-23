import { esc, AKAR, tampilPesan, rupiahPenuh } from './inti.js';
import * as akun from './akun.js?v=20261123a';

const isi = document.getElementById('isi');
const WILAYAH = {
  'Bali': ['Kota Denpasar', 'Kabupaten Badung', 'Kabupaten Gianyar', 'Kabupaten Tabanan', 'Kabupaten Klungkung', 'Kabupaten Bangli', 'Kabupaten Karangasem', 'Kabupaten Buleleng', 'Kabupaten Jembrana'],
  'Nusa Tenggara Barat': ['Kota Mataram', 'Kabupaten Lombok Barat', 'Kabupaten Lombok Tengah', 'Kabupaten Lombok Timur', 'Kabupaten Lombok Utara', 'Kabupaten Sumbawa Barat', 'Kabupaten Sumbawa', 'Kabupaten Dompu', 'Kabupaten Bima', 'Kota Bima'],
};
const TIPE = [['toko', 'Toko'], ['ruko', 'Ruko'], ['rumah', 'Rumah'], ['kontrakan', 'Kontrakan'], ['gudang', 'Gudang'], ['tanah', 'Tanah'], ['villa', 'Villa'], ['kantor', 'Kantor']];
const MAKS_FOTO = 15;

function ajakMasuk() {
  isi.innerHTML = `
  <div class="kotak" style="max-width:640px">
    <h2>Masuk dulu untuk menitip</h2>
    <p style="margin:0 0 18px;color:var(--lumut)">Akun dipakai supaya Anda bisa memantau status titipan dan agen tahu siapa pemiliknya. Daftar cukup dengan akun Google.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <a class="tombol" href="${AKAR}akun/?lanjut=${encodeURIComponent(location.pathname)}">Masuk atau buat akun</a>
      <a class="tombol tombol--garis" href="${AKAR}konsultasi/?jenis=titip">Jadwalkan pertemuan saja</a>
    </div>
  </div>`;
}

let foto = [];   // { url, pratinjau }
let video = [];  // { url, nama }

function formulir(u, p) {
  isi.innerHTML = `
  <form id="form-titip" class="sunting-susun" novalidate>
    <div class="sunting-kolom">
      <fieldset class="langkah">
        <legend class="sr">Jenis properti</legend>
        <h2><span>01</span> Properti</h2>
        <div class="baris-medan">
          <label class="medan"><span>Ditawarkan untuk</span><select class="masukan" name="jenis" required><option value="sewa">Disewakan</option><option value="jual">Dijual</option></select></label>
          <label class="medan"><span>Tipe</span><select class="masukan" name="tipe" required>${TIPE.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
        </div>
        <label class="medan" style="margin-top:14px"><span>Judul singkat (opsional)</span><input class="masukan" name="judul" maxlength="120" placeholder="Contoh: Ruko 2 lantai di Jalan Gatot Subroto Barat"></label>
        <div class="baris-medan" style="margin-top:14px">
          <label class="medan"><span>Harga (Rp)</span><input class="masukan" name="harga" inputmode="numeric" placeholder="mis. 85.000.000"><small id="harga-baca">Kosongkan bila ingin dibicarakan dulu</small></label>
          <label class="medan" id="medan-periode"><span>Per</span><select class="masukan" name="periode"><option value="tahun">tahun</option><option value="bulan">bulan</option></select></label>
        </div>
      </fieldset>

      <fieldset class="langkah">
        <h2><span>02</span> Lokasi</h2>
        <div class="baris-medan">
          <label class="medan"><span>Provinsi</span><select class="masukan" name="provinsi">${Object.keys(WILAYAH).map(p => `<option>${p}</option>`).join('')}</select></label>
          <label class="medan"><span>Kabupaten / kota</span><select class="masukan" name="kabupaten" id="titip-kab"></select></label>
        </div>
        <label class="medan" style="margin-top:14px"><span>Desa / kelurahan atau kawasan</span><input class="masukan" name="area" maxlength="80" placeholder="Contoh: Padang Sambian"></label>
        <label class="medan" style="margin-top:14px"><span>Alamat lengkap</span><textarea class="masukan" name="alamat" maxlength="200" placeholder="Hanya untuk agen. Tidak ditampilkan di situs."></textarea></label>
      </fieldset>

      <fieldset class="langkah">
        <h2><span>03</span> Ukuran &amp; fasilitas</h2>
        <div class="baris-medan">
          <label class="medan"><span>Luas tanah (m²)</span><input class="masukan" name="luasTanah" type="number" min="0" inputmode="numeric"></label>
          <label class="medan"><span>Luas bangunan (m²)</span><input class="masukan" name="luasBangunan" type="number" min="0" inputmode="numeric"></label>
          <label class="medan"><span>Jumlah lantai</span><input class="masukan" name="lantai" type="number" min="0" max="20"></label>
          <label class="medan"><span>Kamar tidur</span><input class="masukan" name="kamarTidur" type="number" min="0" max="50"></label>
          <label class="medan"><span>Kamar mandi</span><input class="masukan" name="kamarMandi" type="number" min="0" max="50"></label>
          <label class="medan"><span>Daya listrik (watt)</span><input class="masukan" name="listrikWatt" type="number" min="0" step="100" placeholder="mis. 2200"></label>
        </div>
        <label class="medan" style="margin-top:14px"><span>Deskripsi</span><textarea class="masukan" name="deskripsi" maxlength="4000" style="min-height:140px" placeholder="Kondisi bangunan, akses jalan, parkir, sertifikat, kapan bisa ditempati, dan hal lain yang perlu diketahui calon penyewa atau pembeli."></textarea></label>
      </fieldset>
    </div>

    <div class="sunting-kolom">
      <fieldset class="langkah">
        <h2><span>04</span> Foto &amp; video</h2>
        <label class="unggah-zona" id="zona-foto">
          <b>Pilih foto</b> atau tarik ke sini<br><small class="bantu">Maksimal ${MAKS_FOTO} foto. Foto pertama jadi sampul. Ukuran diperkecil otomatis dan data lokasi GPS di dalam foto dibuang.</small>
          <input type="file" id="pilih-foto" accept="image/jpeg,image/png,image/webp" multiple hidden>
        </label>
        <div class="kemajuan" id="kemajuan-foto" hidden><span></span></div>
        <div class="galeri-sunting" id="galeri-titip" style="margin-top:12px"></div>
        <label class="tombol tombol--garis tombol--kecil" style="margin-top:14px">+ Video (opsional, maks. 150 MB)<input type="file" id="pilih-video" accept="video/mp4,video/quicktime,video/webm" hidden></label>
        <div class="kemajuan" id="kemajuan-video" hidden><span></span></div>
        <div id="daftar-video-titip"></div>
      </fieldset>

      <fieldset class="langkah">
        <h2><span>05</span> Kontak pemilik</h2>
        <label class="medan"><span>Nama pemilik</span><input class="masukan" name="namaPemilik" maxlength="80" value="${esc(p?.nama || u.displayName || '')}" required></label>
        <label class="medan" style="margin-top:14px"><span>Nomor WhatsApp</span><input class="masukan" name="telepon" inputmode="tel" value="${esc(p?.telepon || '')}" placeholder="0812xxxxxxx" required></label>
        <label class="medan" style="margin-top:14px"><span>Catatan untuk agen (opsional)</span><textarea class="masukan" name="catatan" maxlength="600" placeholder="Contoh: kunci dititipkan ke tetangga, bisa survei setiap sore."></textarea></label>
      </fieldset>

      <div class="simpan-lekat">
        <div class="pesan" role="status" id="pesan-titip"></div>
        <button class="tombol tombol--penuh" type="submit">Kirim untuk diperiksa</button>
        <small class="bantu" style="margin:0">Properti belum tayang sampai agen memeriksanya. Statusnya bisa dipantau di <a href="${AKAR}akun/?tab=titip">Akun saya</a>.</small>
      </div>
    </div>
  </form>`;

  const f = document.getElementById('form-titip');
  const isiKab = () => { f.kabupaten.innerHTML = WILAYAH[f.provinsi.value].map(k => `<option>${k}</option>`).join(''); };
  f.provinsi.addEventListener('change', isiKab); isiKab();
  f.jenis.addEventListener('change', () => { document.getElementById('medan-periode').hidden = f.jenis.value === 'jual'; });
  f.harga.addEventListener('input', () => {
    const v = Number(f.harga.value.replace(/[^\d]/g, ''));
    f.harga.value = v ? v.toLocaleString('id-ID') : '';
    document.getElementById('harga-baca').textContent = v ? rupiahPenuh(v) : 'Kosongkan bila ingin dibicarakan dulu';
  });

  const zona = document.getElementById('zona-foto');
  const pilih = document.getElementById('pilih-foto');
  pilih.addEventListener('change', () => { unggahFoto([...pilih.files]); pilih.value = ''; });
  zona.addEventListener('dragover', e => { e.preventDefault(); zona.classList.add('seret'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('seret'));
  zona.addEventListener('drop', e => { e.preventDefault(); zona.classList.remove('seret'); unggahFoto([...e.dataTransfer.files].filter(x => /^image\//.test(x.type))); });
  document.getElementById('pilih-video').addEventListener('change', e => { const b = e.target.files[0]; e.target.value = ''; if (b) unggahVideo(b); });
  document.getElementById('galeri-titip').addEventListener('click', e => {
    const b = e.target.closest('[data-hapus]');
    if (b) { foto.splice(Number(b.dataset.hapus), 1); gambarFoto(); }
  });
  f.addEventListener('submit', kirim);
}

function kemajuan(id, nilai, teks) {
  const el = document.getElementById(id);
  el.hidden = nilai == null;
  if (nilai != null) { el.querySelector('span').style.width = Math.round(nilai * 100) + '%'; el.dataset.teks = teks; }
}

async function perkecil(berkas) {
  let g;
  try { g = await createImageBitmap(berkas, { imageOrientation: 'from-image' }); }
  catch (_) { throw new Error(berkas.name + ': format foto tidak terbaca. Simpan ulang sebagai JPG lalu coba lagi.'); }
  const s = Math.min(1, 1800 / Math.max(g.width, g.height));
  const k = document.createElement('canvas');
  k.width = Math.round(g.width * s); k.height = Math.round(g.height * s);
  k.getContext('2d').drawImage(g, 0, 0, k.width, k.height);
  const blob = await new Promise(ok => k.toBlob(ok, 'image/jpeg', 0.84));
  return new File([blob], berkas.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

async function unggahFoto(berkas) {
  const pesan = document.getElementById('pesan-titip');
  const muat = berkas.slice(0, MAKS_FOTO - foto.length);
  if (!muat.length) { tampilPesan(pesan, 'galat', 'Sudah ' + MAKS_FOTO + ' foto. Hapus salah satu untuk menambah.'); return; }
  for (let i = 0; i < muat.length; i++) {
    try {
      const kecil = await perkecil(muat[i]);
      const r = await akun.unggahBerkas(kecil, v => kemajuan('kemajuan-foto', (i + v) / muat.length, `Mengunggah foto ${i + 1} dari ${muat.length}`));
      foto.push({ url: r.url, pratinjau: URL.createObjectURL(kecil) });
      gambarFoto();
    } catch (e) { tampilPesan(pesan, 'galat', e.message); break; }
  }
  kemajuan('kemajuan-foto', null);
}

async function unggahVideo(b) {
  const pesan = document.getElementById('pesan-titip');
  if (b.size > 150 * 1024 * 1024) { tampilPesan(pesan, 'galat', 'Video maksimal 150 MB. Kompres dulu di ponsel atau kirim lewat WhatsApp.'); return; }
  try {
    const r = await akun.unggahBerkas(b, v => kemajuan('kemajuan-video', v, 'Mengunggah video ' + Math.round(v * 100) + '%'));
    video.push({ url: r.url, nama: b.name });
    document.getElementById('daftar-video-titip').innerHTML = video.map(v => `<div class="baris-video">${esc(v.nama)} <span class="status">Terunggah</span></div>`).join('');
  } catch (e) { tampilPesan(pesan, 'galat', e.message); }
  kemajuan('kemajuan-video', null);
}

function gambarFoto() {
  document.getElementById('galeri-titip').innerHTML = foto.map((x, i) => `
    <figure><img src="${esc(x.pratinjau)}" alt="Foto ${i + 1}">${i === 0 ? '<span class="sampul">Sampul</span>' : ''}
      <div class="foto-aksi"><span></span><button type="button" data-hapus="${i}" aria-label="Hapus foto ${i + 1}">×</button></div></figure>`).join('');
}

async function kirim(e) {
  e.preventDefault();
  const f = e.target, pesan = document.getElementById('pesan-titip');
  const n = name => (f[name].value === '' ? undefined : Number(f[name].value));
  const harga = Number(f.harga.value.replace(/[^\d]/g, '')) || null;
  const deskripsi = f.deskripsi.value.trim();
  if (!foto.length) { tampilPesan(pesan, 'galat', 'Unggah minimal satu foto properti.'); return; }
  if (deskripsi.length < 30) { tampilPesan(pesan, 'galat', 'Tulis deskripsi minimal 30 karakter supaya agen bisa memahami propertinya.'); f.deskripsi.focus(); return; }
  const data = {
    jenis: f.jenis.value, tipe: f.tipe.value, judul: f.judul.value.trim(),
    harga, periode: f.jenis.value === 'jual' ? null : f.periode.value,
    lokasi: { provinsi: f.provinsi.value, kabupaten: f.kabupaten.value, area: f.area.value.trim() },
    spesifikasi: { luasTanah: n('luasTanah'), luasBangunan: n('luasBangunan'), lantai: n('lantai'), kamarTidur: n('kamarTidur'), kamarMandi: n('kamarMandi'), listrikWatt: n('listrikWatt') },
    deskripsi: deskripsi.split(/\n+/),
    foto: foto.map(x => x.url), video: video.map(v => v.url),
    namaPemilik: f.namaPemilik.value.trim(), telepon: f.telepon.value.trim(),
    // Alamat lengkap hanya untuk agen: dikirim sebagai catatan, bukan bagian lokasi yang tayang.
    catatan: [f.alamat.value.trim() && 'Alamat: ' + f.alamat.value.trim(), f.catatan.value.trim()].filter(Boolean).join('\n'),
  };
  const tombol = f.querySelector('[type=submit]');
  tombol.disabled = true; tombol.textContent = 'Mengirim…';
  try {
    const r = await akun.apiAkun('/api/akun/titip', { method: 'POST', json: data });
    isi.innerHTML = `<div class="kotak konfirmasi" style="max-width:640px">
      <span class="plakat">${esc(r.kode)}</span>
      <h2>Titipan Anda sudah kami terima</h2>
      <p style="margin:0 0 18px;color:var(--lumut)">Agen Sewain akan memeriksa data dan foto, lalu menghubungi Anda lewat WhatsApp. Properti tayang setelah pemeriksaan selesai.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="tombol" href="${AKAR}akun/?tab=titip">Lihat status titipan</a><a class="tombol tombol--garis" href="${AKAR}titip/">Titip properti lain</a></div>
    </div>`;
    foto = []; video = [];
    scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) { tampilPesan(pesan, 'galat', err.message); }
  finally { tombol.disabled = false; tombol.textContent = 'Kirim untuk diperiksa'; }
}

akun.pantau((u, p) => { u ? (document.getElementById('form-titip') || formulir(u, p)) : (!akun.pernahMasuk() && ajakMasuk()); });
if (akun.pernahMasuk()) akun.muatAuth().then(() => { if (!akun.pengguna()) ajakMasuk(); });
