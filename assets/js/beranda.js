import { api, ambilListing, kartuListing, esc, fotoKecil, tempat, namaKab, AKAR, tipeLabel, rupiahRingkas, rupiahPenuh, hrefListing, tandaLogo } from './inti.js';
import { renderRek } from './rek.js';

const ANGGARAN = {
  sewa: [['', 'Berapa saja'], ['25000000', 'Rp25 jt / tahun'], ['50000000', 'Rp50 jt / tahun'], ['100000000', 'Rp100 jt / tahun'], ['200000000', 'Rp200 jt / tahun']],
  jual: [['', 'Berapa saja'], ['500000000', 'Rp500 jt'], ['1000000000', 'Rp1 M'], ['2000000000', 'Rp2 M'], ['5000000000', 'Rp5 M']],
};

// ---------- kartu pencarian
const formCari = document.getElementById('form-cari');
const pilihAnggaran = document.getElementById('cari-anggaran');
function isiAnggaran() {
  pilihAnggaran.innerHTML = ANGGARAN[formCari.jenis.value].map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
}
formCari.addEventListener('change', e => { if (e.target.name === 'jenis') isiAnggaran(); });
formCari.addEventListener('submit', () => {
  // parameter kosong tidak ikut dikirim supaya URL hasil tetap rapi
  for (const el of formCari.elements) if (el.name && !el.value) el.disabled = true;
  setTimeout(() => { for (const el of formCari.elements) el.disabled = false; }, 0);
});
isiAnggaran();

// ---------- properti pilihan + wilayah + layanan + contoh kalkulator
async function muatBeranda() {
  let data;
  try { data = await ambilListing({}); }
  catch (e) {
    document.getElementById('grid-terbaru').innerHTML = `<div class="kosong">Daftar properti belum bisa dimuat. ${esc(e.message)}</div>`;
    return;
  }
  const semua = data.listing;
  // Pilihan agen dulu, lalu yang terbaru - masing-masing hanya yang berfoto.
  const urut = [...semua].sort((a, b) => (b.unggulan - a.unggulan) || String(b.dibuat).localeCompare(String(a.dibuat)));
  const tampil = urut.filter(l => (l.foto || []).length).slice(0, 6);
  document.getElementById('grid-terbaru').innerHTML = tampil.map(kartuListing).join('');
  document.getElementById('tautan-semua').textContent = 'Lihat semua ' + data.jumlah + ' properti →';

  // Plakat di foto pembuka mengikuti listing yang fotonya dipakai.
  const tab = semua.find(l => l.kode === 'TAB-001');
  if (tab) document.getElementById('hero-plakat').href = hrefListing(tab);

  // Ubin wilayah: satu foto nyata dari wilayah itu + jumlah listing.
  const perKab = new Map();
  for (const l of semua) {
    const k = l.lokasi?.kabupaten; if (!k) continue;
    const w = perKab.get(k) || { kab: k, prov: l.lokasi.provinsi, n: 0, sewa: 0, jual: 0, foto: null };
    w.n++; w[l.jenis]++;
    if (!w.foto && (l.foto || [])[0]) w.foto = l.foto[0];
    perKab.set(k, w);
  }
  const wil = [...perKab.values()].sort((a, b) => (!!b.foto - !!a.foto) || b.n - a.n).slice(0, 4);
  const ubin = wil.map(w => `
    <a class="ubin" href="${AKAR}properti/?kabupaten=${encodeURIComponent(w.kab)}">
      ${w.foto ? `<img src="${esc(fotoKecil(w.foto, 640))}" alt="" loading="lazy" decoding="async">` : ''}
      <span class="ubin-teks"><b>${esc(namaKab(w.kab))}</b><small>${[w.sewa ? w.sewa + ' disewakan' : '', w.jual ? w.jual + ' dijual' : ''].filter(Boolean).join(' · ')}</small></span>
    </a>`);
  if (!semua.some(l => l.lokasi?.provinsi === 'Nusa Tenggara Barat') && ubin.length < 5) {
    ubin.push(`<a class="ubin" href="${AKAR}titip/" style="background:var(--hutan-muda)">
      <span class="ubin-teks"><b>Lombok &amp; Sumbawa</b><small>Penerimaan listing NTB dibuka. Titipkan properti Anda.</small></span></a>`);
  }
  document.getElementById('ubin-wilayah').innerHTML = ubin.slice(0, 5).join('');
  if (ubin.length === 5) document.getElementById('ubin-wilayah').style.gridTemplateColumns = 'repeat(5, minmax(0, 1fr))';

  // Harga "mulai" di kartu layanan dihitung dari data, bukan ditulis tangan.
  for (const jenis of ['sewa', 'jual']) {
    const ada = semua.filter(l => l.jenis === jenis && l.harga != null);
    const el = document.querySelector(`[data-layanan="${jenis}"]`);
    if (!ada.length || !el) continue;
    const termurah = Math.min(...ada.map(l => l.harga));
    el.innerHTML = `Mulai ${esc(rupiahRingkas(termurah))}${jenis === 'sewa' ? ' / tahun' : ''}<small>${semua.filter(l => l.jenis === jenis).length} properti ${jenis === 'sewa' ? 'disewakan' : 'dijual'}</small>`;
  }

  // Pilihan contoh di kalkulator = listing dijual yang punya harga.
  const contoh = semua.filter(l => l.jenis === 'jual' && l.harga).slice(0, 12);
  const pilih = document.getElementById('kalk-contoh');
  pilih.insertAdjacentHTML('beforeend', contoh.map(l => `<option value="${l.harga}">${esc(l.kode)} · ${esc(tipeLabel(l.tipe))} ${esc(tempat(l))} · ${esc(rupiahRingkas(l.harga))}</option>`).join(''));
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
    const posisiDariKanan = e.target.value.length - e.target.selectionStart;
    const v = angkaDari(e.target.value);
    e.target.value = v ? v.toLocaleString('id-ID') : '';
    const p = Math.max(e.target.value.length - posisiDariKanan, 0);
    e.target.setSelectionRange(p, p);
  }
  hitung();
});
kalk.contoh.addEventListener('change', () => {
  if (kalk.contoh.value) { kalk.harga.value = Number(kalk.contoh.value).toLocaleString('id-ID'); hitung(); }
});
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
        <figure>${a.gambar ? `<img src="${esc(a.gambar)}" alt="" loading="lazy">` : `<span class="tanpa-gambar">${tandaLogo()}</span>`}</figure>
        <div><time datetime="${esc(a.tanggal)}">${esc(new Date(a.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }))}</time>
        <h3>${esc(a.judul)}</h3><p>${esc(a.ringkas)}</p></div>
      </a>`).join('');
  } catch (_) { wadah.closest('section').hidden = true; }
}

// ---------- rekomendasi singkat
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
muatArtikel();
