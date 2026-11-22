'use strict';
/*
 * API Sewain Property Agency
 * ---------------------------------------------------------------------------
 * Satu proses Node ramping (VPS hanya punya ~200 MB RAM bebas):
 *   - data di berkas JSON (tulis atomik: berkas sementara lalu rename)
 *   - unggahan dialirkan langsung ke disk lewat busboy, tidak pernah ditampung
 *     utuh di memori (video bisa ratusan MB)
 *   - berkas media disajikan Caddy langsung dari MEDIA_DIR, bukan oleh Node,
 *     supaya permintaan Range (memutar-loncat video) tidak membebani proses ini
 *
 * Rekomendasi: PERINGKAT selalu dihitung aturan yang bisa ditelusuri. Model AI
 * (opsional, kalau ANTHROPIC_API_KEY ada) hanya dipakai untuk MEMBACA kalimat
 * bebas pelanggan menjadi kriteria - ia tidak pernah bisa mengarang listing.
 */
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const Busboy = require('busboy');
const { verifikasiIdToken } = require('./firebase-token');

// ---------------------------------------------------------------- setelan
muatEnv(path.join(__dirname, '.env'));
const PORT = Number(process.env.PORT) || 4100;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(__dirname, 'media');
const MEDIA_URL = (process.env.MEDIA_URL || 'http://127.0.0.1:' + PORT + '/media').replace(/\/$/, '');
const ASAL = (process.env.ASAL_DIIZINKAN || '').split(',').map(s => s.trim()).filter(Boolean);
const AI_KUNCI = process.env.ANTHROPIC_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'claude-haiku-5-5';
const WA_AGEN = process.env.WA_AGEN || '6285947720369';
const WA_LINK = process.env.WA_LINK || 'https://wa.me/message/6HMVH6NMUEAQD1';
const FIREBASE_PROYEK = process.env.FIREBASE_PROYEK || 'sewain-3274b';
const BATAS_VIDEO_PELANGGAN = 150 * 1024 * 1024;

const JAM_LAYANAN = (process.env.JAM_LAYANAN || '09:00,10:00,11:00,13:00,14:00,15:00,16:00').split(',');
const HARI_LIBUR = [0];               // 0 = Minggu
const WITA = 8 * 3600 * 1000;         // Bali & NTB sama-sama WITA (UTC+8)
const BATAS_FOTO = 15 * 1024 * 1024;
const BATAS_VIDEO = 300 * 1024 * 1024;

const WILAYAH = {
  Bali: {
    'Kota Denpasar': 'DPS', 'Kabupaten Badung': 'BDG', 'Kabupaten Gianyar': 'GIA',
    'Kabupaten Tabanan': 'TBN', 'Kabupaten Klungkung': 'KLK', 'Kabupaten Bangli': 'BGL',
    'Kabupaten Karangasem': 'KRA', 'Kabupaten Buleleng': 'BLL', 'Kabupaten Jembrana': 'JBR',
  },
  'Nusa Tenggara Barat': {
    'Kota Mataram': 'MTR', 'Kabupaten Lombok Barat': 'LBR', 'Kabupaten Lombok Tengah': 'LTG',
    'Kabupaten Lombok Timur': 'LTM', 'Kabupaten Lombok Utara': 'KLU', 'Kabupaten Sumbawa Barat': 'KSB',
    'Kabupaten Sumbawa': 'SBW', 'Kabupaten Dompu': 'DMP', 'Kabupaten Bima': 'BMA', 'Kota Bima': 'KBM',
  },
};
const JENIS = ['sewa', 'jual'];
const TIPE = ['toko', 'ruko', 'rumah', 'kontrakan', 'gudang', 'tanah', 'villa', 'kantor'];
const STATUS_LISTING = ['tersedia', 'tersewa', 'terjual', 'ditahan'];
const STATUS_BOOKING = ['baru', 'dikonfirmasi', 'selesai', 'batal'];

function muatEnv(berkas) {
  try {
    for (const baris of fs.readFileSync(berkas, 'utf8').split(/\r?\n/)) {
      const m = baris.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch (_) { /* .env tidak wajib */ }
}

// ---------------------------------------------------------------- penyimpanan JSON
const tembolok = new Map();
const antreTulis = new Map();

async function baca(nama, bawaan) {
  if (tembolok.has(nama)) return tembolok.get(nama);
  let isi;
  try { isi = JSON.parse(await fsp.readFile(path.join(DATA_DIR, nama + '.json'), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; isi = bawaan; }
  tembolok.set(nama, isi);
  return isi;
}

function tulis(nama, isi) {
  tembolok.set(nama, isi);
  const sebelumnya = antreTulis.get(nama) || Promise.resolve();
  const berikut = sebelumnya.then(async () => {
    const tujuan = path.join(DATA_DIR, nama + '.json');
    const sementara = tujuan + '.' + process.pid + '.tmp';
    await fsp.writeFile(sementara, JSON.stringify(isi, null, 1));
    await fsp.rename(sementara, tujuan);
  });
  antreTulis.set(nama, berikut.catch(() => {}));
  return berikut;
}

// ---------------------------------------------------------------- alat bantu HTTP
class GalatPengguna extends Error {
  constructor(status, pesan) { super(pesan); this.status = status; }
}

function kirim(res, status, isi, kepala) {
  const badan = JSON.stringify(isi);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }, kepala || {}));
  res.end(badan);
}

function corsUntuk(req) {
  const asal = req.headers.origin;
  if (!asal) return {};
  const lokal = process.env.IZINKAN_LOKAL === '1' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(asal);
  if (!lokal && !ASAL.includes(asal)) return {};
  return {
    'Access-Control-Allow-Origin': asal,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  };
}

function bacaBadan(req, batas = 1024 * 1024) {
  return new Promise((ok, gagal) => {
    let ukuran = 0;
    const potongan = [];
    req.on('data', b => {
      ukuran += b.length;
      if (ukuran > batas) { gagal(new GalatPengguna(413, 'Data terlalu besar.')); req.destroy(); return; }
      potongan.push(b);
    });
    req.on('end', () => {
      if (!potongan.length) return ok({});
      try { ok(JSON.parse(Buffer.concat(potongan).toString('utf8'))); }
      catch (_) { gagal(new GalatPengguna(400, 'Format data tidak dikenali.')); }
    });
    req.on('error', gagal);
  });
}

function ipDari(req) {
  // Caddy MENAMBAHKAN IP asli di ujung X-Forwarded-For; nilai di depannya bisa
  // dikarang pengirim, jadi yang dipercaya hanya nilai terakhir.
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : String(req.socket.remoteAddress || '');
}

const pembatas = new Map();
function batasi(kunci, maks, jendelaMs) {
  const kini = Date.now();
  const catatan = (pembatas.get(kunci) || []).filter(t => kini - t < jendelaMs);
  if (catatan.length >= maks) throw new GalatPengguna(429, 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.');
  catatan.push(kini);
  pembatas.set(kunci, catatan);
}
setInterval(() => {
  const kini = Date.now();
  for (const [k, v] of pembatas) if (!v.some(t => kini - t < 3600e3)) pembatas.delete(k);
}, 600e3).unref();

const teks = (v, maks = 500) => (typeof v === 'string' ? v.trim().slice(0, maks) : '');
const angka = v => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));

// ---------------------------------------------------------------- akun pengurus
function hashSandi(sandi, garam) {
  return crypto.scryptSync(sandi, garam, 64).toString('hex');
}

async function siapkanAdminAwal() {
  const pengguna = await baca('pengguna', []);
  if (pengguna.length) return;
  const email = teks(process.env.ADMIN_EMAIL || '', 120).toLowerCase();
  const sandi = process.env.ADMIN_SANDI_AWAL || '';
  if (!email || sandi.length < 10) {
    console.warn('[sewain] belum ada pengurus; isi ADMIN_EMAIL dan ADMIN_SANDI_AWAL di .env');
    return;
  }
  const garam = crypto.randomBytes(16).toString('hex');
  pengguna.push({ email, nama: 'Admin Sewain', peran: 'admin', garam, hash: hashSandi(sandi, garam),
    dibuat: new Date().toISOString(), wajibGantiSandi: true });
  await tulis('pengguna', pengguna);
  console.log('[sewain] pengurus awal dibuat:', email);
}

const hashToken = t => crypto.createHash('sha256').update(t).digest('hex');

