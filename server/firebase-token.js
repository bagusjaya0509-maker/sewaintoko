'use strict';
/*
 * Verifikasi ID token Firebase Authentication TANPA kredensial admin.
 *
 * Token login (Google atau email) ditandatangani Google dengan RS256. Kunci
 * publiknya diterbitkan sebagai sertifikat X.509 di alamat tetap di bawah,
 * jadi server cukup mengunduh sertifikat itu (ditembolok sesuai Cache-Control)
 * lalu memeriksa tanda tangan + klaim sesuai dokumentasi Firebase:
 * https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
 */
const crypto = require('crypto');

const ALAMAT_SERTIFIKAT = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let sertifikat = null, kedaluwarsaSertifikat = 0, sedangMengambil = null;

async function ambilSertifikat() {
  if (sertifikat && Date.now() < kedaluwarsaSertifikat) return sertifikat;
  if (sedangMengambil) return sedangMengambil;
  sedangMengambil = (async () => {
    const r = await fetch(ALAMAT_SERTIFIKAT);
    if (!r.ok) throw new Error('sertifikat Google tidak terjangkau: ' + r.status);
    const umur = Number((String(r.headers.get('cache-control') || '').match(/max-age=(\d+)/) || [])[1]) || 3600;
    sertifikat = await r.json();
    kedaluwarsaSertifikat = Date.now() + Math.min(umur, 6 * 3600) * 1000;
    return sertifikat;
  })().finally(() => { sedangMengambil = null; });
  return sedangMengambil;
}

const b64url = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** Mengembalikan klaim token bila sah, null bila tidak. Tidak pernah melempar
 *  untuk token yang rusak - hanya untuk kegagalan jaringan mengambil sertifikat. */
async function verifikasiIdToken(token, proyek) {
  if (!proyek || typeof token !== 'string') return null;
  const bagian = token.split('.');
  if (bagian.length !== 3) return null;
  let kepala, klaim;
  try { kepala = JSON.parse(b64url(bagian[0]).toString('utf8')); klaim = JSON.parse(b64url(bagian[1]).toString('utf8')); }
  catch (_) { return null; }
  if (kepala.alg !== 'RS256' || !kepala.kid) return null;

  const daftar = await ambilSertifikat();
  const pem = daftar[kepala.kid];
  if (!pem) return null;
  const sah = crypto.verify('RSA-SHA256', Buffer.from(bagian[0] + '.' + bagian[1]), pem, b64url(bagian[2]));
  if (!sah) return null;

  const kini = Math.floor(Date.now() / 1000);
  if (klaim.aud !== proyek) return null;
  if (klaim.iss !== 'https://securetoken.google.com/' + proyek) return null;
  if (!klaim.sub || typeof klaim.sub !== 'string' || klaim.sub.length > 128) return null;
  if (!(klaim.exp > kini)) return null;
  if (!(klaim.iat <= kini + 300)) return null;           // toleransi jam server 5 menit
  if (klaim.auth_time && klaim.auth_time > kini + 300) return null;
  return {
    uid: klaim.sub,
    email: typeof klaim.email === 'string' ? klaim.email.toLowerCase() : null,
    emailTerverifikasi: klaim.email_verified === true,
    nama: typeof klaim.name === 'string' ? klaim.name.slice(0, 80) : null,
    foto: typeof klaim.picture === 'string' && /^https:\/\//.test(klaim.picture) ? klaim.picture.slice(0, 400) : null,
    penyedia: klaim.firebase && klaim.firebase.sign_in_provider || null,
  };
}

module.exports = { verifikasiIdToken };
