import { api, ambilSatu, ambilListing, kartuListing, esc, fotoKecil, labelHarga, rupiahPenuh, tempat, tipeLabel, namaKab, tautanWA, tampilPesan, AKAR } from './inti.js';

const isi = document.getElementById('isi');
const kode = new URLSearchParams(location.search).get('kode');

function videoTanam(v) {
  const u = v.url;
  let m;
  if ((m = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/))) {
    const tegak = /shorts\//.test(u);
    return { html: `<iframe src="https://www.youtube-nocookie.com/embed/${m[1]}" title="${esc(v.judul || 'Video properti')}" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" loading="lazy"></iframe>`, tegak };
  }
  if ((m = u.match(/instagram\.com\/(?:reel|p|tv)\/([\w-]+)/))) {
    return { html: `<iframe src="https://www.instagram.com/p/${m[1]}/embed" title="${esc(v.judul || 'Video Instagram')}" loading="lazy" allowtransparency="true"></iframe>`, tegak: true };
  }
  if ((m = u.match(/tiktok\.com\/@[\w.]+\/video\/(\d+)/))) {
    return { html: `<iframe src="https://www.tiktok.com/embed/v2/${m[1]}" title="${esc(v.judul || 'Video TikTok')}" loading="lazy" allow="encrypted-media; fullscreen"></iframe>`, tegak: true };
  }
  if (/\.(mp4|webm|mov)(\?|$)/i.test(u)) {
    return { html: `<video src="${esc(u)}" controls preload="metadata" playsinline></video>`, tegak: false };
  }
  return { html: `<a class="tombol tombol--terang" href="${esc(u)}" target="_blank" rel="noopener">Tonton video</a>`, tegak: false };
}

