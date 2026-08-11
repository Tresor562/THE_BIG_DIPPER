'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const baseFile = path.join(ROOT, 'overrides', 'menu-image-block.txt');
const healthFile = path.join(ROOT, 'menu-image-health-patch.js');
const reportFile = path.join(ROOT, 'menu-image-audit.json');

function stripComments(text) {
  return String(text || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
function extractUrls(text) {
  const out = [];
  const re = /['"](https?:\/\/[^'"\s]+)['"]/g;
  let m;
  for (const clean = stripComments(text); (m = re.exec(clean));) out.push(m[1]);
  return out;
}
function readBaseStyles() {
  const src = fs.readFileSync(baseFile, 'utf8');
  const styles = new Map();
  const re = /^\s*(\d+):\s*\[([\s\S]*?)^\s*\],/gm;
  let m;
  while ((m = re.exec(src))) styles.set(Number(m[1]), extractUrls(m[2]));
  return styles;
}
function readPatchedStyle(style) {
  const file = path.join(ROOT, `style${style}-images-patch.js`);
  if (!fs.existsSync(file)) return null;
  const m = fs.readFileSync(file, 'utf8').match(/const urls\s*=\s*\[([\s\S]*?)\];/);
  return m ? extractUrls(m[1]) : null;
}
function readRemovedUrls() {
  if (!fs.existsSync(healthFile)) return new Set();
  const src = fs.readFileSync(healthFile, 'utf8');
  const m = src.match(/const DEAD_URLS\s*=\s*\[([\s\S]*?)\];/);
  return new Set(m ? extractUrls(m[1]) : []);
}
async function checkUrl(style, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 THE-BIG-DIPPER-menu-audit' } });
    const type = res.headers.get('content-type') || '';
    const bytes = (await res.arrayBuffer()).byteLength;
    const ok = res.ok && /^image\//i.test(type) && bytes > 1000;
    return { style, url, ok, status: res.status, contentType: type, bytes, finalUrl: res.url,
      error: ok ? null : (!res.ok ? `HTTP ${res.status}` : !/^image\//i.test(type) ? `content-type ${type || 'absent'}` : `image trop petite (${bytes} octets)`) };
  } catch (err) {
    return { style, url, ok: false, status: null, contentType: '', bytes: 0, finalUrl: null,
      error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally { clearTimeout(timer); }
}
async function runPool(items, concurrency = 8) {
  const results = new Array(items.length); let cursor = 0;
  async function worker() {
    while (true) { const index = cursor++; if (index >= items.length) return;
      results[index] = await checkUrl(items[index].style, items[index].url); }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

(async () => {
  const styles = readBaseStyles();
  for (let style = 15; style <= 20; style++) {
    const patched = readPatchedStyle(style); if (patched?.length) styles.set(style, patched);
  }
  const removed = readRemovedUrls();
  const missingStyles = [], items = [];
  for (let style = 0; style <= 20; style++) {
    const urls = [...new Set(styles.get(style) || [])].filter(url => !removed.has(url));
    if (!urls.length) missingStyles.push(style);
    for (const url of urls) items.push({ style, url });
  }
  const results = await runPool(items, 8);
  for (const r of results) console.log(`[menu-images] style=${r.style} ${r.ok ? 'OK' : 'KO'} ${r.url} HTTP=${r.status ?? '-'} bytes=${r.bytes} type=${r.contentType || '-'}${r.error ? ` error=${r.error}` : ''}`);
  const report = { generatedAt: new Date().toISOString(), removedUrls: [...removed], missingStyles,
    total: results.length, ok: results.filter(r => r.ok).length, ko: results.filter(r => !r.ok).length, results };
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`[menu-images] ACTIFS=${report.total} OK=${report.ok} KO=${report.ko} RETIRÉS=${removed.size} SANS_IMAGE=${missingStyles.join(',') || 'aucun'}`);
  if (report.ko || missingStyles.length) process.exitCode = 1;
})().catch(err => { console.error('[menu-images] fatal:', err.stack || err.message); process.exit(1); });