// Token login Firebase (JWT tiga bagian). Dipakai pelanggan DAN pengurus yang
// masuk dengan Google: identitas dari Firebase, hak akses tetap dari daftar
// pengguna di server ini - akun Google mana pun TIDAK otomatis jadi pengurus.
async function identitasDari(req) {
  const m = String(req.headers.authorization || '').match(/^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try { return await verifikasiIdToken(m[1], FIREBASE_PROYEK); }
  catch (e) {
    console.error('[sewain] verifikasi token:', e.message);
    throw new GalatPengguna(503, 'Layanan masuk sedang tidak terjangkau. Coba lagi sebentar.');
  }
}

async function pengurusDari(req) {
  if (/^Bearer\s+[^.\s]+\.[^.\s]+\.[^.\s]+$/.test(String(req.headers.authorization || ''))) {
    const k = await identitasDari(req);
    if (!k || !k.email || !k.emailTerverifikasi) return null;
    const u = (await baca('pengguna', [])).find(x => x.email === k.email);
    return u ? { email: u.email, nama: u.nama || k.nama, peran: u.peran, wajibGantiSandi: false, lewatGoogle: true } : null;
  }
  const m = String(req.headers.authorization || '').match(/^Bearer\s+([a-f0-9]{64})$/);
  if (!m) return null;
  const sesi = await baca('sesi', {});
  const s = sesi[hashToken(m[1])];
  if (!s || s.kedaluwarsa < Date.now()) return null;
  const pengguna = await baca('pengguna', []);
  const u = pengguna.find(x => x.email === s.email);
  return u ? { email: u.email, nama: u.nama, peran: u.peran, wajibGantiSandi: !!u.wajibGantiSandi } : null;
}

async function wajibPengurus(req, peran) {
  const u = await pengurusDari(req);
  if (!u) throw new GalatPengguna(401, 'Sesi berakhir. Silakan masuk lagi.');
  // pemilik = admin tertinggi: lolos semua pintu admin, dan hanya pemilik yang
  // bisa menambah/menghapus akun pemilik lain.
  if (peran === 'admin' && !(u.peran === 'admin' || u.peran === 'pemilik')) throw new GalatPengguna(403, 'Hanya admin yang bisa melakukan ini.');
  if (peran === 'pemilik' && u.peran !== 'pemilik') throw new GalatPengguna(403, 'Hanya pemilik yang bisa melakukan ini.');
  return u;
}

// ---------------------------------------------------------------- listing
function rapikanListing(masuk, lama) {
  const l = Object.assign({}, lama || {});
  if ('judul' in masuk) l.judul = teks(masuk.judul, 140);
  if ('jenis' in masuk) { if (!JENIS.includes(masuk.jenis)) throw new GalatPengguna(400, 'Jenis harus sewa atau jual.'); l.jenis = masuk.jenis; }
  if ('tipe' in masuk) { if (!TIPE.includes(masuk.tipe)) throw new GalatPengguna(400, 'Tipe properti tidak dikenali.'); l.tipe = masuk.tipe; }
  if ('status' in masuk) { if (!STATUS_LISTING.includes(masuk.status)) throw new GalatPengguna(400, 'Status tidak dikenali.'); l.status = masuk.status; }
  if ('harga' in masuk) l.harga = angka(masuk.harga);
  if ('hargaMulai' in masuk) l.hargaMulai = !!masuk.hargaMulai;
  if ('periode' in masuk) l.periode = ['tahun', 'bulan'].includes(masuk.periode) ? masuk.periode : null;
  if ('hargaTeks' in masuk) l.hargaTeks = teks(masuk.hargaTeks, 400);
  if ('unggulan' in masuk) l.unggulan = !!masuk.unggulan;
  if ('terbit' in masuk) l.terbit = !!masuk.terbit;
  if ('lokasi' in masuk && masuk.lokasi) {
    const lk = masuk.lokasi;
    const prov = WILAYAH[lk.provinsi] ? lk.provinsi : null;
    if (!prov) throw new GalatPengguna(400, 'Provinsi harus Bali atau Nusa Tenggara Barat.');
    if (lk.kabupaten && !WILAYAH[prov][lk.kabupaten]) throw new GalatPengguna(400, 'Kabupaten/kota tidak sesuai provinsi.');
    l.lokasi = { provinsi: prov, kabupaten: lk.kabupaten || null, area: teks(lk.area, 80) || null,
      alamat: teks(lk.alamat, 200) || null };
    const lat = angka(lk.lat), lng = angka(lk.lng);
    if (lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      l.lokasi.lat = lat; l.lokasi.lng = lng;
      l.lokasi.presisi = lk.presisi === 'titik' ? 'titik' : 'area';
    }
  }
  if ('spesifikasi' in masuk && masuk.spesifikasi) {
    const s = masuk.spesifikasi, o = {};
    for (const k of ['luasTanah', 'luasBangunan', 'listrikWatt', 'kamarMandi', 'kamarTidur', 'lantai']) {
      const v = angka(s[k]); if (v != null && v >= 0) o[k] = v;
    }
    if (s.dimensi) o.dimensi = teks(s.dimensi, 40);
    if (Array.isArray(s.air)) o.air = s.air.map(x => teks(x, 30)).filter(Boolean).slice(0, 4);
    if (Array.isArray(s.legalitas)) o.legalitas = s.legalitas.map(x => teks(x, 20)).filter(Boolean).slice(0, 6);
    for (const k of ['parkir', 'jalanUtama', 'furnitur']) if (k in s) o[k] = !!s[k];
    l.spesifikasi = o;
  }
  if ('fitur' in masuk && Array.isArray(masuk.fitur)) {
    l.fitur = masuk.fitur.slice(0, 12).map(f => ({ judul: teks(f.judul, 60), isi: teks(f.isi, 400) }))
      .filter(f => f.judul && f.isi);
  }
  if ('deskripsi' in masuk) {
    const d = Array.isArray(masuk.deskripsi) ? masuk.deskripsi : String(masuk.deskripsi || '').split(/\n+/);
    l.deskripsi = d.map(x => teks(x, 1200)).filter(Boolean).slice(0, 20);
  }
  const mediaSah = u => typeof u === 'string' && /^https:\/\//.test(u) && u.length < 600;
  if ('foto' in masuk && Array.isArray(masuk.foto)) l.foto = masuk.foto.filter(mediaSah).slice(0, 30);
  if ('video' in masuk && Array.isArray(masuk.video)) {
    l.video = masuk.video.slice(0, 6).map(v => typeof v === 'string' ? { url: v } : v)
      .filter(v => v && mediaSah(v.url)).map(v => ({ url: v.url, judul: teks(v.judul, 80) || null }));
  }
  return l;
}

// Data internal pendataan: hanya pengurus yang bisa membaca & mengubah, dan
// TIDAK PERNAH ikut ke API publik (lihat untukPublik). Pemilik, penyewa aktif +
// masa kontrak, catatan, serta bahan mentah (foto/video asli untuk diolah).
const tglSah = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
function rapikanInternal(m, lama, oleh) {
  const o = Object.assign({ pemilik: {}, penyewa: {}, catatan: null, mentah: [] }, lama || {});
  if (m.pemilik && typeof m.pemilik === 'object') {
    // telepon boleh berisi beberapa nomor + nama, mis. "0858… (Vita) / 0878… (Nova)"
    o.pemilik = { nama: teks(m.pemilik.nama, 80) || null, telepon: teks(m.pemilik.telepon, 160) || null,
      email: teks(m.pemilik.email, 120) || null, alamat: teks(m.pemilik.alamat, 240) || null };
  }
  if (m.penyewa && typeof m.penyewa === 'object') {
    o.penyewa = { nama: teks(m.penyewa.nama, 80) || null, telepon: teks(m.penyewa.telepon, 20).replace(/[^\d+]/g, '') || null,
      mulai: tglSah(m.penyewa.mulai), berakhir: tglSah(m.penyewa.berakhir), nilai: angka(m.penyewa.nilai),
      catatan: teks(m.penyewa.catatan, 600) || null };
    if (o.penyewa.mulai && o.penyewa.berakhir && o.penyewa.berakhir < o.penyewa.mulai) throw new GalatPengguna(400, 'Tanggal kontrak berakhir tidak boleh sebelum tanggal mulai.');
  }
  if ('catatan' in m) o.catatan = teks(m.catatan, 2000) || null;
  // Harga asli dari pemilik (sebelum mark-up). Harga tayang tetap di listing.harga.
  if ('hargaPemilik' in m) o.hargaPemilik = angka(m.hargaPemilik);
  if ('hargaPemilikPeriode' in m) o.hargaPemilikPeriode = ['tahun', 'bulan'].includes(m.hargaPemilikPeriode) ? m.hargaPemilikPeriode : null;
  if ('hargaPemilikTeks' in m) o.hargaPemilikTeks = teks(m.hargaPemilikTeks, 600) || null;
  if ('punyaAgen' in m) o.punyaAgen = !!m.punyaAgen;
  if ('catatanSurvei' in m) o.catatanSurvei = teks(m.catatanSurvei, 3000) || null;
  if (m.proses && typeof m.proses === 'object') {
    const pilih = (v, ok) => (ok.includes(v) ? v : null);
    o.proses = {
      dihubungi: pilih(m.proses.dihubungi, ['belum', 'belum-dibalas', 'terhubung']),
      video: pilih(m.proses.video, ['belum', 'sudah']),
      izin: pilih(m.proses.izin, ['belum-jelas', 'diizinkan', 'tanpa-izin', 'ditolak']),
    };
  }
  if (Array.isArray(m.mentah)) {
    const sebelumnya = new Map((o.mentah || []).map(x => [x.url, x]));
    o.mentah = m.mentah.slice(0, 80).filter(x => x && typeof x.url === 'string' && /^https:\/\//.test(x.url) && x.url.length < 600).map(x => {
      const ada = sebelumnya.get(x.url) || {};
      return { url: x.url, jenis: x.jenis === 'video' ? 'video' : 'foto', nama: teks(x.nama, 120) || ada.nama || null,
        waktu: ada.waktu || new Date().toISOString().slice(0, 19), oleh: ada.oleh || oleh, diolah: !!x.diolah };
    });
  }
  return o;
}

async function kodeBaru(listing, kabupaten) {
  let awalan = 'SWN';
  for (const prov of Object.values(WILAYAH)) if (prov[kabupaten]) awalan = prov[kabupaten];
  // Nomor urut BERSAMA untuk semua wilayah, mengikuti buku kerja tim
  // (DPS-001, BDG-002, ... TBN-050): awalan = wilayah, angka = urutan global.
  const terpakai = listing.map(x => Number(String(x.kode).split('-')[1]) || 0);
  const n = (terpakai.length ? Math.max(...terpakai) : 0) + 1;
  return awalan + '-' + String(n).padStart(3, '0');
}

// Catatan internal tim (email pengunggah, status posting sosmed) tidak boleh
// sampai ke pengunjung.
function untukPublik(l) {
  const { sumber, oleh, posting, titipan, internal, ...sisa } = l;
  // Listing pindahan Blogger tetap memakai URL lamanya (sudah terindeks).
  const m = typeof sumber === 'string' && sumber.match(/^https?:\/\/(?:www\.)?sewatoko\.com(\/\d{4}\/\d{2}\/[a-z0-9_-]+\.html)$/);
  if (m) sisa.halaman = m[1];
  return sisa;
}

