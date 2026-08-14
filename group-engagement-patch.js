'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const OVERRIDES = path.join(ROOT, 'overrides');
if (!fs.existsSync(BOT)) throw new Error('[group-engagement] bot/ absent');

function copy(name, dest) {
  const src = path.join(OVERRIDES, name);
  const target = path.join(BOT, dest);
  if (!fs.existsSync(src)) throw new Error(`[group-engagement] override absent: ${src}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(src, target);
  console.log(`[group-engagement] ${dest}`);
}

function patch(rel, search, replacement, marker, label) {
  const file = path.join(BOT, rel);
  let src = fs.readFileSync(file, 'utf8');
  if (marker && src.includes(marker)) {
    console.log(`[group-engagement] ${label} déjà appliqué`);
    return;
  }
  const count = src.split(search).length - 1;
  if (count !== 1) throw new Error(`[group-engagement] ${label}: attendu 1 occurrence, trouvé ${count}`);
  src = src.replace(search, replacement);
  fs.writeFileSync(file, src, 'utf8');
  console.log(`[group-engagement] ${label} appliqué`);
}

function check(rel) {
  const file = path.join(BOT, rel);
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`[group-engagement] syntaxe ${rel}: ${r.stderr || r.stdout}`);
}

copy('groupstats.js', 'utils/groupstats.js');
copy('groupEngagement.js', 'utils/groupEngagement.js');
copy('grouplevel.js', 'commands/group_management/grouplevel.js');
copy('coupleday.js', 'commands/group_management/coupleday.js');
copy('pair.js', 'commands/bot_sovereignty/pair.js');

patch(
  'config.js',
  '      chatbot: false,\n      autosticker: false',
  '      chatbot: false,\n      grouplevel: true, // [GROUP ENGAGEMENT DEFAULT] actif par défaut\n      coupleday: true,  // [GROUP ENGAGEMENT DEFAULT] actif par défaut\n      autosticker: false',
  '[GROUP ENGAGEMENT DEFAULT]',
  'defaults grouplevel + coupleday'
);

patch(
  'handler.js',
  '    if (isGroup) addMessage(from, sender);',
  `    if (isGroup) {\n      const _levelProgress = addMessage(from, sender);\n      if (_levelProgress?.leveledUp) {\n        require('./utils/groupEngagement')\n          .handleLevelProgress(sock, msg, _levelProgress) // [GROUP LEVEL PROGRESS]\n          .catch(err => console.warn('[grouplevel] notification:', err.message));\n      }\n    }`,
  '[GROUP LEVEL PROGRESS]',
  'level-up branché au compteur existant'
);

patch(
  'index.js',
  '      handler.initializeAntiCall(sock);',
  `      handler.initializeAntiCall(sock);\n      try {\n        require('./utils/groupEngagement').startCoupleDayScheduler(sock, 'default'); // [COUPLEDAY SCHEDULER MONO]\n      } catch (err) {\n        console.warn('[coupleday] scheduler mono:', err.message);\n      }`,
  '[COUPLEDAY SCHEDULER MONO]',
  'scheduler CoupleDay mono-session'
);

patch(
  'utils/sessionManager.js',
  '      try { handler.initializeAntiCall(sock); } catch {}',
  `      try { handler.initializeAntiCall(sock); } catch {}\n      try {\n        require('./groupEngagement').startCoupleDayScheduler(sock, sessionId); // [COUPLEDAY SCHEDULER MULTI]\n      } catch (err) {\n        console.warn('[coupleday] scheduler multi:', err.message);\n      }`,
  '[COUPLEDAY SCHEDULER MULTI]',
  'scheduler CoupleDay multi-session'
);

for (const rel of [
  'utils/groupstats.js',
  'utils/groupEngagement.js',
  'commands/group_management/grouplevel.js',
  'commands/group_management/coupleday.js',
  'commands/bot_sovereignty/pair.js',
  'config.js',
  'handler.js',
  'index.js',
  'utils/sessionManager.js',
]) check(rel);

console.log('[group-engagement] ✅ GroupLevel + CoupleDay + Pair UI installés');