function tabelSpek(l) {
  const s = l.spesifikasi || {}, b = [];
  b.push(['Tipe', tipeLabel(l.tipe)]);
  b.push(['Penawaran', l.jenis === 'jual' ? 'Dijual' : 'Disewakan']);
  if (s.luasTanah) b.push(['Luas tanah', s.luasTanah + ' m²']);
  if (s.luasBangunan) b.push(['Luas bangunan', s.luasBangunan + ' m²']);
  if (s.dimensi) b.push(['Ukuran', s.dimensi]);
  if (s.lantai) b.push(['Jumlah lantai', s.lantai]);
  if (s.kamarTidur) b.push(['Kamar tidur', s.kamarTidur]);
  if (s.kamarMandi) b.push(['Kamar mandi', s.kamarMandi]);
  if (s.listrikWatt) b.push(['Listrik', s.listrikWatt.toLocaleString('id-ID') + ' watt']);
  if ((s.air || []).length) b.push(['Sumber air', s.air.join(', ')]);
  if ((s.legalitas || []).length) b.push(['Legalitas', s.legalitas.join(', ')]);
  if (s.parkir) b.push(['Parkir', 'Tersedia']);
  if (s.jalanUtama) b.push(['Akses', 'Jalan utama']);
  if (s.furnitur) b.push(['Furnitur', 'Termasuk']);
  return `<dl class="tabel-spek">${b.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

function render(l) {
  const h = labelHarga(l);
  const foto = l.foto || [];
  const video = l.video || [];
  const tidakTersedia = l.status && l.status !== 'tersedia';
  document.title = `${l.judul} (${l.kode}) — Sewain Property Agency`;
  document.querySelector('meta[name=description]').content =
    `${l.jenis === 'jual' ? 'Dijual' : 'Disewakan'} ${tipeLabel(l.tipe).toLowerCase()} di ${tempat(l)}${h.angka ? ', ' + (h.mulai ? 'mulai ' : '') + h.angka + ' ' + h.satuan : ''}. Kode ${l.kode}. Jadwalkan survei bersama Sewain.`;

  const pesanWA = `Halo Sewain, saya tertarik dengan properti ${l.kode} (${l.judul}). ${location.href}`;
  const galeri = foto.length ? `
    <div class="galeri galeri--${Math.min(foto.length, 3)}">
      ${foto.slice(0, 3).map((f, i) => `<button type="button" data-foto="${i}" aria-label="Lihat foto ${i + 1} dari ${foto.length}">
        <img src="${esc(fotoKecil(f, i === 0 ? 1200 : 640))}" alt="${esc(l.judul)} — foto ${i + 1}" ${i ? 'loading="lazy"' : ''}>
        ${i === 2 && foto.length > 3 ? `<span class="lebih">+${foto.length - 3} foto</span>` : ''}
      </button>`).join('')}
    </div>` : '';

  isi.innerHTML = `
    <nav class="remah" aria-label="Lokasi halaman"><a href="${AKAR}">Beranda</a> / <a href="${AKAR}properti/">Properti</a> / <a href="${AKAR}properti/?kabupaten=${encodeURIComponent(l.lokasi?.kabupaten || '')}">${esc(namaKab(l.lokasi?.kabupaten))}</a> / ${esc(l.kode)}</nav>
    <div class="detail-kepala">
      <div>
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
          <span class="plakat">${esc(l.kode)}</span>
          <span class="kartu-jenis ${l.jenis === 'jual' ? 'kartu-jenis--jual' : ''}" style="position:static">${l.jenis === 'jual' ? 'Dijual' : 'Disewakan'}</span>
          ${tidakTersedia ? `<span class="status-pita">${esc(l.status)}</span>` : ''}
        </div>
        <h1 class="judul-1">${esc(l.judul)}</h1>
        <p class="kartu-lokasi" style="font-size:15px;margin:12px 0 0">${esc([l.lokasi?.alamat, tempat(l), l.lokasi?.provinsi].filter(Boolean).join(', '))}</p>
      </div>
      <button class="tombol tombol--garis tombol--kecil" type="button" id="bagikan">Bagikan</button>
    </div>
    ${galeri}
    <div class="detail-susun">
      <div>
        ${video.length ? `<section class="blok"><h2>Video lokasi</h2>
          <div style="display:grid;gap:16px">${video.map(v => { const t = videoTanam(v); return `<div class="video-bingkai ${t.tegak ? 'video-bingkai--tegak' : ''}">${t.html}</div>`; }).join('')}</div>
        </section>` : ''}
        <section class="blok"><h2>Spesifikasi</h2>${tabelSpek(l)}</section>
        ${(l.fitur || []).length ? `<section class="blok"><h2>Fasilitas &amp; ketentuan</h2><div class="daftar-fitur">${l.fitur.map(f => `<div><h3>${esc(f.judul)}</h3><p>${esc(f.isi)}</p></div>`).join('')}</div></section>` : ''}
        ${(l.deskripsi || []).length ? `<section class="blok prosa"><h2>Tentang properti ini</h2>${l.deskripsi.map(p => `<p>${esc(p)}</p>`).join('')}</section>` : ''}
        ${l.lokasi?.lat != null ? `<section class="blok"><h2>Lokasi</h2><div class="peta peta--kecil" id="peta-detail" role="region" aria-label="Peta lokasi"></div>
          <p class="peta-catatan">${l.lokasi.presisi === 'titik' ? 'Titik menunjukkan lokasi properti.' : 'Lingkaran menunjukkan <b>perkiraan area ' + esc(l.lokasi.area || '') + '</b>. Alamat persis diberikan saat survei.'}</p></section>` : ''}
      </div>
      <aside class="panel-samping">
        <div class="kotak-harga">
          <p class="alis">${l.jenis === 'jual' ? 'Harga jual' : 'Harga sewa'}</p>
          ${h.angka
            ? `<span class="harga-besar">${h.mulai ? '<small>mulai </small>' : ''}${esc(h.angka)} <small>${esc(h.satuan)}</small></span>
               <span style="font-size:14px;opacity:.75">${esc(rupiahPenuh(l.harga))}</span>`
            : `<span class="harga-besar" style="font-size:34px">Hubungi kami</span><span style="font-size:14px;opacity:.75">Harga diinformasikan langsung oleh agen.</span>`}
          ${l.hargaTeks ? `<p class="harga-kutip">${esc(l.hargaTeks)}</p>` : ''}
          <a class="tombol tombol--wa tombol--penuh" href="${esc(tautanWA(pesanWA))}" target="_blank" rel="noopener">Tanya via WhatsApp</a>
        </div>
        ${tidakTersedia ? '' : `
        <form class="kotak-jadwal" id="form-survei" novalidate>
          <h3>Jadwalkan survei</h3>
          <div class="baris-medan">
            <label class="medan"><span>Tanggal</span><input class="masukan" type="date" name="tanggal" required></label>
            <label class="medan"><span>Jam (WITA)</span><select class="masukan" name="jam" required disabled><option value="">Pilih tanggal dulu</option></select></label>
          </div>
          <label class="medan"><span>Nama</span><input class="masukan" name="nama" autocomplete="name" required></label>
          <label class="medan"><span>Nomor WhatsApp</span><input class="masukan" name="telepon" type="tel" inputmode="tel" autocomplete="tel" placeholder="0812xxxxxxx" required></label>
          <input class="jebakan" name="situs" tabindex="-1" autocomplete="off" aria-hidden="true">
          <div class="pesan" role="status"></div>
          <button class="tombol tombol--penuh" type="submit">Kirim jadwal survei</button>
          <small style="color:var(--lumut);font-size:12px">Agen kami mengonfirmasi lewat WhatsApp sebelum hari survei.</small>
        </form>`}
      </aside>
    </div>
    <section class="bagian" id="serupa" hidden>
      <div class="bagian-kepala"><div><p class="alis">Di sekitar ${esc(namaKab(l.lokasi?.kabupaten))}</p><h2 class="judul-2">Properti serupa</h2></div></div>
      <div class="grid-listing" id="grid-serupa"></div>
    </section>`;

  // data terstruktur untuk mesin pencari
  const ld = document.createElement('script');
  ld.type = 'application/ld+json';
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'RealEstateListing', name: l.judul, url: location.href,
    image: foto.slice(0, 5), datePosted: l.dibuat,
    offers: l.harga ? { '@type': 'Offer', price: l.harga, priceCurrency: 'IDR', availability: tidakTersedia ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock' } : undefined,
    address: { '@type': 'PostalAddress', addressLocality: l.lokasi?.area, addressRegion: l.lokasi?.kabupaten, addressCountry: 'ID' },
  });
  document.head.appendChild(ld);

  pasangSorot(foto, l.judul);
  pasangPeta(l);
  pasangSurvei(l);
  document.getElementById('bagikan').addEventListener('click', async () => {
    const data = { title: l.judul + ' — Sewain', text: `${l.judul} (${l.kode})`, url: location.href };
    if (navigator.share) { try { await navigator.share(data); } catch (_) {} return; }
    await navigator.clipboard?.writeText(location.href);
    document.getElementById('bagikan').textContent = 'Tautan tersalin';
  });
  muatSerupa(l);
}

function pasangSorot(foto, judul) {
  const sorot = document.getElementById('sorot'), img = sorot.querySelector('img'), hitung = sorot.querySelector('.hitung');
  let i = 0, asal = null;
  const tampil = n => { i = (n + foto.length) % foto.length; img.src = fotoKecil(foto[i], 1600); img.alt = judul + ' — foto ' + (i + 1); hitung.textContent = (i + 1) + ' / ' + foto.length; };
  const tutup = () => { sorot.classList.remove('buka'); document.body.style.overflow = ''; asal?.focus(); };
  isi.querySelectorAll('[data-foto]').forEach(b => b.addEventListener('click', () => {
    asal = b; tampil(Number(b.dataset.foto)); sorot.classList.add('buka'); document.body.style.overflow = 'hidden'; sorot.querySelector('.tutup').focus();
  }));
  sorot.querySelector('.tutup').onclick = tutup;
  sorot.querySelector('.sebelum').onclick = () => tampil(i - 1);
  sorot.querySelector('.sesudah').onclick = () => tampil(i + 1);
  sorot.onclick = e => { if (e.target === sorot) tutup(); };
  addEventListener('keydown', e => {
    if (!sorot.classList.contains('buka')) return;
    if (e.key === 'Escape') tutup(); if (e.key === 'ArrowLeft') tampil(i - 1); if (e.key === 'ArrowRight') tampil(i + 1);
  });
  let mulaiX = null;
  sorot.addEventListener('touchstart', e => { mulaiX = e.touches[0].clientX; }, { passive: true });
  sorot.addEventListener('touchend', e => { if (mulaiX == null) return; const d = e.changedTouches[0].clientX - mulaiX; if (Math.abs(d) > 50) tampil(i + (d < 0 ? 1 : -1)); mulaiX = null; });
}

function pasangPeta(l) {
  const el = document.getElementById('peta-detail');
  if (!el || !window.L) return;
  const pusat = [l.lokasi.lat, l.lokasi.lng];
  const peta = L.map(el, { scrollWheelZoom: false }).setView(pusat, l.lokasi.presisi === 'titik' ? 16 : 14);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(peta);
  if (l.lokasi.presisi === 'titik') {
    L.marker(pusat, { icon: L.divIcon({ className: '', html: `<span class="penanda-harga">${esc(l.kode)}</span>`, iconSize: [0, 0] }) }).addTo(peta);
  } else {
    L.circle(pusat, { radius: 600, color: '#1D3125', weight: 2, fillColor: '#B08A4E', fillOpacity: .18 }).addTo(peta);
  }
}

function pasangSurvei(l) {
  const f = document.getElementById('form-survei');
  if (!f) return;
  const pesan = f.querySelector('.pesan');
  const hariIni = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  f.tanggal.min = hariIni;
  f.tanggal.max = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
  f.tanggal.addEventListener('change', async () => {
    f.jam.disabled = true; f.jam.innerHTML = '<option>Memuat jam…</option>';
    try {
      const j = await api('/api/jadwal?tanggal=' + f.tanggal.value);
      const ada = j.slot.filter(s => s.tersedia);
      f.jam.innerHTML = ada.length ? '<option value="">Pilih jam</option>' + ada.map(s => `<option>${s.jam}</option>`).join('')
        : `<option value="">${esc(j.keterangan || 'Jadwal hari itu penuh')}</option>`;
      f.jam.disabled = !ada.length;
    } catch (e) { f.jam.innerHTML = `<option value="">${esc(e.message)}</option>`; }
  });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (!f.tanggal.value || !f.jam.value) return tampilPesan(pesan, 'galat', 'Pilih tanggal dan jam survei.');
    const tombol = f.querySelector('[type=submit]');
    tombol.disabled = true; tombol.textContent = 'Mengirim…';
    try {
      const r = await api('/api/booking', { method: 'POST', json: {
        nama: f.nama.value, telepon: f.telepon.value, tanggal: f.tanggal.value, jam: f.jam.value,
        jenis: 'survei', cara: 'lokasi', kode: l.kode, situs: f.situs.value } });
      const tgl = new Date(r.booking.tanggal + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
      f.innerHTML = `<div class="konfirmasi"><span class="plakat">Survei ${esc(l.kode)}</span>
        <h3 style="margin:0 0 6px">Jadwal terkirim</h3>
        <p style="margin:0 0 14px;color:var(--lumut)">${esc(tgl)}, pukul ${esc(r.booking.jam)} WITA. Agen kami akan mengonfirmasi lewat WhatsApp.</p>
        <a class="tombol tombol--wa tombol--penuh" target="_blank" rel="noopener" href="${esc(tautanWA(`Halo Sewain, saya ${f.nama.value} sudah menjadwalkan survei ${l.kode} pada ${tgl} pukul ${r.booking.jam} WITA (no. ${r.booking.id}).`))}">Konfirmasi via WhatsApp</a></div>`;
    } catch (err) {
      tampilPesan(pesan, 'galat', err.message);
      tombol.disabled = false; tombol.textContent = 'Kirim jadwal survei';
      if (err.status === 409) f.tanggal.dispatchEvent(new Event('change'));
    }
  });
}

async function muatSerupa(l) {
  try {
    const d = await ambilListing({ jenis: l.jenis, kabupaten: l.lokasi?.kabupaten });
    const lain = d.listing.filter(x => x.kode !== l.kode).slice(0, 3);
    if (!lain.length) return;
    document.getElementById('grid-serupa').innerHTML = lain.map(kartuListing).join('');
    document.getElementById('serupa').hidden = false;
  } catch (_) {}
}

(async () => {
  if (!kode) {
    isi.innerHTML = `<div class="kosong" style="margin:40px 0">Kode properti tidak disebutkan. <a class="tombol" href="${AKAR}properti/">Lihat semua properti</a></div>`;
    return;
  }
  try { render(await ambilSatu(kode)); }
  catch (e) {
    isi.innerHTML = `<div class="kosong" style="margin:40px 0"><p style="margin:0;font-weight:600;color:var(--hutan)">${esc(e.message)}</p>
      <p>Properti ini mungkin sudah tersewa atau terjual.</p><a class="tombol" href="${AKAR}properti/">Lihat properti lain</a></div>`;
  }
})();
