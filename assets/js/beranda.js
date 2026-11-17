import { ambilListing, kartuListing, esc, AKAR, tipeLabel, rupiahRingkas, rupiahPenuh, tempat, tandaLogo } from './inti.js';

const ANGGARAN = {
  sewa: [['', 'Berapa saja'], ['25000000', 'Sampai Rp25 jt / tahun'], ['50000000', 'Sampai Rp50 jt / tahun'], ['100000000', 'Sampai Rp100 jt / tahun'], ['200000000', 'Sampai Rp200 jt / tahun']],
  jual: [['', 'Berapa saja'], ['500000000', 'Sampai Rp500 jt'], ['1000000000', 'Sampai Rp1 M'], ['2000000000', 'Sampai Rp2 M'], ['5000000000', 'Sampai Rp5 M']],
};

// ---------- kartu pencarian
const formCari = document.getElementById('form-cari');
const pilihAnggaran = document.getElementById('cari-anggaran');
const isiAnggaran = () => { pilihAnggaran.innerHTML = ANGGARAN[formCari.jenis.value].map(([v, t]) => `<option value="${v}">${t}</option>`).join(''); };
formCari.jenis.addEventListener('change', isiAnggaran);
formCari.addEventListener('submit', () => {
  // parameter kosong tidak ikut dikirim supaya URL hasil tetap rapi
  for (const el of formCari.elements) if (el.name && !el.value) el.disabled = true;
  setTimeout(() => { for (const el of formCari.elements) el.disabled = false; }, 0);
});
isiAnggaran();

// ---------- tombol geser ubin wilayah
document.querySelectorAll('[data-geser-target]').forEach(g => g.addEventListener('click', e => {
  const b = e.target.closest('[data-arah]'); if (!b) return;
  const t = document.getElementById(g.dataset.geserTarget);
  t.scrollBy({ left: Number(b.dataset.arah) * (t.clientWidth * .8), behavior: 'smooth' });
}));

// ---------- data properti
async function muatBeranda() {
  let data;
  try { data = await ambilListing({}); }
  catch (e) {
    document.getElementById('grid-terbaru').innerHTML = `<div class="kosong" style="grid-column:1/-1">Daftar properti belum bisa dimuat. ${esc(e.message)}</div>`;
    return;
  }
  const semua = data.listing;
  const urut = [...semua].sort((a, b) => (b.unggulan - a.unggulan) || String(b.dibuat).localeCompare(String(a.dibuat)));
  document.getElementById('grid-terbaru').innerHTML = urut.filter(l => (l.foto || []).length).slice(0, 6).map(kartuListing).join('');
  document.getElementById('tautan-semua').textContent = 'Lihat semua ' + data.jumlah + ' properti →';

  // jumlah listing di ubin wilayah
  const hitung = (pred) => semua.filter(pred).length;
  document.querySelectorAll('[data-kab]').forEach(el => {
    const n = hitung(l => l.lokasi?.kabupaten === el.dataset.kab);
    el.textContent = n ? n + ' properti' : 'Titipkan properti Anda di sini';
  });
  document.querySelectorAll('[data-prov]').forEach(el => {
    const n = hitung(l => l.lokasi?.provinsi === el.dataset.prov);
    el.textContent = n ? n + ' properti' : 'Penerimaan listing dibuka';
  });

  // harga "mulai" di kartu layanan dihitung dari data
  const mulai = (el, daftar, satuan) => {
    const ada = daftar.filter(l => l.harga != null);
    if (!el || !daftar.length) return;
    el.innerHTML = (ada.length ? `Mulai ${esc(rupiahRingkas(Math.min(...ada.map(l => l.harga))))}${satuan}` : 'Lihat yang tersedia') + `<small>${daftar.length} properti</small>`;
  };
  mulai(document.querySelector('[data-layanan="sewa-usaha"]'), semua.filter(l => l.jenis === 'sewa' && ['toko', 'ruko', 'gudang', 'kantor'].includes(l.tipe)), ' / tahun');
  mulai(document.querySelector('[data-layanan="sewa-hunian"]'), semua.filter(l => l.jenis === 'sewa' && ['rumah', 'kontrakan', 'villa'].includes(l.tipe)), ' / tahun');
  mulai(document.querySelector('[data-layanan="jual"]'), semua.filter(l => l.jenis === 'jual'), '');

  // pilihan di kalkulator = properti dijual yang berharga
  const contoh = semua.filter(l => l.jenis === 'jual' && l.harga).slice(0, 12);
  document.getElementById('kalk-contoh').insertAdjacentHTML('beforeend',
    contoh.map(l => `<option value="${l.harga}">${esc(l.kode)} · ${esc(tipeLabel(l.tipe))} ${esc(tempat(l))} · ${esc(rupiahRingkas(l.harga))}</option>`).join(''));
}

