import { esc, fotoKecil, labelHarga, AKAR, hrefListing } from './inti.js';

export function renderRek(r, batas = 6) {
  if (!r.hasil.length) {
    return `<div class="rek-kosong">Belum ada properti yang cocok dengan kriteria itu. Coba longgarkan anggaran atau wilayah — atau <a href="${AKAR}konsultasi/" style="color:var(--krem)">jadwalkan konsultasi</a>, kami carikan di luar daftar.</div>`;
  }
  const mesin = r.pakaiAI
    ? 'Kebutuhan Anda dibaca dengan AI; peringkat dihitung dari data properti yang tersedia.'
    : 'Dicocokkan otomatis dengan ' + r.dinilai + ' properti yang tersedia.';
  return r.hasil.slice(0, batas).map(h => {
    const l = h.listing, hg = labelHarga(l);
    return `<a class="rek-item" href="${hrefListing(l)}">
      ${l.foto && l.foto[0] ? `<img src="${esc(fotoKecil(l.foto[0], 320))}" alt="" loading="lazy">` : '<span></span>'}
      <div>
        <h4>${esc(l.judul)}</h4>
        <span class="plakat" style="font-size:12px">${esc(l.kode)}</span>
        <span style="font-weight:600;margin-left:8px">${hg.angka ? (hg.mulai ? 'mulai ' : '') + esc(hg.angka) + ' ' + esc(hg.satuan) : 'Harga: hubungi kami'}</span>
        <ul>${h.alasan.map(a => `<li>${esc(a)}</li>`).join('')}${h.catatan.map(c => `<li class="catatan">${esc(c)}</li>`).join('')}</ul>
      </div>
      <div class="rek-skor"><span class="angka">${h.skor}%</span><small>cocok</small></div>
    </a>`;
  }).join('') + `<p class="rek-mesin">${esc(mesin)}</p>`;
}