function saringListing(semua, q) {
  let h = semua.filter(l => l.terbit !== false);
  if (q.jenis) h = h.filter(l => l.jenis === q.jenis);
  if (q.tipe) h = h.filter(l => q.tipe.split(',').includes(l.tipe));
  if (q.provinsi) h = h.filter(l => l.lokasi && l.lokasi.provinsi === q.provinsi);
  if (q.kabupaten) h = h.filter(l => l.lokasi && l.lokasi.kabupaten === q.kabupaten);
  if (q.status !== 'semua') h = h.filter(l => !l.status || l.status === 'tersedia' || q.status === 'termasuk-lain');
  const min = angka(q.min), maks = angka(q.maks);
  if (min != null) h = h.filter(l => l.harga != null && l.harga >= min);
  if (maks != null) h = h.filter(l => l.harga != null && l.harga <= maks);
  if (q.cari) {
    const kata = String(q.cari).toLowerCase().split(/\s+/).filter(Boolean);
    h = h.filter(l => {
      const bahan = [l.kode, l.judul, l.tipe, l.lokasi && l.lokasi.area, l.lokasi && l.lokasi.kabupaten,
        (l.deskripsi || []).join(' ')].join(' ').toLowerCase();
      return kata.every(k => bahan.includes(k));
    });
  }
  const urut = {
    terbaru: (a, b) => String(b.dibuat).localeCompare(String(a.dibuat)),
    termurah: (a, b) => (a.harga ?? Infinity) - (b.harga ?? Infinity),
    termahal: (a, b) => (b.harga ?? -1) - (a.harga ?? -1),
  }[q.urut] || ((a, b) => (b.unggulan - a.unggulan) || String(b.dibuat).localeCompare(String(a.dibuat)));
  return h.sort(urut);
}

// ---------------------------------------------------------------- rekomendasi
// Urutan penting: jenis usaha yang spesifik dicek lebih dulu. Kata "toko",
// "ruko", "kios" SENGAJA tidak ada di sini - itu tipe bangunan, bukan jenis
// usaha ("toko untuk laundry" adalah usaha jasa, bukan ritel).
const PROFIL_USAHA = [
  { id: 'jasa', label: 'usaha jasa', kata: /\b(salon|barber|barbershop|pangkas|laundry|londri|klinik|praktik|dokter|bengkel|spa|pijat|studio|percetakan|fotokopi|servis)\b/,
    butuh: { air: true, listrikMin: 2200, kamarMandi: true } },
  { id: 'kuliner', label: 'usaha kuliner', kata: /\b(kopi|kafe|cafe|coffee|resto|restoran|rumah makan|warung|makan|makanan|bakery|roti|kuliner|minuman|boba|katering|dapur)\b/,
    butuh: { air: true, listrikMin: 2200, jalanUtama: true, parkir: true } },
  { id: 'gudang', label: 'gudang/logistik', kata: /\b(gudang|stok|ekspedisi|logistik|distribusi|grosir|bahan bangunan)\b/,
    butuh: { luasMin: 100, jalanUtama: true } },
  { id: 'kantor', label: 'kantor', kata: /\b(kantor|office|agen|agensi|travel|perusahaan|konsultan|notaris|startup)\b/,
    butuh: { parkir: true, lantaiMin: 2 } },
  { id: 'hunian', label: 'tempat tinggal', kata: /\b(tinggal|keluarga|hunian|rumah tinggal|kos|kost)\b/,
    butuh: {} },
  { id: 'retail', label: 'toko ritel', kata: /\b(minimarket|mart|retail|ritel|butik|fashion|baju|pakaian|apotek|sembako|elektronik|handphone|ponsel|hp|aksesoris|kosmetik|jualan|dagang)\b/,
    butuh: { jalanUtama: true, parkir: true } },
];

const KATA_TIPE = [
  ['ruko', /\bruko\b/], ['toko', /\btoko|kios|lapak\b/], ['rumah', /\brumah\b/], ['kontrakan', /kontrakan|\bkos/],
  ['gudang', /gudang/], ['tanah', /\btanah|lahan|kavling\b/], ['villa', /villa|vila/], ['kantor', /kantor|office/],
];

function bacaNominal(t) {
  const m = t.match(/(?:budget|bujet|dana|maks(?:imal)?|di ?bawah|sekitar|kisaran|harga|rp)?\s*(?:rp\.?\s*)?(\d+(?:[.,]\d+)?)\s*(miliar|milyar|m\b|juta|jt|rb|ribu)/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(',', '.'));
  const s = m[2].toLowerCase();
  if (/^m(iliar|ilyar)?$/.test(s) || s === 'milyar') n *= 1e9; else if (/^j/.test(s)) n *= 1e6; else n *= 1e3;
  return n >= 1e6 ? Math.round(n) : null;
}

function parsePermintaanAturan(kalimat, daftarArea) {
  const t = ' ' + String(kalimat || '').toLowerCase() + ' ';
  const k = {};
  if (/\b(beli|membeli|investasi|punya sendiri|hak milik)\b/.test(t)) k.jenis = 'jual';
  if (/\b(sewa|menyewa|kontrak|disewakan|per tahun|pertahun|setahun)\b/.test(t)) k.jenis = k.jenis ? null : 'sewa';
  for (const [tipe, pola] of KATA_TIPE) if (pola.test(t)) { k.tipe = tipe; break; }
  const nominal = bacaNominal(t);
  if (nominal) {
    k.budget = nominal;
    if (/per ?bulan|sebulan|\/ ?bln|\/ ?bulan|bulanan/.test(t)) k.periodeBudget = 'bulan';
  }
  const luas = t.match(/(?:luas|minimal|min\.?|sekitar)\s*(\d{2,4})\s*(?:m2|m²|meter)/);
  if (luas) k.luasMin = Number(luas[1]);
  const profil = PROFIL_USAHA.find(p => p.kata.test(t));
  if (profil) k.usaha = profil.id;
  for (const a of daftarArea) {
    if (t.includes(' ' + a.nama.toLowerCase())) { k.area = a.nama; k.kabupaten = a.kabupaten; break; }
  }
  if (!k.kabupaten) {
    for (const prov of Object.values(WILAYAH)) for (const kab of Object.keys(prov)) {
      const inti = kab.replace(/^(Kota|Kabupaten)\s+/, '').toLowerCase();
      if (t.includes(' ' + inti)) { k.kabupaten = kab; break; }
    }
  }
  if (/\b(lombok|mataram|sumbawa|ntb|nusa tenggara)\b/.test(t) && !k.kabupaten) k.provinsi = 'Nusa Tenggara Barat';
  if (/parkir/.test(t)) k.parkir = true;
  if (/(2|dua)\s*lantai/.test(t)) k.lantaiMin = 2;
  if (/jalan utama|pinggir jalan|jalan raya|ramai/.test(t)) k.jalanUtama = true;
  return k;
}

async function parsePermintaanAI(kalimat) {
  if (!AI_KUNCI || !kalimat) return null;
  const petunjuk = 'Ubah kebutuhan properti pelanggan menjadi JSON saja, tanpa teks lain. Kunci yang boleh: ' +
    'jenis ("sewa"|"jual"), tipe (' + TIPE.join('|') + '), budget (angka rupiah), periodeBudget ("tahun"|"bulan"), ' +
    'kabupaten (nama resmi, mis. "Kabupaten Badung", "Kota Denpasar", "Kota Mataram"), area (kelurahan/desa), ' +
    'usaha (' + PROFIL_USAHA.map(p => p.id).join('|') + '), luasMin (m2), parkir (bool), lantaiMin (angka), jalanUtama (bool). ' +
    'Hilangkan kunci yang tidak disebut pelanggan. Jangan menebak.';
  const kontrol = new AbortController();
  const waktu = setTimeout(() => kontrol.abort(), 8000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: kontrol.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': AI_KUNCI, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 300, system: petunjuk,
        messages: [{ role: 'user', content: String(kalimat).slice(0, 1200) }] }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const keluaran = (j.content || []).map(c => c.text || '').join('');
    const m = keluaran.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch (_) { return null; }
  finally { clearTimeout(waktu); }
}

