'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const baseFile = path.join(ROOT, 'overrides', 'menu-image-block.txt');
const reportFile = path.join(ROOT, 'menu-image-audit.json');

function extractUrls(text) {
  const out = [];
  const re = /['"](https?:\/\/[^'"\s]+)['"]/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
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
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/const urls\s*=\s*\[([\s\S]*?)\];/);
  return m ? extractUrls(m[1]) : null;
}

async function checkUrl(style, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 THE-BIG-DIPPER-menu-audit' },
    });
    const type = res.headers.get('content-type') || '';
    const data = await res.arrayBuffer();
    const bytes = data.byteLength;
    const imageType = /^image\//i.test(type);
    const ok = res.ok && imageType && bytes > 1000;
    return {
      style, url, ok, status: res.status, contentType: type,
      bytes, finalUrl: res.url,
      error: ok ? null : (!res.ok ? `HTTP ${res.status}` : !imageType ? `content-type ${type || 'absent'}` : `image trop petite (${bytes} octets)`),
    };
  } catch (err) {
    return { style, url, ok: false, status: null, contentType: '', bytes: 0, finalUrl: null, error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function runPool(items, concurrency = 8) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index];
      results[index] = await checkUrl(item.style, item.url);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

(async () => {
  const styles = readBaseStyles();
  // Ces styles sont remplacés pendant le build par leurs fichiers patch.
  for (let style = 15; style <= 20; style++) {
    const patched = readPatchedStyle(style);
    if (patched?.length) styles.set(style, patched);
  }

  const missingStyles = [];
  const items = [];
  for (let style = 0; style <= 20; style++) {
    const urls = [...new Set(styles.get(style) || [])];
    if (!urls.length) missingStyles.push(style);
    for (const url of urls) items.push({ style, url });
  }

  const results = await runPool(items, 8);
  for (const r of results) {
    console.log(`[menu-images] style=${r.style} ${r.ok ? 'OK' : 'KO'} ${r.url} HTTP=${r.status ?? '-'} bytes=${r.bytes} type=${r.contentType || '-'}${r.error ? ` error=${r.error}` : ''}`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    missingStyles,
    total: results.length,
    ok: results.filter(r => r.ok).length,
    ko: results.filter(r => !r.ok).length,
    results,
  };
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`[menu-images] TOTAL=${report.total} OK=${report.ok} KO=${report.ko} SANS_IMAGE=${missingStyles.join(',') || 'aucun'}`);
  process.exitCode = 0;
})().catch(err => {
  console.error('[menu-images] fatal:', err.stack || err.message);
  process.exit(1);
});