// ---------- kalkulator cicilan (anuitas, bunga tetap)
const kalk = document.getElementById('kalk');
const angkaDari = s => Number(String(s).replace(/[^\d]/g, '')) || 0;
function hitung() {
  const harga = angkaDari(kalk.harga.value);
  const dp = Math.min(Math.max(Number(kalk.dp.value) || 0, 0), 90) / 100;
  const bunga = Math.max(Number(kalk.bunga.value) || 0, 0) / 100 / 12;
  const n = Math.min(Math.max(Math.round(Number(kalk.tenor.value) || 0), 1), 30) * 12;
  const pokok = harga * (1 - dp);
  const cicilan = bunga ? pokok * bunga / (1 - Math.pow(1 + bunga, -n)) : pokok / n;
  const isi = (id, v) => { document.getElementById(id).textContent = harga ? v : '—'; };
  isi('kalk-cicilan', rupiahRingkas(cicilan));
  isi('kalk-dp', rupiahRingkas(harga * dp));
  isi('kalk-bunga', rupiahRingkas(Math.max(cicilan * n - pokok, 0)));
  document.getElementById('kalk-cicilan').title = harga ? rupiahPenuh(cicilan) + ' per bulan' : '';
}
kalk.addEventListener('input', e => {
  if (e.target.name === 'harga') {
    const dariKanan = e.target.value.length - e.target.selectionStart;
    const v = angkaDari(e.target.value);
    e.target.value = v ? v.toLocaleString('id-ID') : '';
    const p = Math.max(e.target.value.length - dariKanan, 0);
    e.target.setSelectionRange(p, p);
  }
  hitung();
});
kalk.contoh.addEventListener('change', () => { if (kalk.contoh.value) { kalk.harga.value = Number(kalk.contoh.value).toLocaleString('id-ID'); hitung(); } });
kalk.addEventListener('submit', e => e.preventDefault());
hitung();

// ---------- artikel terbaru (daftar dibangun alat/bangun-statis.py)
async function muatArtikel() {
  const wadah = document.getElementById('artikel-beranda');
  try {
    const r = await fetch(AKAR + 'artikel/daftar.json', { cache: 'no-cache' });
    const daftar = (await r.json()).artikel.slice(0, 3);
    wadah.innerHTML = daftar.map(a => `
      <a class="kartu-artikel" href="${AKAR}${esc(a.jalur.replace(/^\//, ''))}">
        <figure>${a.gambar ? `<img src="${AKAR}${esc(a.gambar)}" alt="" loading="lazy">` : `<span class="tanpa-gambar">${tandaLogo()}</span>`}</figure>
        <div><time datetime="${esc(a.tanggal)}">${esc(new Date(a.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }))}</time>
        <h3>${esc(a.judul)}</h3><p>${esc(a.ringkas)}</p></div>
      </a>`).join('');
  } catch (_) { wadah.closest('section').hidden = true; }
}

muatBeranda();
muatArtikel();