const rupiahPendek = n => n >= 1e9 ? 'Rp' + (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M'
  : 'Rp' + Math.round(n / 1e6).toLocaleString('id-ID') + ' jt';

function nilaiListing(l, k) {
  let skor = 0, bobot = 0;
  const alasan = [], catatan = [];
  const s = l.spesifikasi || {};
  const lk = l.lokasi || {};

  // anggaran - pembanding paling berat
  if (k.budget) {
    bobot += 35;
    let hargaBanding = l.harga;
    if (hargaBanding != null && l.jenis === 'sewa') {
      const periodeListing = l.periode || 'tahun';
      const periodeBudget = k.periodeBudget || 'tahun';
      if (periodeListing !== periodeBudget) hargaBanding = periodeListing === 'tahun' ? hargaBanding / 12 : hargaBanding * 12;
    }
    if (hargaBanding == null) { skor += 12; catatan.push('Harga belum dicantumkan, perlu ditanyakan'); }
    else if (hargaBanding <= k.budget) { skor += 35; alasan.push('Masuk anggaran Anda (' + rupiahPendek(l.harga) + (l.periode ? '/' + l.periode : '') + ')'); }
    else if (hargaBanding <= k.budget * 1.15) {
      skor += 18;
      catatan.push('Sekitar ' + Math.round((hargaBanding / k.budget - 1) * 100) + '% di atas anggaran — beberapa pemilik masih bisa bernegosiasi');
    } else return null;
  }

  // wilayah
  if (k.area || k.kabupaten || k.provinsi) {
    bobot += 25;
    if (k.area && lk.area && lk.area.toLowerCase() === k.area.toLowerCase()) { skor += 25; alasan.push('Berada di ' + lk.area + ', sesuai area pilihan'); }
    else if (k.kabupaten && lk.kabupaten === k.kabupaten) { skor += 17; alasan.push('Di ' + lk.kabupaten.replace(/^Kabupaten /, '') + (lk.area ? ' (' + lk.area + ')' : '')); }
    else if (k.provinsi && lk.provinsi === k.provinsi) { skor += 12; }
    else if (k.kabupaten || k.area) catatan.push('Di luar wilayah pilihan: ' + [lk.area, lk.kabupaten].filter(Boolean).join(', '));
  }

  // tipe
  if (k.tipe) {
    bobot += 15;
    const kerabat = { toko: ['ruko'], ruko: ['toko'], rumah: ['kontrakan', 'villa'], kontrakan: ['rumah'] };
    if (l.tipe === k.tipe) { skor += 15; alasan.push('Tipe ' + l.tipe + ' sesuai permintaan'); }
    else if ((kerabat[k.tipe] || []).includes(l.tipe)) skor += 9;
  }

  // kecocokan dengan jenis usaha
  const profil = PROFIL_USAHA.find(p => p.id === k.usaha);
  const butuh = Object.assign({}, profil ? profil.butuh : {});
  if (k.parkir) butuh.parkir = true;
  if (k.jalanUtama) butuh.jalanUtama = true;
  if (k.lantaiMin) butuh.lantaiMin = k.lantaiMin;
  if (k.luasMin) butuh.luasMin = k.luasMin;
  const syarat = Object.keys(butuh);
  if (syarat.length) {
    bobot += 25;
    let cocok = 0;
    const ket = profil ? ' untuk ' + profil.label : '';
    if (butuh.air) { if ((s.air || []).length) { cocok++; alasan.push('Air ' + s.air.join(' & ') + ' tersedia' + ket); } }
    if (butuh.listrikMin) {
      if (s.listrikWatt >= butuh.listrikMin) { cocok++; alasan.push('Listrik ' + s.listrikWatt.toLocaleString('id-ID') + ' watt' + ket); }
      else if (s.listrikWatt) catatan.push('Listrik ' + s.listrikWatt.toLocaleString('id-ID') + ' watt — mungkin perlu tambah daya');
    }
    if (butuh.jalanUtama && s.jalanUtama) { cocok++; alasan.push('Di pinggir jalan utama, mudah terlihat'); }
    if (butuh.parkir && s.parkir) { cocok++; alasan.push('Ada area parkir'); }
    if (butuh.kamarMandi && s.kamarMandi) { cocok++; }
    if (butuh.lantaiMin && s.lantai >= butuh.lantaiMin) { cocok++; alasan.push(s.lantai + ' lantai'); }
    const luas = s.luasBangunan || s.luasTanah;
    if (butuh.luasMin) {
      if (luas >= butuh.luasMin) { cocok++; alasan.push('Luas ' + luas + ' m²'); }
      else if (luas) catatan.push('Luas ' + luas + ' m², di bawah kebutuhan ' + butuh.luasMin + ' m²');
    }
    skor += Math.round(25 * cocok / syarat.length);
  }

  if (k.jenis) { bobot += 0; }
  if (!bobot) return { skor: 50, alasan: ['Listing terbaru yang masih tersedia'], catatan };
  return { skor: Math.round(100 * skor / bobot), alasan: alasan.slice(0, 4), catatan: catatan.slice(0, 2) };
}

async function rekomendasi(masuk) {
  const semua = (await baca('listing', [])).filter(l => l.terbit !== false && (!l.status || l.status === 'tersedia'));
  const daftarArea = [];
  for (const l of semua) {
    if (l.lokasi && l.lokasi.area && !daftarArea.some(a => a.nama === l.lokasi.area))
      daftarArea.push({ nama: l.lokasi.area, kabupaten: l.lokasi.kabupaten });
  }
  daftarArea.sort((a, b) => b.nama.length - a.nama.length);   // "Dauh Puri Kangin" sebelum "Dauh Puri"

  const kalimat = teks(masuk.kebutuhan, 1200);
  let kriteria = parsePermintaanAturan(kalimat, daftarArea);
  let pakaiAI = false;
  const dariAI = await parsePermintaanAI(kalimat);
  if (dariAI && typeof dariAI === 'object') { kriteria = Object.assign(kriteria, dariAI); pakaiAI = true; }

  // isian formulir selalu menang atas tafsiran kalimat
  for (const kunci of ['jenis', 'tipe', 'kabupaten', 'area', 'usaha', 'periodeBudget', 'provinsi']) {
    if (teks(masuk[kunci], 80)) kriteria[kunci] = teks(masuk[kunci], 80);
  }
  for (const kunci of ['budget', 'luasMin', 'lantaiMin']) if (angka(masuk[kunci])) kriteria[kunci] = angka(masuk[kunci]);
  for (const kunci of ['parkir', 'jalanUtama']) if (masuk[kunci] === true) kriteria[kunci] = true;

  let calon = kriteria.jenis ? semua.filter(l => l.jenis === kriteria.jenis) : semua;
  const hasil = [];
  for (const l of calon) {
    const n = nilaiListing(l, kriteria);
    if (n) hasil.push({ listing: untukPublik(l), skor: n.skor, alasan: n.alasan, catatan: n.catatan });
  }
  hasil.sort((a, b) => b.skor - a.skor || (a.listing.harga ?? Infinity) - (b.listing.harga ?? Infinity));
  return { kriteria, pakaiAI, hasil: hasil.slice(0, 6), dinilai: calon.length };
}

// ---------------------------------------------------------------- jadwal konsultasi
function tanggalWITA(ms) { return new Date(ms + WITA).toISOString().slice(0, 10); }

async function slotTanggal(tanggal) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) throw new GalatPengguna(400, 'Tanggal tidak valid.');
  const hari = new Date(tanggal + 'T00:00:00Z').getUTCDay();
  const kini = Date.now();
  const hariIni = tanggalWITA(kini);
  const terjauh = tanggalWITA(kini + 60 * 864e5);
  if (tanggal < hariIni || tanggal > terjauh) return { tanggal, libur: false, slot: [], keterangan: 'Pilih tanggal dalam 60 hari ke depan.' };
  if (HARI_LIBUR.includes(hari)) return { tanggal, libur: true, slot: [], keterangan: 'Hari Minggu kantor tutup.' };
  const booking = await baca('booking', []);
  const terisi = new Set(booking.filter(b => b.tanggal === tanggal && b.status !== 'batal').map(b => b.jam));
  const slot = JAM_LAYANAN.map(jam => {
    const waktuSlot = Date.parse(tanggal + 'T' + jam + ':00Z') - WITA;
    const tersedia = !terisi.has(jam) && waktuSlot - kini > 2 * 3600e3;
    return { jam, tersedia };
  });
  return { tanggal, libur: false, slot };
}

async function buatBooking(masuk, ip, akun) {
  batasi('booking:' + ip, 5, 3600e3);
  const nama = teks(masuk.nama, 80);
  const telepon = teks(masuk.telepon, 20).replace(/[^\d+]/g, '');
  const tanggal = teks(masuk.tanggal, 10);
  const jam = teks(masuk.jam, 5);
  const jenis = ['konsultasi', 'survei', 'titip'].includes(masuk.jenis) ? masuk.jenis : 'konsultasi';
  const cara = ['kantor', 'lokasi', 'online'].includes(masuk.cara) ? masuk.cara : 'kantor';
  if (nama.length < 2) throw new GalatPengguna(400, 'Isi nama Anda.');
  if (!/^(\+?62|0)8\d{7,12}$/.test(telepon)) throw new GalatPengguna(400, 'Nomor WhatsApp belum benar. Contoh: 0812xxxxxxx.');
  if (masuk.situs) throw new GalatPengguna(400, 'Permintaan ditolak.');     // jebakan bot
  const jadwal = await slotTanggal(tanggal);
  const slot = jadwal.slot.find(s => s.jam === jam);
  if (!slot || !slot.tersedia) throw new GalatPengguna(409, 'Jam itu baru saja terisi atau sudah lewat. Pilih jam lain.');
  const kode = teks(masuk.kode, 12).toUpperCase() || null;
  const booking = await baca('booking', []);
  const b = {
    id: crypto.randomBytes(5).toString('hex'),
    dibuat: new Date().toISOString(),
    nama, telepon, email: teks(masuk.email, 120) || null,
    tanggal, jam, jenis, cara, kode,
    pesan: teks(masuk.pesan, 800) || null,
    status: 'baru',
  };
  if (akun) { b.uid = akun.uid; if (!b.email && akun.email) b.email = akun.email; }
  booking.push(b);
  await tulis('booking', booking);
  return b;
}

// ---------------------------------------------------------------- unggahan media
const TIPE_MEDIA = {
  'image/jpeg': ['foto', '.jpg'], 'image/png': ['foto', '.png'], 'image/webp': ['foto', '.webp'],
  'video/mp4': ['video', '.mp4'], 'video/quicktime': ['video', '.mov'], 'video/webm': ['video', '.webm'],
};

