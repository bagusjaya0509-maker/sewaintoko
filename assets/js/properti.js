import { ambilListing, kartuListing, esc, fotoKecil, labelHarga, rupiahRingkas, tempat, namaKab, AKAR, hrefListing } from './inti.js';

const WILAYAH = {
  'Bali': ['Kota Denpasar', 'Kabupaten Badung', 'Kabupaten Gianyar', 'Kabupaten Tabanan', 'Kabupaten Klungkung', 'Kabupaten Bangli', 'Kabupaten Karangasem', 'Kabupaten Buleleng', 'Kabupaten Jembrana'],
  'Nusa Tenggara Barat': ['Kota Mataram', 'Kabupaten Lombok Barat', 'Kabupaten Lombok Tengah', 'Kabupaten Lombok Timur', 'Kabupaten Lombok Utara', 'Kabupaten Sumbawa Barat', 'Kabupaten Sumbawa', 'Kabupaten Dompu', 'Kabupaten Bima', 'Kota Bima'],
};
const ANGGARAN = {
  sewa: [['', 'Berapa saja'], ['25000000', 'Rp25 jt / tahun'], ['50000000', 'Rp50 jt / tahun'], ['100000000', 'Rp100 jt / tahun'], ['200000000', 'Rp200 jt / tahun'], ['300000000', 'Rp300 jt / tahun']],
  jual: [['', 'Berapa saja'], ['500000000', 'Rp500 jt'], ['1000000000', 'Rp1 M'], ['2000000000', 'Rp2 M'], ['5000000000', 'Rp5 M']],
  '': [['', 'Berapa saja']],
};

const form = document.getElementById('saring');
const pilihKab = document.getElementById('pilih-kabupaten');
const pilihMaks = document.getElementById('pilih-maks');
const grid = document.getElementById('grid');
const jumlahEl = document.getElementById('jumlah');
let tampilan = 'daftar', peta = null, lapisPenanda = null, terakhir = [];

function isiKabupaten() {
  const prov = form.provinsi.value;
  const daftar = prov ? WILAYAH[prov] : [...WILAYAH['Bali'], ...WILAYAH['Nusa Tenggara Barat']];
  const pilih = pilihKab.value;
  pilihKab.innerHTML = '<option value="">Semua</option>' + daftar.map(k => `<option value="${esc(k)}">${esc(namaKab(k))}</option>`).join('');
  if (daftar.includes(pilih)) pilihKab.value = pilih;
}
function isiMaks() {
  const pilih = pilihMaks.value;
  pilihMaks.innerHTML = ANGGARAN[form.jenis.value].map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  pilihMaks.disabled = !form.jenis.value;
  pilihMaks.title = form.jenis.value ? '' : 'Pilih sewa atau jual dulu';
  if ([...pilihMaks.options].some(o => o.value === pilih)) pilihMaks.value = pilih;
}

// isi formulir dari URL supaya tautan hasil saringan bisa dibagikan
const awal = new URLSearchParams(location.search);
for (const [k, v] of awal) if (form.elements[k]) form.elements[k].value = v;
if (awal.get('kabupaten') && !awal.get('provinsi')) {
  for (const [prov, kab] of Object.entries(WILAYAH)) if (kab.includes(awal.get('kabupaten'))) form.provinsi.value = prov;
}
isiKabupaten();
if (awal.get('kabupaten')) pilihKab.value = awal.get('kabupaten');
isiMaks();
if (awal.get('maks')) pilihMaks.value = awal.get('maks');
if (awal.get('tampil') === 'peta') tampilan = 'peta';

function saringanSekarang() {
  const o = {};
  for (const n of ['jenis', 'tipe', 'provinsi', 'kabupaten', 'maks', 'cari', 'urut']) {
    const el = form.elements[n] || document.querySelector(`[name=${n}][form=saring]`);
    if (el && el.value && !el.disabled) o[n] = el.value.trim();
  }
  return o;
}

let jeda;
async function muat() {
  const s = saringanSekarang();
  const q = new URLSearchParams(s);
  if (tampilan === 'peta') q.set('tampil', 'peta');
  history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
  jumlahEl.textContent = 'Memuat properti…';
  try {
    const d = await ambilListing(s);
    terakhir = d.listing;
    jumlahEl.textContent = d.jumlah + ' properti' + (d.dariCadangan ? ' (data tersimpan — server sedang tidak terjangkau)' : '');
    const judul = s.jenis === 'sewa' ? 'Properti disewakan' : s.jenis === 'jual' ? 'Properti dijual' : 'Properti';
    document.getElementById('judul-halaman').textContent = judul + (s.kabupaten ? ' di ' + namaKab(s.kabupaten) : s.provinsi ? ' di ' + s.provinsi : '');
    document.title = document.getElementById('judul-halaman').textContent + ' — Sewain Property Agency';
    grid.innerHTML = d.listing.length ? d.listing.map(kartuListing).join('') : `
      <div class="kosong" style="grid-column:1/-1">
        <p style="margin:0;font-weight:600;color:var(--hutan)">Belum ada properti yang sesuai saringan ini.</p>
        <p style="margin:6px 0 0">Longgarkan saringannya, atau ceritakan kebutuhan Anda — kami carikan di luar daftar.</p>
        <a class="tombol" href="${AKAR}rekomendasi/">Ceritakan kebutuhan</a>
      </div>`;
    if (tampilan === 'peta') gambarPeta();
  } catch (e) {
    jumlahEl.textContent = 'Gagal memuat';
    grid.innerHTML = `<div class="kosong" style="grid-column:1/-1">${esc(e.message)}</div>`;
  }
}

