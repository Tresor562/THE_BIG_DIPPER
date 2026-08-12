'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const installer = path.join(BOT, 'scripts', 'install-response-style.js');
const handler = path.join(BOT, 'handler.js');
const style = path.join(BOT, 'utils', 'responseStyle.js');

// Le lifecycle cleanup du sous-module est exécuté juste avant ce patch dans
// postinstall. On applique ensuite la vraie suppression persistante afin que
// /delsession fonctionne aussi sur les sessions déjà déconnectées.
require('./session-delete-patch');

for (const file of [installer, handler, style]) {
  if (!fs.existsSync(file)) throw new Error(`[response-style-deploy] fichier absent: ${file}`);
}

const run = spawnSync(process.execPath, [installer], { cwd: BOT, encoding: 'utf8' });
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) throw new Error(`[response-style-deploy] installation échouée (${run.status})`);

for (const file of [style, handler]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[response-style-deploy] syntaxe invalide ${path.relative(BOT, file)}: ${check.stderr || check.stdout}`);
}

const finalHandler = fs.readFileSync(handler, 'utf8');
const required = [
  '[RESPONSE STYLE DISCIPLINE]',
  '[PRIVATE SEND SAFETY]',
  '[QUOTED SEND RETRY]',
  '[RELAY RESPONSE WATCH]',
  '[COMMAND RESPONSE WATCHDOG]',
  '[COMMAND ERROR RESPONSE]',
  '[COMMAND RESPONSE CONTEXT]',
  'commandResponseStorage.run(',
  'responseTrace.responses += 1',
  'relayTrace.responses += 1',
];
for (const marker of required) {
  if (!finalHandler.includes(marker)) {
    throw new Error(`[response-style-deploy] garde-fou absent du handler final: ${marker}`);
  }
}

console.log('[response-style-deploy] ✅ sendMessage + relayMessage suivis; anti-silence appliqué au bot déployé');