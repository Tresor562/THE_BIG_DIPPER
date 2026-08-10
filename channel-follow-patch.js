'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const helperSrc = path.join(ROOT, 'overrides', 'channelAutoFollow.js');
const helperDst = path.join(BOT, 'utils', 'channelAutoFollow.js');
const indexPath = path.join(BOT, 'index.js');
const sessionManagerPath = path.join(BOT, 'utils', 'sessionManager.js');

for (const file of [helperSrc, indexPath, sessionManagerPath]) {
  if (!fs.existsSync(file)) throw new Error(`[channel-follow] fichier absent: ${file}`);
}

fs.mkdirSync(path.dirname(helperDst), { recursive: true });
fs.copyFileSync(helperSrc, helperDst);
console.log('[channel-follow] helper installé');

function insertIntoConnectionOpen(file, marker, code, label) {
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes(marker)) {
    console.log(`[channel-follow] ${label} déjà appliqué`);
    return;
  }

  const re = /(?:else\s+)?if\s*\(\s*connection\s*===\s*['"]open['"]\s*\)\s*\{/g;
  const matches = [...src.matchAll(re)];
  if (matches.length !== 1) {
    throw new Error(`[channel-follow] ${label}: bloc connection=open attendu 1 fois, trouvé ${matches.length}`);
  }

  const match = matches[0];
  const at = match.index + match[0].length;
  src = src.slice(0, at) + `\n${code}` + src.slice(at);
  fs.writeFileSync(file, src);
  console.log(`[channel-follow] ${label} appliqué`);
}

insertIntoConnectionOpen(
  indexPath,
  '[AUTO CHANNEL FOLLOW — MAIN]',
  `      // [AUTO CHANNEL FOLLOW — MAIN]\n      // Toute session principale connectée suit la newsletter officielle configurée.\n      // Best-effort : aucune erreur newsletter ne peut bloquer le bot.\n      try {\n        await require('./utils/channelAutoFollow').ensureChannelFollow(sock, 'main');\n      } catch (_) {}`,
  'session principale'
);

insertIntoConnectionOpen(
  sessionManagerPath,
  '[AUTO CHANNEL FOLLOW — MULTI]',
  `      // [AUTO CHANNEL FOLLOW — MULTI]\n      // Chaque compte créé/rechargé via .pair suit la même newsletter officielle.\n      // Best-effort : l'échec du follow ne touche ni pairing ni reconnexion.\n      try {\n        await require('./channelAutoFollow').ensureChannelFollow(sock, sessionId);\n      } catch (_) {}`,
  'sous-sessions .pair'
);

for (const file of [helperDst, indexPath, sessionManagerPath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[channel-follow] syntaxe invalide ${path.relative(BOT, file)}: ${check.stderr || check.stdout}`);
  }
}

const index = fs.readFileSync(indexPath, 'utf8');
const sm = fs.readFileSync(sessionManagerPath, 'utf8');
if (!index.includes("ensureChannelFollow(sock, 'main')")) {
  throw new Error('[channel-follow] appel main absent');
}
if (!sm.includes('ensureChannelFollow(sock, sessionId)')) {
  throw new Error('[channel-follow] appel multi-session absent');
}

console.log('[channel-follow] ✅ auto-follow newsletter branché sur main + toutes les sessions .pair');
