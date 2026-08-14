'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const helperSrc = path.join(ROOT, 'overrides', 'channelAutoReact.js');
const helperDst = path.join(BOT, 'utils', 'channelAutoReact.js');
const secondaryHelperSrc = path.join(ROOT, 'overrides', 'channelSecondaryReact.js');
const secondaryHelperDst = path.join(BOT, 'utils', 'channelSecondaryReact.js');
const indexPath = path.join(BOT, 'index.js');
const sessionManagerPath = path.join(BOT, 'utils', 'sessionManager.js');

for (const file of [helperSrc, secondaryHelperSrc, indexPath, sessionManagerPath]) {
  if (!fs.existsSync(file)) throw new Error(`[channel-react] fichier absent: ${file}`);
}

fs.mkdirSync(path.dirname(helperDst), { recursive: true });
fs.copyFileSync(helperSrc, helperDst);
fs.copyFileSync(secondaryHelperSrc, secondaryHelperDst);
console.log('[channel-react] helpers principal + universel multi-session installés');

let index = fs.readFileSync(indexPath, 'utf8');
const marker = '[AUTO CHANNEL REACT — MAIN]';

if (!index.includes(marker)) {
  const followBlock = `      try {\n        await require('./utils/channelAutoFollow').ensureChannelFollow(sock, 'main');\n      } catch (_) {}`;
  const count = index.split(followBlock).length - 1;
  if (count !== 1) {
    throw new Error(`[channel-react] bloc auto-follow main attendu 1 fois, trouvé ${count}. Vérifie l'ordre: channel-follow-patch.js doit passer avant.`);
  }

  const reactionBlock = `${followBlock}\n\n      // [AUTO CHANNEL REACT — MAIN]\n      try {\n        await require('./utils/channelAutoReact').installMainChannelAutoReact(sock);\n      } catch (err) {\n        console.warn('[ChannelReact] ⚠️ Installation impossible:', err?.message || err);\n      }`;

  index = index.replace(followBlock, reactionBlock);
  fs.writeFileSync(indexPath, index);
  console.log('[channel-react] listener main branché après auto-follow');
} else {
  console.log('[channel-react] listener main déjà branché');
}

let sessionManager = fs.readFileSync(sessionManagerPath, 'utf8');
const secondaryMarker = '[AUTO CHANNEL REACT — ALL SECONDARIES]';
const oldSecondaryMarker = '[AUTO CHANNEL REACT — OWNER SECONDARIES]';

if (sessionManager.includes(oldSecondaryMarker)) {
  sessionManager = sessionManager.replace(oldSecondaryMarker, secondaryMarker);
  sessionManager = sessionManager.replace(
    /\/\/ Seules les sous-sessions appairées par un owner\/supreme owner autorisé[\s\S]*?\/\/ restent totalement exclues de ce mécanisme\.\n/,
    '// Toute sous-session ouverte reçoit les réactions newsletter, quelle que soit son origine.\n'
  );
  fs.writeFileSync(sessionManagerPath, sessionManager);
  console.log('[channel-react] ancien marqueur owner converti en mode universel');
}

sessionManager = fs.readFileSync(sessionManagerPath, 'utf8');
if (!sessionManager.includes(secondaryMarker)) {
  const anchor = `      // ── Initialisation des features par session ────────────────────────\n      try { handler.initializeAntiCall(sock); } catch {}`;
  const count = sessionManager.split(anchor).length - 1;
  if (count !== 1) {
    throw new Error(`[channel-react] ancre features session attendue 1 fois, trouvée ${count}`);
  }

  const replacement = `${anchor}\n\n      // [AUTO CHANNEL REACT — ALL SECONDARIES]\n      // Toutes les sous-sessions réagissent à la chaîne officielle, sans\n      // filtre owner/origin : WhatsApp, Web, Telegram, dashboard, restauration\n      // Mongo et reconnexion automatique convergent ici.\n      try {\n        await require('./channelSecondaryReact').installSecondaryChannelAutoReact(sock, {\n          sessionId,\n          phoneNumber: String(phoneNumber).replace(/\\D/g, ''),\n          owner: opts.owner,\n          origin: opts.origin,\n        });\n      } catch (err) {\n        console.warn(\`[SecondaryChannelReact] ⚠️ \${sessionId}: installation impossible: \${err?.message || err}\`);\n      }`;

  sessionManager = sessionManager.replace(anchor, replacement);
  fs.writeFileSync(sessionManagerPath, sessionManager);
  console.log('[channel-react] listener universel branché dans sessionManager');
} else {
  console.log('[channel-react] listener universel déjà branché');
}

for (const file of [helperDst, secondaryHelperDst, indexPath, sessionManagerPath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[channel-react] syntaxe invalide ${path.relative(BOT, file)}: ${check.stderr || check.stdout}`);
  }
}

index = fs.readFileSync(indexPath, 'utf8');
sessionManager = fs.readFileSync(sessionManagerPath, 'utf8');
if (!index.includes('installMainChannelAutoReact(sock)')) {
  throw new Error('[channel-react] appel principal absent après patch');
}
if (!sessionManager.includes('installSecondaryChannelAutoReact(sock')) {
  throw new Error('[channel-react] appel secondaires absent après patch');
}
if (!sessionManager.includes(secondaryMarker)) {
  throw new Error('[channel-react] marqueur universel secondaires absent');
}
if (sessionManager.includes('session non créée par un owner autorisé')) {
  throw new Error('[channel-react] filtre owner historique encore présent');
}

console.log('[channel-react] ✅ auto-réactions activées sur main + toutes les sous-sessions, toutes origines');
