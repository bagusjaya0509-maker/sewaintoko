// Membaca halaman yang dirender JS: tautan, gaya penting, struktur bagian.
//   node alat/pelajari.mjs <url> [lebar]
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/Admin/Documents/Obsidian Vault/Jadi Trader Tools/Pemasaran/video/package.json');
const puppeteer = require('puppeteer-core');
const [url, lebar = '1440'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const p = await b.newPage();
await p.setViewport({ width: Number(lebar), height: 900, isMobile: Number(lebar) < 600, hasTouch: Number(lebar) < 600 });
await p.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
await new Promise(r => setTimeout(r, 1500));
const hasil = await p.evaluate(() => {
  const gaya = el => { if (!el) return null; const c = getComputedStyle(el); return { font: c.fontFamily.split(',')[0], size: c.fontSize, weight: c.fontWeight, tt: c.textTransform, ls: c.letterSpacing, color: c.color, bg: c.backgroundColor, lh: c.lineHeight, radius: c.borderRadius, pad: c.padding, h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width) }; };
  const pertama = s => document.querySelector(s);
  const tautan = [...new Set([...document.querySelectorAll('a[href]')].map(a => a.href.split('#')[0]))].filter(h => h.includes(location.host)).slice(0, 80);
  const bagian = [...document.querySelectorAll('section, header, footer')].map(s => ({ tag: s.tagName, kelas: String(s.className).slice(0, 60), h: Math.round(s.getBoundingClientRect().height), bg: getComputedStyle(s).backgroundColor, judul: (s.querySelector('h1,h2,h3')?.innerText || '').slice(0, 60) }));
  return {
    tautan, bagian,
    body: gaya(document.body), h1: gaya(pertama('h1')), h2: gaya(pertama('h2')), h3: gaya(pertama('h3')),
    nav: gaya(pertama('header nav a, nav a')), tombol: gaya([...document.querySelectorAll('a,button')].find(x => /talk to us/i.test(x.innerText))),
    kartu: gaya(pertama('[class*=card], [class*=property]')),
    eyebrow: [...document.querySelectorAll('p,span,div')].filter(e => e.children.length === 0 && /^(HANDPICKED|EXPLORE|WHY|CLIENT|WHAT WE|MARKET|INVESTMENT)/i.test(e.innerText.trim())).slice(0, 3).map(gaya),
  };
});
console.log(JSON.stringify(hasil, null, 1));
await b.close();
