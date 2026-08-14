'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const files = {
  session: path.join(BOT, 'utils', 'sessionManager.js'),
  pairing: path.join(BOT, 'utils', 'pairingService.js'),
  api: path.join(BOT, 'api', 'server.js'),
  app: path.join(BOT, 'public', 'js', 'app.js'),
  html: path.join(BOT, 'public', 'index.html'),
  css: path.join(BOT, 'public', 'css', 'style.css'),
  pkg: path.join(BOT, 'package.json'),
};

for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) throw new Error(`[pairing-verify] absent: ${name} -> ${file}`);
}

for (const file of [files.session, files.pairing, files.api, files.app]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[pairing-verify] syntaxe invalide ${file}: ${check.stderr || check.stdout}`);
}

const session = fs.readFileSync(files.session, 'utf8');
const pairing = fs.readFileSync(files.pairing, 'utf8');
const api = fs.readFileSync(files.api, 'utf8');
const app = fs.readFileSync(files.app, 'utf8');
const html = fs.readFileSync(files.html, 'utf8');
const css = fs.readFileSync(files.css, 'utf8');
const pkg = JSON.parse(fs.readFileSync(files.pkg, 'utf8'));

for (const marker of [
  '[PAIRING READINESS STATE]',
  '[PAIRING QR READY]',
  '[PAIRING READINESS WAIT]',
  '[PAIRING REQUEST AFTER QR]',
  '[PAIRING RAW CODE]',
  '[PAIRING REGISTERED AFTER OPEN]',
  'waitForPairingQr,',
]) {
  if (!session.includes(marker)) throw new Error(`[pairing-verify] sessionManager garde-fou absent: ${marker}`);
}

if (/delayMs\s*=\s*opts\.delayMs\s*\?\?\s*3000/.test(session)) {
  throw new Error('[pairing-verify] ancien délai fixe 3s encore présent dans requestPairingCode');
}
if (!session.includes('await waitForPairingQr(phoneNumber, readinessTimeoutMs)')) {
  throw new Error('[pairing-verify] requestPairingCode ne dépend pas de la readiness QR');
}

for (const marker of ['[PAIRING QR FALLBACK]', 'createQrPairingSession,']) {
  if (!pairing.includes(marker)) throw new Error(`[pairing-verify] pairingService absent: ${marker}`);
}
for (const marker of ['[PAIRING QR API]', '[PAIRING QR ROUTE]', '[PAIRING QR ROUTE WIRE]']) {
  if (!api.includes(marker)) throw new Error(`[pairing-verify] API absent: ${marker}`);
}
for (const marker of ['[PAIRING QR UI]', '[PAIRING RAW COPY]', '[PAIRING COPY CLEAN]', '[PAIRING QR FALLBACK UI]']) {
  if (!app.includes(marker)) throw new Error(`[pairing-verify] frontend absent: ${marker}`);
}
if (!html.includes('id="qr-fallback-btn"') || !html.includes('id="state-qr"') || !html.includes('id="qr-image"')) {
  throw new Error('[pairing-verify] UI QR HTML incomplète');
}
if (!css.includes('[PAIRING QR STYLE]')) throw new Error('[pairing-verify] style QR absent');

if (pkg.dependencies?.['@whiskeysockets/baileys'] !== '6.7.23') {
  throw new Error(`[pairing-verify] Baileys attendu 6.7.23, trouvé ${pkg.dependencies?.['@whiskeysockets/baileys']}`);
}

console.log('[pairing-verify] ✅ readiness auth + code brut + Baileys 6.7.23 + fallback QR présents');
