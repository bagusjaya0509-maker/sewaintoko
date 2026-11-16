import { api, esc, tampilPesan, tautanWA } from './inti.js';

const form = document.getElementById('form-jadwal');
const kalender = document.getElementById('kalender');
const slotEl = document.getElementById('slot');
const ketSlot = document.getElementById('ket-slot');
const pesan = document.getElementById('pesan');
const JENIS = { konsultasi: 'Konsultasi', survei: 'Survei lokasi', titip: 'Titip properti' };
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// tanggal dihitung dalam WITA supaya pengunjung di zona lain tidak salah hari
const kiniWITA = () => new Date(Date.now() + 8 * 3600e3);
const iso = d => d.toISOString().slice(0, 10);
const hariIni = iso(kiniWITA());
const batasAkhir = iso(new Date(kiniWITA().getTime() + 60 * 864e5));

let bulanTampil = new Date(hariIni.slice(0, 7) + '-01T00:00:00Z');
let tanggalPilih = null, jamPilih = null;

const par = new URLSearchParams(location.search);
if (JENIS[par.get('jenis')]) form.jenis.value = par.get('jenis');
if (par.get('kode')) { form.kode.value = par.get('kode').toUpperCase(); form.jenis.value = 'survei'; }

function aturJenis() {
  document.getElementById('medan-kode').hidden = form.jenis.value !== 'survei';
  document.getElementById('ringkas-jenis').textContent = JENIS[form.jenis.value] + (form.jenis.value === 'survei' && form.kode.value ? ' · ' + form.kode.value.toUpperCase() : '');
  if (form.jenis.value === 'survei' && form.cara.value === 'kantor') form.cara.value = 'lokasi';
}
form.addEventListener('change', e => { if (e.target.name === 'jenis' || e.target.name === 'kode') aturJenis(); });
form.kode.addEventListener('input', aturJenis);
aturJenis();

function gambarKalender() {
  const th = bulanTampil.getUTCFullYear(), bl = bulanTampil.getUTCMonth();
  document.getElementById('nama-bulan').textContent = BULAN[bl] + ' ' + th;
  const awalBulan = new Date(Date.UTC(th, bl, 1));
  const geser = (awalBulan.getUTCDay() + 6) % 7;      // minggu dimulai Senin
  const jumlahHari = new Date(Date.UTC(th, bl + 1, 0)).getUTCDate();
  let html = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(h => `<span class="hari-nama">${h}</span>`).join('');
  for (let i = 0; i < geser; i++) html += '<span></span>';
  for (let t = 1; t <= jumlahHari; t++) {
    const d = new Date(Date.UTC(th, bl, t)), s = iso(d);
    const minggu = d.getUTCDay() === 0;
    const mati = s < hariIni || s > batasAkhir || minggu;
    html += `<button type="button" data-tanggal="${s}" ${mati ? 'disabled' : ''} aria-pressed="${s === tanggalPilih}"
      aria-label="${t} ${BULAN[bl]}${minggu ? ', kantor tutup' : ''}"><b>${t}</b>${s === hariIni ? '<small>hari ini</small>' : minggu ? '<small>tutup</small>' : ''}</button>`;
  }
  kalender.innerHTML = html;
  const awalHariIni = new Date(hariIni.slice(0, 7) + '-01T00:00:00Z');
  document.getElementById('bulan-lalu').disabled = bulanTampil <= awalHariIni;
  document.getElementById('bulan-depan').disabled = iso(new Date(Date.UTC(th, bl + 1, 1))) > batasAkhir;
}
document.getElementById('bulan-lalu').onclick = () => { bulanTampil = new Date(Date.UTC(bulanTampil.getUTCFullYear(), bulanTampil.getUTCMonth() - 1, 1)); gambarKalender(); };
document.getElementById('bulan-depan').onclick = () => { bulanTampil = new Date(Date.UTC(bulanTampil.getUTCFullYear(), bulanTampil.getUTCMonth() + 1, 1)); gambarKalender(); };