form.addEventListener('input', e => {
  if (e.target.name === 'provinsi') isiKabupaten();
  if (e.target.name === 'jenis') isiMaks();
  clearTimeout(jeda);
  jeda = setTimeout(muat, e.target.name === 'cari' ? 350 : 0);
});
form.addEventListener('submit', e => { e.preventDefault(); muat(); });
// pilihan urutan ada di luar <form> (terhubung lewat atribut form=), jadi
// kejadiannya tidak menggelembung ke form - perlu pendengar sendiri
document.querySelector('[name=urut][form=saring]').addEventListener('input', muat);

// ---------- peta
document.querySelectorAll('[data-tampil]').forEach(b => b.addEventListener('click', () => {
  tampilan = b.dataset.tampil;
  document.querySelectorAll('[data-tampil]').forEach(x => x.setAttribute('aria-pressed', x === b));
  grid.hidden = tampilan === 'peta';
  document.getElementById('peta-wadah').hidden = tampilan !== 'peta';
  if (tampilan === 'peta') gambarPeta();
  muatUrl();
}));
function muatUrl() {
  const q = new URLSearchParams(location.search);
  tampilan === 'peta' ? q.set('tampil', 'peta') : q.delete('tampil');
  history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
}

function gambarPeta() {
  if (!window.L) { document.getElementById('peta').innerHTML = '<div class="kosong">Peta gagal dimuat. Periksa koneksi internet.</div>'; return; }
  if (!peta) {
    peta = L.map('peta', { scrollWheelZoom: false }).setView([-8.65, 115.6], 9);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(peta);
    lapisPenanda = (L.markerClusterGroup ? L.markerClusterGroup({
      maxClusterRadius: 46, showCoverageOnHover: false, spiderfyOnMaxZoom: true,
      iconCreateFunction: g => L.divIcon({ className: '', html: `<span class="gugus-peta">${g.getChildCount()}</span>`, iconSize: [0, 0] }),
    }) : L.layerGroup()).addTo(peta);
  }
  setTimeout(() => peta.invalidateSize(), 50);
  lapisPenanda.clearLayers();
  // listing di area yang sama punya koordinat sama persis; sebar sedikit
  // melingkar supaya semuanya bisa diklik (tetap perkiraan area)
  const hitungArea = {};
  const titik = [];
  for (const l of terakhir) {
    const lk = l.lokasi || {};
    if (lk.lat == null) continue;
    const kunci = lk.lat.toFixed(4) + ',' + lk.lng.toFixed(4);
    const n = hitungArea[kunci] = (hitungArea[kunci] || 0) + 1;
    let lat = lk.lat, lng = lk.lng;
    if (n > 1 && lk.presisi !== 'titik') {
      const sudut = n * 2.4, jarak = 0.0011 * Math.sqrt(n);
      lat += Math.sin(sudut) * jarak; lng += Math.cos(sudut) * jarak;
    }
    const h = labelHarga(l);
    const ikon = L.divIcon({ className: '', html: `<span class="penanda-harga">${esc(h.angka || l.kode)}</span>`, iconSize: [0, 0] });
    const m = L.marker([lat, lng], { icon: ikon, title: l.kode + ' — ' + tempat(l) });
    m.bindPopup(`<div class="popup-listing">
      ${l.foto && l.foto[0] ? `<img src="${esc(fotoKecil(l.foto[0], 480))}" alt="">` : ''}
      <span class="plakat" style="font-size:12px">${esc(l.kode)}</span>
      <p style="margin:8px 0 2px"><a href="${hrefListing(l)}">${esc(l.judul)}</a></p>
      <p style="margin:0;color:var(--lumut);font-size:13px">${esc(tempat(l))} · ${h.angka ? esc((h.mulai ? 'mulai ' : '') + h.angka + ' ' + h.satuan) : 'Harga: hubungi kami'}</p>
    </div>`);
    lapisPenanda.addLayer(m);
    titik.push([lat, lng]);
  }
  if (titik.length) peta.fitBounds(titik, { padding: [40, 40], maxZoom: 14 });
}

muat();
if (tampilan === 'peta') document.querySelector('[data-tampil="peta"]').click();