function terimaUnggahan(req, batasVideo = BATAS_VIDEO, subTetap = null) {
  return new Promise((ok, gagal) => {
    let bb;
    try { bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: batasVideo, fields: 5 } }); }
    catch (_) { return gagal(new GalatPengguna(400, 'Unggahan tidak dikenali.')); }
    let selesai = false, adaBerkas = false;
    bb.on('file', (_nama, aliran, info) => {
      adaBerkas = true;
      const jenis = TIPE_MEDIA[info.mimeType];
      if (!jenis) { aliran.resume(); selesai = true; return gagal(new GalatPengguna(415, 'Jenis berkas tidak didukung. Pakai JPG, PNG, WEBP, MP4, MOV, atau WEBM.')); }
      const [golongan, ekstensi] = jenis;
      const batas = golongan === 'foto' ? BATAS_FOTO : batasVideo;
      const kini = new Date();
      const sub = subTetap || (kini.getUTCFullYear() + '/' + String(kini.getUTCMonth() + 1).padStart(2, '0'));
      const nama = crypto.randomBytes(9).toString('hex') + ekstensi;
      const folder = path.join(MEDIA_DIR, sub);
      fs.mkdirSync(folder, { recursive: true, mode: 0o755 });
      const tujuan = path.join(folder, nama);
      const keluar = fs.createWriteStream(tujuan, { mode: 0o644 });
      let ukuran = 0;
      aliran.on('data', b => {
        ukuran += b.length;
        if (ukuran > batas && !selesai) {
          selesai = true;
          aliran.unpipe(keluar); keluar.destroy(); aliran.resume();
          fs.unlink(tujuan, () => {});
          gagal(new GalatPengguna(413, golongan === 'foto' ? 'Foto maksimal 15 MB.' : 'Video maksimal 300 MB. Kompres dulu di ponsel.'));
        }
      });
      aliran.on('limit', () => {
        if (selesai) return;
        selesai = true; keluar.destroy(); fs.unlink(tujuan, () => {});
        gagal(new GalatPengguna(413, 'Video maksimal 300 MB. Kompres dulu di ponsel.'));
      });
      aliran.pipe(keluar);
      keluar.on('finish', () => {
        if (selesai) return;
        selesai = true;
        ok({ url: MEDIA_URL + '/' + sub + '/' + nama, jenis: golongan, ukuran, namaAsli: String(info.filename || '').slice(0, 120) });
      });
      keluar.on('error', e => { if (!selesai) { selesai = true; gagal(e); } });
    });
    bb.on('close', () => { if (!adaBerkas && !selesai) { selesai = true; gagal(new GalatPengguna(400, 'Tidak ada berkas yang dikirim.')); } });
    bb.on('error', e => { if (!selesai) { selesai = true; gagal(e); } });
    req.pipe(bb);
  });
}

async function hapusMedia(url) {
  if (typeof url !== 'string' || !url.startsWith(MEDIA_URL + '/')) return false;
  const rel = url.slice(MEDIA_URL.length + 1);
  if (!/^(\d{4}\/\d{2}|bahan\/[a-z0-9-]{1,60})\/[a-f0-9]{18}\.(jpg|png|webp|mp4|mov|webm)$/.test(rel)) return false;
  await fsp.unlink(path.join(MEDIA_DIR, rel)).catch(() => {});
  return true;
}

// ---------------------------------------------------------------- bahan posting sosmed
function bahanSosmed(l) {
  const lk = l.lokasi || {}, s = l.spesifikasi || {};
  const tempat = [lk.area, (lk.kabupaten || '').replace(/^(Kabupaten|Kota) /, '')].filter(Boolean).join(', ');
  const harga = l.harga ? (l.hargaMulai ? 'Mulai ' : '') + rupiahPendek(l.harga) + (l.periode ? ' / ' + l.periode : '') : 'Harga: hubungi kami';
  const butir = [];
  if (s.luasTanah) butir.push('Luas tanah ' + s.luasTanah + ' m²');
  if (s.luasBangunan) butir.push('Luas bangunan ' + s.luasBangunan + ' m²');
  if (s.dimensi) butir.push('Ukuran ' + s.dimensi);
  if (s.lantai) butir.push(s.lantai + ' lantai');
  if (s.listrikWatt) butir.push('Listrik ' + s.listrikWatt.toLocaleString('id-ID') + ' watt');
  if ((s.air || []).length) butir.push('Air ' + s.air.join(' & '));
  if (s.kamarMandi) butir.push(s.kamarMandi + ' kamar mandi');
  if ((s.legalitas || []).length) butir.push('Legalitas ' + s.legalitas.join(', '));
  const judul = (l.jenis === 'jual' ? 'DIJUAL' : 'DISEWAKAN') + ' · ' + l.tipe.toUpperCase() + ' · ' + tempat;
  const tagWilayah = [lk.area, (lk.kabupaten || '').replace(/^(Kabupaten|Kota) /, ''), lk.provinsi === 'Bali' ? 'Bali' : 'Lombok']
    .filter(Boolean).map(x => '#' + x.replace(/\s+/g, '').toLowerCase());
  const tag = [...new Set(['#sewain', '#' + (l.jenis === 'jual' ? 'jual' : 'sewa') + l.tipe, ...tagWilayah,
    '#propertibali', '#tempatusaha', '#' + (l.jenis === 'jual' ? 'propertidijual' : 'disewakan')])];
  const caption = [
    judul, '', harga, '',
    ...butir.map(b => '• ' + b), '',
    (l.deskripsi || [])[0] ? String(l.deskripsi[0]).slice(0, 280) : '',
    '', 'Kode listing: ' + l.kode,
    'Jadwalkan survei via WhatsApp Sewain.id (tautan di bio), sebutkan kode ' + l.kode, '',
    tag.join(' '),
  ].filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');
  return { kode: l.kode, judul, caption, tagar: tag, foto: l.foto || [], video: (l.video || []).map(v => v.url) };
}

// ---------------------------------------------------------------- rute
const rute = [];
const daftar = (metode, pola, fungsi) => rute.push({ metode, pola, fungsi });

daftar('GET', /^\/api\/sehat$/, async () => ({ ok: true, waktu: new Date().toISOString(), ai: !!AI_KUNCI }));

daftar('GET', /^\/api\/wilayah$/, async () => ({ wilayah: WILAYAH, tipe: TIPE, jenis: JENIS, jamLayanan: JAM_LAYANAN, wa: WA_LINK }));

daftar('GET', /^\/api\/listing$/, async ({ q }) => {
  const semua = await baca('listing', []);
  const h = saringListing(semua, q);
  return { jumlah: h.length, listing: h.map(untukPublik) };
});

daftar('GET', /^\/api\/listing\/([A-Za-z0-9-]{3,16})$/, async ({ cocok }) => {
  const l = (await baca('listing', [])).find(x => x.kode.toLowerCase() === cocok[1].toLowerCase() && x.terbit !== false);
  if (!l) throw new GalatPengguna(404, 'Listing tidak ditemukan atau sudah tidak ditawarkan.');
  return { listing: untukPublik(l) };
});

daftar('GET', /^\/api\/ringkasan$/, async () => {
  const semua = (await baca('listing', [])).filter(l => l.terbit !== false && (!l.status || l.status === 'tersedia'));
  const perKab = {};
  for (const l of semua) {
    const k = (l.lokasi && l.lokasi.kabupaten) || 'Lainnya';
    perKab[k] = perKab[k] || { kabupaten: k, provinsi: l.lokasi && l.lokasi.provinsi, sewa: 0, jual: 0 };
    perKab[k][l.jenis] = (perKab[k][l.jenis] || 0) + 1;
  }
  return { total: semua.length, sewa: semua.filter(l => l.jenis === 'sewa').length,
    jual: semua.filter(l => l.jenis === 'jual').length, wilayah: Object.values(perKab) };
});

daftar('POST', /^\/api\/rekomendasi$/, async ({ req, ip }) => {
  batasi('rek:' + ip, 30, 60e3);
  return rekomendasi(await bacaBadan(req, 16 * 1024));
});

daftar('GET', /^\/api\/jadwal$/, async ({ q }) => slotTanggal(String(q.tanggal || '')));

daftar('POST', /^\/api\/booking$/, async ({ req, ip }) => {
  const akun = await identitasDari(req).catch(() => null);
  const b = await buatBooking(await bacaBadan(req, 16 * 1024), ip, akun);
  return { ok: true, booking: { id: b.id, tanggal: b.tanggal, jam: b.jam, jenis: b.jenis, kode: b.kode }, wa: WA_LINK };
});

// --- akun pelanggan (pembeli, penyewa, pemilik yang menitip properti)
async function wajibAkun(req) {
  const k = await identitasDari(req);
  if (!k) throw new GalatPengguna(401, 'Silakan masuk dulu.');
  const semua = await baca('pelanggan', []);
  let p = semua.find(x => x.uid === k.uid);
  if (!p) {
    p = { uid: k.uid, email: k.email, nama: k.nama || (k.email ? k.email.split('@')[0] : 'Pengguna'), telepon: null,
      foto: k.foto, penyedia: k.penyedia, favorit: [], dibuat: new Date().toISOString() };
    semua.push(p);
    await tulis('pelanggan', semua);
  } else if (k.email && p.email !== k.email) { p.email = k.email; await tulis('pelanggan', semua); }
  return { p, semua, k };
}
const profilPublik = (p, k) => ({ uid: p.uid, email: p.email, nama: p.nama, telepon: p.telepon, foto: p.foto,
  favorit: p.favorit || [], emailTerverifikasi: !!(k && k.emailTerverifikasi), dibuat: p.dibuat });

daftar('GET', /^\/api\/akun$/, async ({ req }) => {
  const { p, k } = await wajibAkun(req);
  const pengurus = k.email && k.emailTerverifikasi && (await baca('pengguna', [])).some(u => u.email === k.email);
  return { akun: profilPublik(p, k), pengurus: !!pengurus };
});

daftar('PATCH', /^\/api\/akun$/, async ({ req }) => {
  const { p, semua, k } = await wajibAkun(req);
  const m = await bacaBadan(req, 4096);
  if ('nama' in m) { const n = teks(m.nama, 80); if (n.length < 2) throw new GalatPengguna(400, 'Isi nama Anda.'); p.nama = n; }
  if ('telepon' in m) {
    const t = teks(m.telepon, 20).replace(/[^\d+]/g, '');
    if (t && !/^(\+?62|0)8\d{7,12}$/.test(t)) throw new GalatPengguna(400, 'Nomor WhatsApp belum benar. Contoh: 0812xxxxxxx.');
    p.telepon = t || null;
  }
  await tulis('pelanggan', semua);
  return { akun: profilPublik(p, k) };
});

daftar('POST', /^\/api\/akun\/favorit\/([A-Za-z0-9-]{3,16})$/, async ({ req, cocok }) => {
  const { p, semua, k } = await wajibAkun(req);
  const kode = cocok[1].toUpperCase();
  if (!(await baca('listing', [])).some(l => l.kode === kode && l.terbit !== false)) throw new GalatPengguna(404, 'Listing tidak ditemukan.');
  p.favorit = [kode, ...(p.favorit || []).filter(x => x !== kode)].slice(0, 200);
  await tulis('pelanggan', semua);
  return { akun: profilPublik(p, k) };
});

