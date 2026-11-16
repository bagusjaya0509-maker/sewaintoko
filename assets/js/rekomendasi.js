import { api, esc, namaKab, rupiahRingkas } from './inti.js';
import { renderRek } from './rek.js';

const form = document.getElementById('form-rek');
const hasil = document.getElementById('rek-hasil');
const ringkas = document.getElementById('ringkas-kriteria');

const q = new URLSearchParams(location.search).get('q');
if (q) form.kebutuhan.value = q;

const LABEL_USAHA = { kuliner: 'kuliner', retail: 'toko ritel', jasa: 'usaha jasa', kantor: 'kantor', gudang: 'gudang', hunian: 'tempat tinggal' };

function jelaskan(k) {
  const b = [];
  if (k.jenis) b.push(k.jenis === 'jual' ? 'beli' : 'sewa');
  if (k.tipe) b.push(k.tipe);
  if (k.usaha) b.push('untuk ' + (LABEL_USAHA[k.usaha] || k.usaha));
  if (k.area) b.push('di ' + k.area);
  else if (k.kabupaten) b.push('di ' + namaKab(k.kabupaten));
  else if (k.provinsi) b.push('di ' + k.provinsi);
  if (k.budget) b.push('anggaran ' + rupiahRingkas(k.budget) + (k.periodeBudget === 'bulan' ? '/bulan' : k.jenis !== 'jual' ? '/tahun' : ''));
  if (k.luasMin) b.push('luas ≥ ' + k.luasMin + ' m²');
  if (k.parkir) b.push('ada parkir');
  if (k.jalanUtama) b.push('jalan utama');
  if (k.lantaiMin) b.push('≥ ' + k.lantaiMin + ' lantai');
  return b.length ? 'Yang kami tangkap: ' + b.join(' · ') + '.' : '';
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const f = form.elements;
  const data = { kebutuhan: f.kebutuhan.value.trim() };
  for (const k of ['jenis', 'usaha', 'kabupaten']) if (f[k].value) data[k] = f[k].value;
  if (f.anggaranJuta.value) {
    data.budget = Number(f.anggaranJuta.value) * 1e6;
    if (f.periodeBudget.value) data.periodeBudget = f.periodeBudget.value;
  }
  if (f.luasMin.value) data.luasMin = Number(f.luasMin.value);
  if (f.parkir.checked) data.parkir = true;
  if (f.jalanUtama.checked) data.jalanUtama = true;
  if (f.duaLantai.checked) data.lantaiMin = 2;
  if (Object.keys(data).length === 1 && data.kebutuhan.length < 8) {
    hasil.innerHTML = '<div class="rek-kosong">Tulis kebutuhan Anda atau atur minimal satu kriteria.</div>';
    return;
  }
  const tombol = form.querySelector('[type=submit]');
  tombol.disabled = true; tombol.textContent = 'Mencocokkan…';
  try {
    const r = await api('/api/rekomendasi', { method: 'POST', json: data });
    ringkas.textContent = jelaskan(r.kriteria);
    hasil.innerHTML = renderRek(r, 6);
    if (matchMedia('(max-width: 900px)').matches) hasil.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    hasil.innerHTML = `<div class="rek-kosong">${esc(err.message)}</div>`;
  } finally { tombol.disabled = false; tombol.textContent = 'Carikan properti'; }
});

if (q) form.requestSubmit();
