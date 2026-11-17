// Akun pengunjung lewat Firebase Authentication (Google atau email + sandi).
// SDK Firebase (~100 KB) baru dimuat kalau dibutuhkan: saat pengunjung menekan
// "Masuk", atau kalau peramban ini pernah masuk sebelumnya (penanda di
// localStorage). Pengunjung biasa tidak ikut menanggung bebannya.
import { API } from './inti.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.0.2/';
const PENANDA = 'sewain.masuk';
let siap = null, auth = null, fb = null;
const pendengar = new Set();
let penggunaKini = null, profilKini = null;

const tandai = ada => { try { ada ? localStorage.setItem(PENANDA, '1') : localStorage.removeItem(PENANDA); } catch (_) {} };
export const pernahMasuk = () => { try { return localStorage.getItem(PENANDA) === '1'; } catch (_) { return false; } };

export function muatAuth() {
  if (siap) return siap;
  siap = (async () => {
    const [{ initializeApp }, a, { firebaseConfig }] = await Promise.all([
      import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import('./firebase-config.js'),
    ]);
    fb = a;
    auth = a.getAuth(initializeApp(firebaseConfig));
    auth.languageCode = 'id';
    await new Promise(ok => {
      let pertama = true;
      a.onAuthStateChanged(auth, async u => {
        penggunaKini = u;
        tandai(!!u);
        profilKini = null;
        if (u) { try { profilKini = (await apiAkun('/api/akun')).akun; } catch (_) {} }
        pendengar.forEach(f => f(u, profilKini));
        if (pertama) { pertama = false; ok(); }
      });
    });
    return auth;
  })();
  return siap;
}

/** cb(pengguna|null, profil|null) dipanggil setiap status masuk berubah. */
export function pantau(cb) {
  pendengar.add(cb);
  if (siap) siap.then(() => cb(penggunaKini, profilKini));
  else if (pernahMasuk()) muatAuth();
  else cb(null, null);
  return () => pendengar.delete(cb);
}

export const pengguna = () => penggunaKini;
export const profil = () => profilKini;

const PESAN_GALAT = {
  'auth/invalid-credential': 'Email atau sandi salah.',
  'auth/wrong-password': 'Email atau sandi salah.',
  'auth/user-not-found': 'Email itu belum terdaftar. Pilih "Buat akun".',
  'auth/email-already-in-use': 'Email itu sudah terdaftar. Silakan masuk.',
  'auth/weak-password': 'Sandi minimal 8 karakter.',
  'auth/invalid-email': 'Format email belum benar.',
  'auth/too-many-requests': 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.',
  'auth/popup-closed-by-user': 'Jendela masuk Google ditutup sebelum selesai.',
  'auth/popup-blocked': 'Peramban memblokir jendela masuk. Izinkan pop-up untuk situs ini lalu coba lagi.',
  'auth/network-request-failed': 'Tidak bisa terhubung. Periksa koneksi internet Anda.',
};
const terjemah = e => new Error(PESAN_GALAT[e && e.code] || (e && e.message) || 'Gagal masuk.');

export async function masukGoogle() {
  await muatAuth();
  const p = new fb.GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  try { return (await fb.signInWithPopup(auth, p)).user; } catch (e) { throw terjemah(e); }
}

export async function masukEmail(email, sandi) {
  await muatAuth();
  try { return (await fb.signInWithEmailAndPassword(auth, email, sandi)).user; } catch (e) { throw terjemah(e); }
}

export async function daftarEmail(nama, email, sandi) {
  await muatAuth();
  if (sandi.length < 8) throw new Error('Sandi minimal 8 karakter.');
  try {
    const u = (await fb.createUserWithEmailAndPassword(auth, email, sandi)).user;
    await fb.updateProfile(u, { displayName: nama });
    await fb.sendEmailVerification(u).catch(() => {});
    await u.getIdToken(true);
    profilKini = (await apiAkun('/api/akun', { method: 'PATCH', json: { nama } })).akun;
    pendengar.forEach(f => f(u, profilKini));
    return u;
  } catch (e) { throw e.code ? terjemah(e) : e; }
}

export async function lupaSandi(email) {
  await muatAuth();
  try { await fb.sendPasswordResetEmail(auth, email); } catch (e) { throw terjemah(e); }
}

export async function keluar() {
  await muatAuth();
  await fb.signOut(auth);
}

export async function token() {
  await muatAuth();
  return penggunaKini ? penggunaKini.getIdToken() : null;
}

/** fetch ke API Sewain dengan token Firebase. */
export async function apiAkun(jalur, pilihan = {}) {
  const t = await token();
  if (!t) { const e = new Error('Silakan masuk dulu.'); e.status = 401; throw e; }
  const kepala = Object.assign({ Authorization: 'Bearer ' + t }, pilihan.headers);
  let badan = pilihan.body;
  if (pilihan.json !== undefined) { kepala['Content-Type'] = 'application/json'; badan = JSON.stringify(pilihan.json); }
  const r = await fetch(API + jalur, { method: pilihan.method || 'GET', headers: kepala, body: badan });
  let d = {};
  try { d = await r.json(); } catch (_) {}
  if (!r.ok) { const e = new Error(d.galat || 'Permintaan gagal (' + r.status + ').'); e.status = r.status; throw e; }
  return d;
}

/** Unggah satu berkas dengan laporan kemajuan (XHR - fetch belum bisa melapor kemajuan unggah). */
export async function unggahBerkas(berkas, kemajuan) {
  const t = await token();
  return new Promise((ok, gagal) => {
    const x = new XMLHttpRequest();
    x.open('POST', API + '/api/akun/media');
    x.setRequestHeader('Authorization', 'Bearer ' + t);
    x.upload.onprogress = e => e.lengthComputable && kemajuan && kemajuan(e.loaded / e.total);
    x.onload = () => {
      let d = {};
      try { d = JSON.parse(x.responseText); } catch (_) {}
      x.status < 300 ? ok(d) : gagal(new Error(d.galat || 'Unggahan gagal (' + x.status + ').'));
    };
    x.onerror = () => gagal(new Error('Unggahan terputus. Periksa koneksi lalu coba lagi.'));
    const f = new FormData();
    f.append('berkas', berkas, berkas.name || 'foto.jpg');
    x.send(f);
  });
}

// ---------- favorit (dipakai tombol hati di kartu & halaman detail)
export const favoritSaya = () => new Set((profilKini && profilKini.favorit) || []);
export async function aturFavorit(kode, simpan) {
  const d = await apiAkun('/api/akun/favorit/' + encodeURIComponent(kode), { method: simpan ? 'POST' : 'DELETE' });
  profilKini = d.akun;
  pendengar.forEach(f => f(penggunaKini, profilKini));
  return d.akun;
}