daftar('DELETE', /^\/api\/akun\/favorit\/([A-Za-z0-9-]{3,16})$/, async ({ req, cocok }) => {
  const { p, semua, k } = await wajibAkun(req);
  p.favorit = (p.favorit || []).filter(x => x !== cocok[1].toUpperCase());
  await tulis('pelanggan', semua);
  return { akun: profilPublik(p, k) };
});

daftar('GET', /^\/api\/akun\/jadwal$/, async ({ req }) => {
  const { p } = await wajibAkun(req);
  const milik = (await baca('booking', [])).filter(b => b.uid === p.uid);
  return { jadwal: milik.map(b => ({ id: b.id, tanggal: b.tanggal, jam: b.jam, jenis: b.jenis, cara: b.cara, kode: b.kode, status: b.status, dibuat: b.dibuat }))
    .sort((a, b) => (b.tanggal + b.jam).localeCompare(a.tanggal + a.jam)) };
});

// Titip properti: pemilik mengisi data + foto; tersimpan sebagai DRAF yang
// baru tayang setelah pengurus memeriksa dan menekan "Tayang" di panel.
const BATAS_TITIP_AKTIF = 10;
daftar('GET', /^\/api\/akun\/titip$/, async ({ req }) => {
  const { p } = await wajibAkun(req);
  const milik = (await baca('listing', [])).filter(l => l.titipan && l.titipan.uid === p.uid);
  return { titip: milik.map(l => ({ kode: l.kode, judul: l.judul, jenis: l.jenis, tipe: l.tipe, harga: l.harga, periode: l.periode,
    tayang: l.terbit !== false, status: l.status, foto: (l.foto || []).slice(0, 1), dibuat: l.dibuat })) };
});

daftar('POST', /^\/api\/akun\/titip$/, async ({ req }) => {
  const { p } = await wajibAkun(req);
  batasi('titip:' + p.uid, 5, 3600e3);
  const m = await bacaBadan(req, 64 * 1024);
  const semua = await baca('listing', []);
  if (semua.filter(l => l.titipan && l.titipan.uid === p.uid && l.terbit === false).length >= BATAS_TITIP_AKTIF)
    throw new GalatPengguna(429, 'Masih ada ' + BATAS_TITIP_AKTIF + ' titipan yang menunggu diperiksa. Tunggu sebagian ditayangkan dulu.');
  const telepon = teks(m.telepon, 20).replace(/[^\d+]/g, '');
  if (!/^(\+?62|0)8\d{7,12}$/.test(telepon)) throw new GalatPengguna(400, 'Nomor WhatsApp belum benar. Contoh: 0812xxxxxxx.');
  // Foto & video hanya boleh berasal dari unggahan akun ini sendiri.
  const unggahanSaya = new Set(((await baca('unggahan-pelanggan', {}))[p.uid] || []).map(x => x.url));
  const masuk = Object.assign({}, m, {
    foto: (Array.isArray(m.foto) ? m.foto : []).filter(u => unggahanSaya.has(u)).slice(0, 15),
    video: (Array.isArray(m.video) ? m.video : []).filter(u => unggahanSaya.has(typeof u === 'string' ? u : u && u.url)).slice(0, 2),
  });
  delete masuk.terbit; delete masuk.unggulan; delete masuk.status; delete masuk.internal;
  const l = rapikanListing(masuk, { status: 'tersedia', unggulan: false, terbit: false, foto: [], video: [], fitur: [], deskripsi: [] });
  if (!l.jenis || !l.tipe) throw new GalatPengguna(400, 'Pilih disewakan atau dijual, dan tipe properti.');
  if (!l.lokasi || !l.lokasi.kabupaten) throw new GalatPengguna(400, 'Pilih provinsi dan kabupaten/kota.');
  l.kode = await kodeBaru(semua, l.lokasi.kabupaten);
  if (!l.judul) l.judul = (l.jenis === 'jual' ? 'Dijual ' : 'Disewakan ') + l.tipe.charAt(0).toUpperCase() + l.tipe.slice(1) + (l.lokasi.area ? ' di ' + l.lokasi.area : '');
  l.dibuat = l.diubah = new Date().toISOString().slice(0, 19);
  l.oleh = 'titipan:' + (p.email || p.uid);
  l.titipan = { uid: p.uid, nama: teks(m.namaPemilik, 80) || p.nama, telepon, email: p.email, catatan: teks(m.catatan, 800) || null, diterima: l.dibuat };
  l.internal = { pemilik: { nama: l.titipan.nama, telepon, email: p.email, alamat: null }, penyewa: {}, catatan: l.titipan.catatan,
    mentah: [...l.foto.map(u => ({ url: u, jenis: 'foto' })), ...l.video.map(v => ({ url: v.url, jenis: 'video' }))]
      .map(x => Object.assign(x, { nama: null, waktu: l.dibuat, oleh: 'pemilik', diolah: false })) };
  semua.push(l);
  await tulis('listing', semua);
  if (!p.telepon) {
    const pel = await baca('pelanggan', []);
    const x = pel.find(y => y.uid === p.uid);
    if (x) { x.telepon = telepon; await tulis('pelanggan', pel); }
  }
  return { ok: true, kode: l.kode };
});

daftar('POST', /^\/api\/akun\/media$/, async ({ req }) => {
  const { p } = await wajibAkun(req);
  batasi('media-akun:' + p.uid, 40, 3600e3);
  if (!/multipart\/form-data/.test(String(req.headers['content-type']))) throw new GalatPengguna(400, 'Kirim sebagai unggahan berkas.');
  const catatan = await baca('unggahan-pelanggan', {});
  const milik = catatan[p.uid] || [];
  const kemarin = Date.now() - 864e5;
  if (milik.filter(x => Date.parse(x.waktu) > kemarin).length >= 60) throw new GalatPengguna(429, 'Batas unggahan harian tercapai. Coba lagi besok.');
  const hasil = await terimaUnggahan(req, BATAS_VIDEO_PELANGGAN);
  milik.push({ url: hasil.url, jenis: hasil.jenis, waktu: new Date().toISOString() });
  catatan[p.uid] = milik.slice(-300);
  await tulis('unggahan-pelanggan', catatan);
  return hasil;
});

daftar('GET', /^\/api\/pengurus\/pelanggan$/, async ({ req }) => {
  await wajibPengurus(req, 'admin');
  const pel = await baca('pelanggan', []);
  return { pelanggan: pel.map(p => ({ email: p.email, nama: p.nama, telepon: p.telepon, favorit: (p.favorit || []).length, dibuat: p.dibuat, penyedia: p.penyedia }))
    .sort((a, b) => String(b.dibuat).localeCompare(String(a.dibuat))) };
});

// --- pengurus
daftar('POST', /^\/api\/pengurus\/masuk$/, async ({ req, ip }) => {
  batasi('masuk:' + ip, 10, 15 * 60e3);
  const m = await bacaBadan(req, 4096);
  const email = teks(m.email, 120).toLowerCase();
  const pengguna = await baca('pengguna', []);
  const u = pengguna.find(x => x.email === email);
  const hashMasuk = hashSandi(String(m.sandi || ''), u ? u.garam : 'garam-palsu-supaya-waktunya-sama');
  if (!u || !u.hash || !crypto.timingSafeEqual(Buffer.from(hashMasuk, 'hex'), Buffer.from(u.hash, 'hex')))
    throw new GalatPengguna(401, 'Email atau sandi salah.');
  const token = crypto.randomBytes(32).toString('hex');
  const sesi = await baca('sesi', {});
  for (const [k, v] of Object.entries(sesi)) if (v.kedaluwarsa < Date.now()) delete sesi[k];
  sesi[hashToken(token)] = { email: u.email, dibuat: Date.now(), kedaluwarsa: Date.now() + 7 * 864e5 };
  await tulis('sesi', sesi);
  return { token, pengurus: { email: u.email, nama: u.nama, peran: u.peran, wajibGantiSandi: !!u.wajibGantiSandi } };
});

daftar('POST', /^\/api\/pengurus\/keluar$/, async ({ req }) => {
  const m = String(req.headers.authorization || '').match(/^Bearer\s+([a-f0-9]{64})$/);
  if (m) { const sesi = await baca('sesi', {}); delete sesi[hashToken(m[1])]; await tulis('sesi', sesi); }
  return { ok: true };
});

daftar('GET', /^\/api\/pengurus\/saya$/, async ({ req }) => ({ pengurus: await wajibPengurus(req) }));

daftar('POST', /^\/api\/pengurus\/sandi$/, async ({ req, ip }) => {
  const saya = await wajibPengurus(req);
  batasi('sandi:' + ip, 10, 15 * 60e3);
  const m = await bacaBadan(req, 4096);
  const baru = String(m.baru || '');
  if (baru.length < 10) throw new GalatPengguna(400, 'Sandi baru minimal 10 karakter.');
  const pengguna = await baca('pengguna', []);
  const u = pengguna.find(x => x.email === saya.email);
  if (u.hash && hashSandi(String(m.lama || ''), u.garam) !== u.hash) throw new GalatPengguna(400, 'Sandi lama salah.');
  u.garam = crypto.randomBytes(16).toString('hex');
  u.hash = hashSandi(baru, u.garam);
  delete u.wajibGantiSandi;
  await tulis('pengguna', pengguna);
  return { ok: true };
});

daftar('GET', /^\/api\/pengurus\/akun$/, async ({ req }) => {
  await wajibPengurus(req, 'admin');
  return { akun: (await baca('pengguna', [])).map(u => ({ email: u.email, nama: u.nama, peran: u.peran, dibuat: u.dibuat, pakaiSandi: !!u.hash })) };
});

