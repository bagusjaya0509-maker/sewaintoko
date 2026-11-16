import { api, ambilListing, kartuListing, esc, fotoKecil, tempat, namaKab, AKAR, tipeLabel } from './inti.js';
import { renderRek } from './rek.js';

// Geometri empat bilah logo, dihitung ulang supaya cukup lebar untuk foto.
// Puncak tiap bilah sejajar kemiringan atap seperti pada logo aslinya.
const BILAH = [
  { kiri: 1, lebar: 15, atas: 35.51, tinggi: 64.49, potong: 'polygon(0 19.1%, 100% 0, 100% 100%, 0 100%)' },
  { kiri: 18, lebar: 15, atas: 21.53, tinggi: 78.47, potong: 'polygon(0 15.7%, 100% 0, 100% 100%, 0 100%)' },
  { kiri: 35, lebar: 15, atas: 7.56, tinggi: 92.44, potong: 'polygon(0 13.3%, 100% 0, 100% 100%, 0 100%)' },
  { kiri: 67.5, lebar: 15, atas: 21.94, tinggi: 78.06, potong: 'polygon(0 0, 100% 15.8%, 100% 100%, 0 100%)' },
];

const ANGGARAN = {
  sewa: [['', 'Berapa saja'], ['25000000', 'Rp25 jt / tahun'], ['50000000', 'Rp50 jt / tahun'], ['100000000', 'Rp100 jt / tahun'], ['200000000', 'Rp200 jt / tahun']],
  jual: [['', 'Berapa saja'], ['500000000', 'Rp500 jt'], ['1000000000', 'Rp1 M'], ['2000000000', 'Rp2 M'], ['5000000000', 'Rp5 M']],
};

const formCari = document.getElementById('form-cari');
const pilihAnggaran = document.getElementById('cari-anggaran');
function isiAnggaran() {
  const jenis = formCari.jenis.value;
  pilihAnggaran.innerHTML = ANGGARAN[jenis].map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
}
formCari.addEventListener('change', e => { if (e.target.name === 'jenis') isiAnggaran(); });
formCari.addEventListener('submit', () => {
  // jangan kirim parameter kosong supaya URL hasil tetap rapi
  for (const el of formCari.elements) if (el.name && !el.value) el.disabled = true;
  setTimeout(() => { for (const el of formCari.elements) el.disabled = false; }, 0);
});
isiAnggaran();

async function muatBeranda() {
  let data;
  try { data = await ambilListing({ urut: 'terbaru' }); }
  catch (e) {
    document.getElementById('grid-terbaru').innerHTML = `<div class="kosong">Daftar properti belum bisa dimuat. ${esc(e.message)}</div>`;
    return;
  }
  const listing = [...data.listing].sort((a, b) => String(b.dibuat).localeCompare(String(a.dibuat)));
  document.getElementById('grid-terbaru').innerHTML = listing.slice(0, 6).map(kartuListing).join('');
  document.getElementById('tautan-semua').textContent = 'Lihat semua ' + data.jumlah + ' properti →';

  const berfoto = listing.filter(l => (l.foto || []).length).slice(0, 4);
  const deretan = document.getElementById('deretan');
  deretan.insertAdjacentHTML('beforeend', berfoto.map((l, i) => {
    const b = BILAH[i];
    return `<a class="deretan-bilah" href="${AKAR}listing/?kode=${encodeURIComponent(l.kode)}"
      style="left:${b.kiri}%;width:${b.lebar}%;top:${b.atas}%;height:${b.tinggi}%;--potong:${b.potong}"
      aria-label="${esc(l.kode)} — ${esc(tipeLabel(l.tipe))} di ${esc(tempat(l))}">
      <img src="${esc(fotoKecil(l.foto[0], 640))}" alt="" ${i === 0 ? '' : 'loading="lazy"'} decoding="async">
      <span class="plakat">${esc(l.kode)}</span></a>`;
  }).join(''));
  document.getElementById('deretan-catatan').textContent =
    'Empat dari ' + data.jumlah + ' properti yang sedang kami tawarkan — ketuk untuk melihat.';
}

async function muatWilayah() {
  const wadah = document.getElementById('pita-wilayah');
  let r;
  try { r = await api('/api/ringkasan'); }
  catch (_) { wadah.parentElement.hidden = true; return; }
  const bali = r.wilayah.filter(w => w.provinsi === 'Bali').sort((a, b) => (b.sewa + b.jual) - (a.sewa + a.jual));
  const ntb = r.wilayah.filter(w => w.provinsi === 'Nusa Tenggara Barat');
  const item = bali.map(w => `
    <a class="wilayah-item" href="${AKAR}properti/?kabupaten=${encodeURIComponent(w.kabupaten)}">
      <span class="angka">${w.sewa + w.jual}</span>
      <span class="nama">${esc(namaKab(w.kabupaten))}</span>
      <span class="rinci">${[w.sewa ? w.sewa + ' disewakan' : '', w.jual ? w.jual + ' dijual' : ''].filter(Boolean).join(' · ')}</span>
    </a>`);
  if (ntb.length) {
    const n = ntb.reduce((s, w) => s + w.sewa + w.jual, 0);
    item.push(`<a class="wilayah-item" href="${AKAR}properti/?provinsi=${encodeURIComponent('Nusa Tenggara Barat')}">
      <span class="angka">${n}</span><span class="nama">Nusa Tenggara Barat</span><span class="rinci">Lombok &amp; Sumbawa</span></a>`);
  } else {
    item.push(`<a class="wilayah-item wilayah-item--segera" href="${AKAR}konsultasi/?jenis=titip">
      <span class="angka">NTB</span><span class="nama">Nusa Tenggara Barat</span><span class="rinci">Penerimaan listing dibuka — titipkan properti Anda</span></a>`);
  }
  wadah.innerHTML = item.join('');
  const ketSewa = document.getElementById('ket-sewa'), ketJual = document.getElementById('ket-jual');
  if (r.sewa) ketSewa.textContent = r.sewa + ' properti siap disewa';
  if (r.jual) ketJual.textContent = r.jual + ' properti dijual';
}

// ---------- rekomendasi singkat di beranda
const formRek = document.getElementById('form-rek');
const hasilRek = document.getElementById('rek-hasil');
formRek.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
  formRek.kebutuhan.value = c.dataset.isi;
  formRek.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', x === c));
  formRek.requestSubmit();
}));
formRek.addEventListener('submit', async e => {
  e.preventDefault();
  const kebutuhan = formRek.kebutuhan.value.trim();
  if (kebutuhan.length < 8) { hasilRek.innerHTML = '<div class="rek-kosong">Tulis sedikit lebih lengkap: jenis usaha, wilayah, dan anggaran.</div>'; formRek.kebutuhan.focus(); return; }
  const tombol = formRek.querySelector('[type=submit]');
  tombol.disabled = true; tombol.textContent = 'Mencocokkan…';
  try {
    const r = await api('/api/rekomendasi', { method: 'POST', json: { kebutuhan } });
    hasilRek.innerHTML = renderRek(r, 3) + (r.hasil.length ? `<a class="tombol tombol--garis tombol--penuh" style="color:var(--krem);border-color:rgba(243,239,228,.4)" href="${AKAR}rekomendasi/?q=${encodeURIComponent(kebutuhan)}">Lihat semua kecocokan &amp; atur kriteria</a>` : '');
  } catch (err) {
    hasilRek.innerHTML = `<div class="rek-kosong">${esc(err.message)}</div>`;
  } finally { tombol.disabled = false; tombol.textContent = 'Carikan properti'; }
});

muatBeranda();
muatWilayah();