kalender.addEventListener('click', async e => {
  const b = e.target.closest('[data-tanggal]');
  if (!b || b.disabled) return;
  tanggalPilih = b.dataset.tanggal; jamPilih = null;
  gambarKalender(); perbaruiRingkas();
  slotEl.innerHTML = ''; ketSlot.textContent = 'Memuat jam yang tersedia…';
  try {
    const j = await api('/api/jadwal?tanggal=' + tanggalPilih);
    if (!j.slot.length) { ketSlot.textContent = j.keterangan || 'Tidak ada jadwal di tanggal ini.'; return; }
    slotEl.innerHTML = j.slot.map(s => `<button type="button" data-jam="${s.jam}" ${s.tersedia ? '' : 'disabled'} aria-pressed="false" aria-label="Jam ${s.jam}${s.tersedia ? '' : ', tidak tersedia'}">${s.jam}</button>`).join('');
    const ada = j.slot.filter(s => s.tersedia).length;
    ketSlot.textContent = ada ? ada + ' jam masih tersedia. Semua jam dalam WITA.' : 'Semua jam di tanggal ini sudah terisi. Pilih tanggal lain.';
  } catch (err) { ketSlot.textContent = err.message; }
});

slotEl.addEventListener('click', e => {
  const b = e.target.closest('[data-jam]');
  if (!b || b.disabled) return;
  jamPilih = b.dataset.jam;
  slotEl.querySelectorAll('[data-jam]').forEach(x => x.setAttribute('aria-pressed', x === b));
  perbaruiRingkas();
});

function labelTanggal(s) {
  return new Date(s + 'T00:00:00Z').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}
function perbaruiRingkas() {
  document.getElementById('ringkas-waktu').textContent = tanggalPilih
    ? labelTanggal(tanggalPilih) + (jamPilih ? ', ' + jamPilih : '') : 'Belum memilih jam';
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (!tanggalPilih || !jamPilih) return tampilPesan(pesan, 'galat', 'Pilih tanggal dan jam dulu di langkah 2.');
  if (form.nama.value.trim().length < 2) { form.nama.focus(); return tampilPesan(pesan, 'galat', 'Isi nama Anda.'); }
  const tombol = form.querySelector('[type=submit]');
  tombol.disabled = true; tombol.textContent = 'Mengirim…';
  try {
    const r = await api('/api/booking', { method: 'POST', json: {
      jenis: form.jenis.value, kode: form.jenis.value === 'survei' ? form.kode.value : '',
      tanggal: tanggalPilih, jam: jamPilih, nama: form.nama.value, telepon: form.telepon.value,
      email: form.email.value, cara: form.cara.value, pesan: form.pesan.value, situs: form.situs.value,
    } });
    const waktu = labelTanggal(r.booking.tanggal) + ', pukul ' + r.booking.jam + ' WITA';
    const teksWA = `Halo Sewain, saya ${form.nama.value.trim()} sudah menjadwalkan ${JENIS[r.booking.jenis].toLowerCase()}${r.booking.kode ? ' untuk ' + r.booking.kode : ''} pada ${waktu} (no. ${r.booking.id}).`;
    form.hidden = true;
    const selesai = document.getElementById('selesai');
    selesai.hidden = false;
    selesai.innerHTML = `<div class="langkah konfirmasi" style="max-width:640px">
      <span class="plakat">No. ${esc(r.booking.id)}</span>
      <h2 style="margin-bottom:8px">Jadwal Anda sudah kami terima</h2>
      <p style="margin:0 0 6px;font-size:18px;font-weight:600">${esc(JENIS[r.booking.jenis])}${r.booking.kode ? ' · ' + esc(r.booking.kode) : ''}</p>
      <p style="margin:0 0 18px;color:var(--lumut)">${esc(waktu)}. Agen kami akan mengonfirmasi lewat WhatsApp ke nomor yang Anda isi.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a class="tombol tombol--wa" target="_blank" rel="noopener" href="${esc(tautanWA(teksWA))}">Kabari agen via WhatsApp</a>
        <a class="tombol tombol--garis" href="../properti/">Lihat properti lain</a>
      </div></div>`;
    selesai.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    tampilPesan(pesan, 'galat', err.message);
    tombol.disabled = false; tombol.textContent = 'Kirim jadwal';
    if (err.status === 409 && tanggalPilih) kalender.querySelector(`[data-tanggal="${tanggalPilih}"]`)?.click();
  }
});

gambarKalender();