daftar('POST', /^\/api\/pengurus\/akun$/, async ({ req }) => {
  const saya = await wajibPengurus(req, 'admin');
  const m = await bacaBadan(req, 4096);
  const email = teks(m.email, 120).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new GalatPengguna(400, 'Email tidak valid.');
  const sandi = String(m.sandi || '');
  if (sandi && sandi.length < 10) throw new GalatPengguna(400, 'Sandi awal minimal 10 karakter, atau kosongkan bila anggota masuk dengan Google.');
  const pengguna = await baca('pengguna', []);
  if (pengguna.some(u => u.email === email)) throw new GalatPengguna(409, 'Email itu sudah terdaftar.');
  if (m.peran === 'pemilik' && saya.peran !== 'pemilik') throw new GalatPengguna(403, 'Hanya pemilik yang bisa menambah pemilik.');
  const akun = { email, nama: teks(m.nama, 60) || email, peran: ['admin', 'pemilik'].includes(m.peran) ? m.peran : 'pengurus', dibuat: new Date().toISOString() };
  if (sandi) {
    akun.garam = crypto.randomBytes(16).toString('hex');
    akun.hash = hashSandi(sandi, akun.garam);
    akun.wajibGantiSandi = true;
  }
  pengguna.push(akun);
  await tulis('pengguna', pengguna);
  return { ok: true };
});

daftar('DELETE', /^\/api\/pengurus\/akun\/(.+)$/, async ({ req, cocok }) => {
  const saya = await wajibPengurus(req, 'admin');
  const email = decodeURIComponent(cocok[1]).toLowerCase();
  if (email === saya.email) throw new GalatPengguna(400, 'Anda tidak bisa menghapus akun sendiri.');
  const target = (await baca('pengguna', [])).find(u => u.email === email);
  if (target && target.peran === 'pemilik' && saya.peran !== 'pemilik') throw new GalatPengguna(403, 'Akun pemilik hanya bisa dihapus oleh pemilik.');
  const pengguna = (await baca('pengguna', [])).filter(u => u.email !== email);
  await tulis('pengguna', pengguna);
  return { ok: true };
});

daftar('GET', /^\/api\/pengurus\/listing$/, async ({ req }) => {
  await wajibPengurus(req);
  const semua = await baca('listing', []);
  return { listing: [...semua].sort((a, b) => String(b.diubah || b.dibuat).localeCompare(String(a.diubah || a.dibuat))) };
});

daftar('POST', /^\/api\/pengurus\/listing$/, async ({ req }) => {
  const saya = await wajibPengurus(req);
  const m = await bacaBadan(req, 256 * 1024);
  const semua = await baca('listing', []);
  const l = rapikanListing(m, { status: 'tersedia', unggulan: false, terbit: true, foto: [], video: [], fitur: [], deskripsi: [] });
  if (!l.jenis || !l.tipe) throw new GalatPengguna(400, 'Pilih jenis (sewa/jual) dan tipe properti.');
  if (!l.lokasi || !l.lokasi.kabupaten) throw new GalatPengguna(400, 'Pilih provinsi dan kabupaten/kota.');
  l.kode = await kodeBaru(semua, l.lokasi.kabupaten);
  if (!l.judul) l.judul = (l.jenis === 'jual' ? 'Dijual ' : 'Disewakan ') + l.tipe.charAt(0).toUpperCase() + l.tipe.slice(1) + (l.lokasi.area ? ' di ' + l.lokasi.area : '');
  l.dibuat = l.diubah = new Date().toISOString().slice(0, 19);
  l.oleh = saya.email;
  if (m.internal) l.internal = rapikanInternal(m.internal, null, saya.email);
  semua.push(l);
  await tulis('listing', semua);
  return { listing: l };
});

daftar('PUT', /^\/api\/pengurus\/listing\/([A-Za-z0-9-]{3,16})$/, async ({ req, cocok }) => {
  const saya = await wajibPengurus(req);
  const m = await bacaBadan(req, 256 * 1024);
  const semua = await baca('listing', []);
  const i = semua.findIndex(x => x.kode === cocok[1]);
  if (i < 0) throw new GalatPengguna(404, 'Listing tidak ditemukan.');
  const l = rapikanListing(m, semua[i]);
  if (m.internal) l.internal = rapikanInternal(m.internal, semua[i].internal, saya.email);
  l.kode = semua[i].kode;
  l.diubah = new Date().toISOString().slice(0, 19);
  l.oleh = saya.email;
  semua[i] = l;
  await tulis('listing', semua);
  return { listing: l };
});

daftar('DELETE', /^\/api\/pengurus\/listing\/([A-Za-z0-9-]{3,16})$/, async ({ req, cocok }) => {
  await wajibPengurus(req, 'admin');
  const semua = await baca('listing', []);
  const l = semua.find(x => x.kode === cocok[1]);
  if (!l) throw new GalatPengguna(404, 'Listing tidak ditemukan.');
  await tulis('listing', semua.filter(x => x.kode !== cocok[1]));
  for (const u of [...(l.foto || []), ...(l.video || []).map(v => v.url)]) await hapusMedia(u);
  return { ok: true };
});

daftar('POST', /^\/api\/pengurus\/media$/, async ({ req }) => {
  await wajibPengurus(req);
  if (!/multipart\/form-data/.test(String(req.headers['content-type']))) throw new GalatPengguna(400, 'Kirim sebagai unggahan berkas.');
  return terimaUnggahan(req);
});

daftar('DELETE', /^\/api\/pengurus\/media$/, async ({ req, q }) => {
  await wajibPengurus(req);
  return { ok: await hapusMedia(String(q.url || '')) };
});

daftar('GET', /^\/api\/pengurus\/booking$/, async ({ req }) => {
  await wajibPengurus(req);
  const b = await baca('booking', []);
  return { booking: [...b].sort((x, y) => (y.tanggal + y.jam).localeCompare(x.tanggal + x.jam)) };
});

daftar('PATCH', /^\/api\/pengurus\/booking\/([a-f0-9]{10})$/, async ({ req, cocok }) => {
  await wajibPengurus(req);
  const m = await bacaBadan(req, 4096);
  const semua = await baca('booking', []);
  const b = semua.find(x => x.id === cocok[1]);
  if (!b) throw new GalatPengguna(404, 'Jadwal tidak ditemukan.');
  if (m.status) { if (!STATUS_BOOKING.includes(m.status)) throw new GalatPengguna(400, 'Status tidak dikenali.'); b.status = m.status; }
  if ('catatan' in m) b.catatan = teks(m.catatan, 500);
  b.diubah = new Date().toISOString();
  await tulis('booking', semua);
  return { booking: b };
});

// Catatan tim: kanal mana yang sudah memuat listing ini. Disimpan terpisah
// dari isian listing supaya "Simpan" di penyunting tidak menghapusnya.
const KANAL_POSTING = ['instagram', 'tiktok', 'facebook', 'website'];
daftar('PATCH', /^\/api\/pengurus\/listing\/([A-Za-z0-9-]{3,16})\/posting$/, async ({ req, cocok }) => {
  const saya = await wajibPengurus(req);
  const m = await bacaBadan(req, 2048);
  if (!KANAL_POSTING.includes(m.kanal)) throw new GalatPengguna(400, 'Kanal tidak dikenali.');
  const semua = await baca('listing', []);
  const l = semua.find(x => x.kode === cocok[1]);
  if (!l) throw new GalatPengguna(404, 'Listing tidak ditemukan.');
  l.posting = Object.assign({}, l.posting);
  if (m.sudah) {
    const tautan = typeof m.tautan === 'string' && /^https:\/\//.test(m.tautan) && m.tautan.length < 400 ? m.tautan : null;
    l.posting[m.kanal] = { tanggal: new Date().toISOString().slice(0, 19), oleh: saya.email, tautan };
  } else delete l.posting[m.kanal];
  await tulis('listing', semua);
  return { posting: l.posting };
});

daftar('GET', /^\/api\/pengurus\/sosmed\/([A-Za-z0-9-]{3,16})$/, async ({ req, cocok }) => {
  await wajibPengurus(req);
  const l = (await baca('listing', [])).find(x => x.kode === cocok[1]);
  if (!l) throw new GalatPengguna(404, 'Listing tidak ditemukan.');
  return bahanSosmed(l);
});


// ---------------------------------------------------------------- zip (store)
const MANUAL = Symbol('jawaban-sudah-dikirim');
async function kirimZip(res, namaFolder, keterangan, berkas, cors) {
  const zlib = require('zlib');
  // Lintasan 1: ukuran + CRC tiap berkas dihitung bertahap dari disk (video
  // bisa ratusan MB, jangan dimuat utuh ke memori).
  const isi = [{ nama: 'keterangan.txt', data: keterangan, ukuran: keterangan.length, crc: zlib.crc32(keterangan) >>> 0 }];
  for (const f of berkas) {
    try {
      let crc = 0, ukuran = 0;
      for await (const pot of fs.createReadStream(f.jalur)) { crc = zlib.crc32(pot, crc); ukuran += pot.length; }
      isi.push({ nama: f.nama, jalur: f.jalur, ukuran, crc: crc >>> 0 });
    } catch (_) { /* berkas hilang: lewati */ }
  }
  const pusat = [];
  let offset = 0;
  for (const f of isi) {
    const nama = Buffer.from(namaFolder + '/' + f.nama, 'utf8');
    const lokal = Buffer.alloc(30);
    lokal.writeUInt32LE(0x04034b50, 0); lokal.writeUInt16LE(20, 4); lokal.writeUInt16LE(0x0800, 6);
    lokal.writeUInt32LE(f.crc, 14); lokal.writeUInt32LE(f.ukuran, 18); lokal.writeUInt32LE(f.ukuran, 22);
    lokal.writeUInt16LE(nama.length, 26);
    const p = Buffer.alloc(46);
    p.writeUInt32LE(0x02014b50, 0); p.writeUInt16LE(20, 4); p.writeUInt16LE(20, 6); p.writeUInt16LE(0x0800, 8);
    p.writeUInt32LE(f.crc, 16); p.writeUInt32LE(f.ukuran, 20); p.writeUInt32LE(f.ukuran, 24);
    p.writeUInt16LE(nama.length, 28); p.writeUInt32LE(offset, 42);
    f.kepala = Buffer.concat([lokal, nama]);
    pusat.push(p, nama);
    offset += 30 + nama.length + f.ukuran;
  }
  const ukPusat = pusat.reduce((n, x) => n + x.length, 0);
  const akhir = Buffer.alloc(22);
  akhir.writeUInt32LE(0x06054b50, 0); akhir.writeUInt16LE(isi.length, 8); akhir.writeUInt16LE(isi.length, 10);
  akhir.writeUInt32LE(ukPusat, 12); akhir.writeUInt32LE(offset, 16);
  res.writeHead(200, Object.assign({}, cors, {
    'Content-Type': 'application/zip', 'Content-Length': offset + ukPusat + 22, 'Cache-Control': 'no-store',
    'Content-Disposition': 'attachment; filename="' + namaFolder + '.zip"',
    'Access-Control-Expose-Headers': 'Content-Disposition, Content-Length',
  }));
  const tulisKe = async x => { if (!res.write(x)) await new Promise(r => res.once('drain', r)); };
  for (const f of isi) {
    await tulisKe(f.kepala);
    if (f.data) await tulisKe(f.data);
    else for await (const pot of fs.createReadStream(f.jalur)) await tulisKe(pot);
  }
  for (const x of [...pusat, akhir]) await tulisKe(x);
  res.end();
}

