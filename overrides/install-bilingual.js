'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const indexPath = path.join(ROOT, 'index.js');
const managerPath = path.join(ROOT, 'utils', 'sessionManager.js');
const languageManagerPath = path.join(ROOT, 'utils', 'languageManager.js');
const languageCommandPath = path.join(ROOT, 'commands', 'bot_sovereignty', 'language.js');

for (const file of [indexPath, managerPath, languageManagerPath, languageCommandPath]) {
  if (!fs.existsSync(file)) throw new Error('[bilingual] fichier absent: ' + file);
}

function patchRequire(src, needle, line) {
  if (src.includes(line)) return src;
  if (!src.includes(needle)) throw new Error('[bilingual] ancre require absente: ' + needle);
  return src.replace(needle, needle + '\n' + line);
}

function insertAfterSocketBefore(src, socketStart, nextAnchor, insertion, label) {
  if (src.includes(insertion.trim())) return src;
  const start = src.indexOf(socketStart);
  if (start < 0) throw new Error(`[bilingual] ${label}: création socket introuvable`);
  const next = src.indexOf(nextAnchor, start);
  if (next < 0) throw new Error(`[bilingual] ${label}: ancre après socket introuvable`);
  return src.slice(0, next) + insertion + src.slice(next);
}

let index = fs.readFileSync(indexPath, 'utf8');
index = patchRequire(
  index,
  "const sessionContext = require('./utils/sessionContext'); // [PHASE 1] isolation données — voir utils/sessionContext.js",
  "const { installLanguageMiddleware } = require('./utils/languageManager'); // [BILINGUAL]"
);
index = insertAfterSocketBefore(
  index,
  '  const sock = makeWASocket({',
  '\n  // ════════════════════════════════════════════',
  "\n  await installLanguageMiddleware(sock, sessionContext.DEFAULT_SESSION_ID); // [BILINGUAL MAIN SOCKET]\n",
  'socket principal'
);
fs.writeFileSync(indexPath, index, 'utf8');

let manager = fs.readFileSync(managerPath, 'utf8');
manager = patchRequire(
  manager,
  "const sessionContext = require('./sessionContext');",
  "const { installLanguageMiddleware } = require('./languageManager'); // [BILINGUAL]"
);
manager = insertAfterSocketBefore(
  manager,
  '  const sock = makeWASocket({',
  '\n\n  const session = {',
  "\n  await installLanguageMiddleware(sock, sessionId); // [BILINGUAL SECONDARY SOCKET]\n",
  'sockets secondaires'
);
fs.writeFileSync(managerPath, manager, 'utf8');

for (const file of [indexPath, managerPath, languageManagerPath, languageCommandPath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[bilingual] syntaxe invalide ${path.relative(ROOT, file)}: ${check.stderr || check.stdout}`);
}

const finalIndex = fs.readFileSync(indexPath, 'utf8');
const finalManager = fs.readFileSync(managerPath, 'utf8');
const finalLang = fs.readFileSync(languageManagerPath, 'utf8');
const finalCmd = fs.readFileSync(languageCommandPath, 'utf8');
for (const [label, source, markers] of [
  ['index', finalIndex, ['[BILINGUAL MAIN SOCKET]', 'installLanguageMiddleware(sock, sessionContext.DEFAULT_SESSION_ID)']],
  ['sessionManager', finalManager, ['[BILINGUAL SECONDARY SOCKET]', 'installLanguageMiddleware(sock, sessionId)']],
  ['languageManager', finalLang, ["DEFAULT_LANGUAGE = 'fr'", 'sock.relayMessage = async', 'sock.sendMessage = async', "import('@vitalets/google-translate-api')"]],
  ['language command', finalCmd, ["name: 'language'", "aliases: ['lang', 'langue']", 'ownerOnly: true']],
]) {
  for (const marker of markers) if (!source.includes(marker)) throw new Error(`[bilingual] ${label}: garde-fou absent: ${marker}`);
}
console.log('[bilingual] ✅ français par défaut + anglais global sur main et toutes les sous-sessions');
