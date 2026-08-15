'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const file = path.join(__dirname, 'bot', 'database.js');
if (!fs.existsSync(file)) throw new Error('[settings-shutdown] bot/database.js absent');

let src = fs.readFileSync(file, 'utf8');
const marker = '[RUNTIME SETTINGS FLUSH BEFORE EXIT]';

if (!src.includes(marker)) {
  const oldBlock = `process.on('exit',   flushAll);\nprocess.on('SIGINT',  () => { flushAll(); process.exit(0); });\nprocess.on('SIGTERM', () => { flushAll(); process.exit(0); });`;
  const newBlock = `process.on('exit', flushAll);\n\n// ${marker}\nlet _settingsShutdownStarted = false;\nasync function flushAllAndExit() {\n  if (_settingsShutdownStarted) return;\n  _settingsShutdownStarted = true;\n  flushAll();\n  try { await sessionPreferences.flushMongoWrites?.(); } catch (_) {}\n  process.exit(0);\n}\nprocess.on('SIGINT',  () => { flushAllAndExit(); });\nprocess.on('SIGTERM', () => { flushAllAndExit(); });`;

  const count = src.split(oldBlock).length - 1;
  if (count !== 1) throw new Error(`[settings-shutdown] bloc signaux attendu 1 fois, trouvé ${count}`);
  src = src.replace(oldBlock, newBlock);
  fs.writeFileSync(file, src, 'utf8');
  console.log('[settings-shutdown] ✅ flush Mongo avant SIGINT/SIGTERM installé');
}

const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
if (check.status !== 0) throw new Error(`[settings-shutdown] syntaxe database.js: ${check.stderr || check.stdout}`);