// ---------------------------------------------------------------- bahan posting (mode simpel)
// Pengurus cukup memberi nama + keterangan lalu memilih foto/video. Tiap bahan
// punya folder sendiri di MEDIA_DIR/bahan/<slug>-<id>/ supaya tidak bercampur.
function slugNama(t) {
  return String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'bahan';
}
function bolehUbahBahan(saya, b) { return saya.peran === 'admin' || saya.peran === 'pemilik' || b.oleh === saya.email; }

daftar('GET', /^\/api\/pengurus\/bahan$/, async ({ req }) => {
  await wajibPengurus(req);
  const semua = await baca('bahan', []);
  return { bahan: [...semua].sort((a, b) => String(b.dibuat).localeCompare(String(a.dibuat))) };
});

daftar('POST', /^\/api\/pengurus\/bahan$/, async ({ req }) => {
  const saya = await wajibPengurus(req);
  const m = await bacaBadan(req, 16 * 1024);
  const nama = teks(m.nama, 100);
  if (!nama) throw new GalatPengguna(400, 'Isi nama properti dulu. Nama ini jadi nama foldernya.');
  const semua = await baca('bahan', []);
  const id = crypto.randomBytes(4).toString('hex');
  const b = { id, nama, keterangan: teks(m.keterangan, 4000) || '', folder: slugNama(nama) + '-' + id, media: [],
    oleh: saya.email, olehNama: saya.nama || saya.email, dibuat: new Date().toISOString().slice(0, 19), selesai: false };
  semua.push(b);
  await tulis('bahan', semua);
  return { bahan: b };
});

daftar('PATCH', /^\/api\/pengurus\/bahan\/([a-f0-9]{8})$/, async ({ req, cocok }) => {
  const saya = await wajibPengurus(req);
  const m = await bacaBadan(req, 16 * 1024);
  const semua = await baca('bahan', []);
  const b = semua.find(x => x.id === cocok[1]);
  if (!b) throw new GalatPengguna(404, 'Folder bahan tidak ditemukan.');
  if ('selesai' in m) { b.selesai = !!m.selesai; b.selesaiOleh = b.selesai ? saya.email : null; }
  if ('nama' in m || 'keterangan' in m) {
    if (!bolehUbahBahan(saya, b)) throw new GalatPengguna(403, 'Hanya pengunggah atau admin yang bisa mengubah isi folder ini.');
    if ('nama' in m) b.nama = teks(m.nama, 100) || b.nama;
    if ('keterangan' in m) b.keterangan = teks(m.keterangan, 4000) || '';
  }
  b.diubah = new Date().toISOString().slice(0, 19);
  await tulis('bahan', semua);
  return { bahan: b };
});

daftar('POST', /^\/api\/pengurus\/bahan\/([a-f0-9]{8})\/media$/, async ({ req, cocok }) => {
  const saya = await wajibPengurus(req);
  if (!/multipart\/form-data/.test(String(req.headers['content-type']))) throw new GalatPengguna(400, 'Kirim sebagai unggahan berkas.');
  const b0 = (await baca('bahan', [])).find(x => x.id === cocok[1]);
  if (!b0) throw new GalatPengguna(404, 'Folder bahan tidak ditemukan.');
  if (!bolehUbahBahan(saya, b0)) throw new GalatPengguna(403, 'Hanya pengunggah atau admin yang bisa menambah berkas ke folder ini.');
  if ((b0.media || []).length >= 80) throw new GalatPengguna(400, 'Satu folder maksimal 80 berkas. Buat folder baru.');
  const hasil = await terimaUnggahan(req, BATAS_VIDEO, 'bahan/' + b0.folder);
  const semua = await baca('bahan', []);
  const b = semua.find(x => x.id === cocok[1]);
  if (!b) { await hapusMedia(hasil.url); throw new GalatPengguna(404, 'Folder bahan sudah dihapus.'); }
  b.media.push({ url: hasil.url, jenis: hasil.jenis, ukuran: hasil.ukuran, nama: hasil.namaAsli || null });
  b.diubah = new Date().toISOString().slice(0, 19);
  await tulis('bahan', semua);
  return { bahan: b };
});

daftar('DELETE', /^\/api\/pengurus\/bahan\/([a-f0-9]{8})\/media$/, async ({ req, cocok, q }) => {
  const saya = await wajibPengurus(req);
  const semua = await baca('bahan', []);
  const b = semua.find(x => x.id === cocok[1]);
  if (!b) throw new GalatPengguna(404, 'Folder bahan tidak ditemukan.');
  if (!bolehUbahBahan(saya, b)) throw new GalatPengguna(403, 'Hanya pengunggah atau admin yang bisa menghapus berkas ini.');
  const url = String(q.url || '');
  if (!b.media.some(x => x.url === url)) throw new GalatPengguna(404, 'Berkas tidak ada di folder ini.');
  b.media = b.media.filter(x => x.url !== url);
  await hapusMedia(url);
  await tulis('bahan', semua);
  return { bahan: b };
});

daftar('DELETE', /^\/api\/pengurus\/bahan\/([a-f0-9]{8})$/, async ({ req, cocok }) => {
  const saya = await wajibPengurus(req);
  const semua = await baca('bahan', []);
  const b = semua.find(x => x.id === cocok[1]);
  if (!b) throw new GalatPengguna(404, 'Folder bahan tidak ditemukan.');
  if (!bolehUbahBahan(saya, b)) throw new GalatPengguna(403, 'Hanya pengunggah atau admin yang bisa menghapus folder ini.');
  for (const x of b.media) await hapusMedia(x.url);
  await fsp.rmdir(path.join(MEDIA_DIR, 'bahan', b.folder)).catch(() => {});
  await tulis('bahan', semua.filter(x => x.id !== b.id));
  return { ok: true };
});

// Unduh satu folder sebagai ZIP (tanpa kompresi: foto/video sudah terkompres).
daftar('GET', /^\/api\/pengurus\/bahan\/([a-f0-9]{8})\/zip$/, async ({ req, res, cocok }) => {
  await wajibPengurus(req);
  const b = (await baca('bahan', [])).find(x => x.id === cocok[1]);
  if (!b) throw new GalatPengguna(404, 'Folder bahan tidak ditemukan.');
  const dipakai = new Set();
  const berkas = b.media.map((x, i) => {
    const rel = x.url.slice(MEDIA_URL.length + 1);
    let nama = String(i + 1).padStart(2, '0') + '-' + (x.jenis === 'video' ? 'video' : 'foto') + path.extname(rel);
    while (dipakai.has(nama)) nama = '_' + nama;
    dipakai.add(nama);
    return { jalur: path.join(MEDIA_DIR, rel), nama };
  });
  const ket = Buffer.from(b.nama + '\r\n\r\n' + (b.keterangan || '') + '\r\n', 'utf8');
  await kirimZip(res, b.folder, ket, berkas, corsUntuk(req));
  return MANUAL;
});

// ---------------------------------------------------------------- server
const server = http.createServer(async (req, res) => {
  const cors = corsUntuk(req);
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const url = new URL(req.url, 'http://x');
  const q = Object.fromEntries(url.searchParams);
  for (const r of rute) {
    if (r.metode !== req.method) continue;
    const cocok = url.pathname.match(r.pola);
    if (!cocok) continue;
    try {
      const hasil = await r.fungsi({ req, res, q, cocok, ip: ipDari(req) });
      if (hasil === MANUAL) return;
      return kirim(res, 200, hasil, cors);
    } catch (e) {
      if (e instanceof GalatPengguna) return kirim(res, e.status, { galat: e.message }, cors);
      console.error('[sewain]', req.method, url.pathname, e);
      return kirim(res, 500, { galat: 'Terjadi kesalahan di server. Coba lagi sebentar.' }, cors);
    }
  }
  kirim(res, 404, { galat: 'Alamat tidak dikenal.' }, cors);
});

(async () => {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(MEDIA_DIR, { recursive: true, mode: 0o755 });
  await siapkanAdminAwal();
  server.requestTimeout = 30 * 60e3;          // unggahan video lewat jaringan seluler bisa lama
  server.headersTimeout = 60e3;
  server.listen(PORT, '127.0.0.1', () => console.log('[sewain] API siap di 127.0.0.1:' + PORT, AI_KUNCI ? '(AI aktif)' : '(tanpa AI)'));
})();
