// Potret halaman (layar penuh) dengan Chrome tanpa kepala — untuk memeriksa
// tampilan desktop & ponsel tanpa bergantung pada lebar panel pratinjau.
//   node alat/potret.mjs <url> <keluar.png> [lebar=1440] [tinggiMaks=0]
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/Admin/Documents/Obsidian Vault/Jadi Trader Tools/Pemasaran/video/package.json');
const puppeteer = require('puppeteer-core');

const [url, keluar, lebar = '1440', tinggiMaks = '0'] = process.argv.slice(2);
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']
  .find(p => { try { return require('fs').existsSync(p); } catch (_) { return false; } });
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
const w = Number(lebar);
await p.setViewport({ width: w, height: w < 600 ? 844 : 900, deviceScaleFactor: 1, isMobile: w < 600, hasTouch: w < 600 });
const galat = [];
p.on('console', m => { if (m.type() === 'error') galat.push(m.text()); });
p.on('pageerror', e => galat.push('PAGEERROR ' + e.message));
await p.goto(url, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } scrollTo(0, 0); });
await new Promise(r => setTimeout(r, 1200));
const lebarGulir = await p.evaluate(() => document.documentElement.scrollWidth);
const tinggi = await p.evaluate(() => document.documentElement.scrollHeight);
await p.screenshot({ path: keluar, fullPage: !Number(tinggiMaks), clip: Number(tinggiMaks) ? { x: 0, y: 0, width: w, height: Number(tinggiMaks) } : undefined });
console.log(JSON.stringify({ lebarGulir, viewport: w, tinggi, galat }));
await b.close();
