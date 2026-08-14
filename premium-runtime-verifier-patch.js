'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const verifierPath = path.join(__dirname, 'bot', 'scripts', 'verify-command-runtime.js');
const MARKER = '[PREMIUM PING VERIFIER COMPAT]';

if (!fs.existsSync(verifierPath)) {
  throw new Error(`[premium-verifier] verify-command-runtime.js absent: ${verifierPath}`);
}

let src = fs.readFileSync(verifierPath, 'utf8');

if (!src.includes(MARKER)) {
  const oldMarker = "  'menu.sendStyledMenuMessage', 'style: styleManager.getStyle()', 'withImage: false',\n]) {";
  const newMarker = "  'menu.sendStyledMenuMessage', 'style: styleManager.getStyle()',\n]) {";

  if (!src.includes(oldMarker)) {
    throw new Error('[premium-verifier] ancien contrôle withImage:false introuvable');
  }
  src = src.replace(oldMarker, newMarker);

  const anchor = "if (ping.includes('const probe = await reply') || ping.includes('{ delete: probeKey }')) {";
  if (!src.includes(anchor)) {
    throw new Error('[premium-verifier] ancre post-contrôle ping introuvable');
  }

  const compat = `// ${MARKER}\nconst pingUsesLegacyNoImage = /withImage:\\s*false/.test(ping);\nconst pingUsesPremiumImage = ping.includes('[PING SPECIAL PREMIUM PRESENTATION]') && /withImage:\\s*true/.test(ping);\nif (!pingUsesLegacyNoImage && !pingUsesPremiumImage) {\n  throw new Error('[verify-runtime] ping image mode incomplet: attendu legacy withImage:false ou premium withImage:true');\n}\n\n`;
  src = src.replace(anchor, compat + anchor);
  fs.writeFileSync(verifierPath, src, 'utf8');
}

const check = spawnSync(process.execPath, ['--check', verifierPath], { encoding: 'utf8' });
if (check.status !== 0) {
  throw new Error(`[premium-verifier] syntaxe invalide: ${check.stderr || check.stdout}`);
}

const finalSrc = fs.readFileSync(verifierPath, 'utf8');
for (const required of [MARKER, 'pingUsesLegacyNoImage', 'pingUsesPremiumImage', '[PING SPECIAL PREMIUM PRESENTATION]']) {
  if (!finalSrc.includes(required)) throw new Error(`[premium-verifier] contrôle absent: ${required}`);
}

console.log('[premium-verifier] ✅ ping legacy/premium acceptés par verify-command-runtime');
