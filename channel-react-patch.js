'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const helperSrc = path.join(ROOT, 'overrides', 'channelAutoReact.js');
const helperDst = path.join(BOT, 'utils', 'channelAutoReact.js');
const indexPath = path.join(BOT, 'index.js');
const sessionManagerPath = path.join(BOT, 'utils', 'sessionManager.js');

for (const file of [helperSrc, indexPath, sessionManagerPath]) {
  if (!fs.existsSync(file)) throw new Error(`[channel-react] fichier absent: ${file}`);
}

fs.mkdirSync(path.dirname(helperDst), { recursive: true });
fs.copyFileSync(helperSrc, helperDst);
console.log('[channel-react] helper principal installé');

let index = fs.readFileSync(indexPath, 'utf8');
const marker = '[AUTO CHANNEL REACT — MAIN ONLY]';

if (!index.includes(marker)) {
  const followBlock = `      try {\n        await require('./utils/channelAutoFollow').ensureChannelFollow(sock, 'main');\n      } catch (_) {}`;
  const count = index.split(followBlock).length - 1;
  if (count !== 1) {
    throw new Error(`[channel-react] bloc auto-follow main attendu 1 fois, trouvé ${count}. Vérifie l'ordre: channel-follow-patch.js doit passer avant.`);
  }

  const reactionBlock = `${followBlock}\n\n      // [AUTO CHANNEL REACT — MAIN ONLY]\n      // Réactions intelligentes uniquement depuis le compte principal.\n      // Les sessions .pair ne sont volontairement jamais raccordées à ce helper.\n      try {\n        await require('./utils/channelAutoReact').installMainChannelAutoReact(sock);\n      } catch (err) {\n        console.warn('[ChannelReact] ⚠️ Installation impossible:', err?.message || err);\n      }`;

  index = index.replace(followBlock, reactionBlock);
  fs.writeFileSync(indexPath, index);
  console.log('[channel-react] listener main branché après auto-follow');
} else {
  console.log('[channel-react] listener main déjà branché');
}

const sessionManager = fs.readFileSync(sessionManagerPath, 'utf8');
if (sessionManager.includes('channelAutoReact') || sessionManager.includes('installMainChannelAutoReact')) {
  throw new Error('[channel-react] sécurité: auto-réaction détectée dans sessionManager.js — refus, les sous-sessions ne doivent jamais être raccordées');
}

for (const file of [helperDst, indexPath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[channel-react] syntaxe invalide ${path.relative(BOT, file)}: ${check.stderr || check.stdout}`);
  }
}

index = fs.readFileSync(indexPath, 'utf8');
if (!index.includes("installMainChannelAutoReact(sock)")) {
  throw new Error('[channel-react] appel principal absent après patch');
}
if (!index.includes('[AUTO CHANNEL REACT — MAIN ONLY]')) {
  throw new Error('[channel-react] marqueur main-only absent');
}

console.log('[channel-react] ✅ auto-réactions newsletter activées UNIQUEMENT sur la session principale');
