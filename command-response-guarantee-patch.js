'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const override = path.join(ROOT, 'overrides', 'install-command-response-guarantee.js');
const target = path.join(BOT, 'scripts', 'install-command-response-guarantee.js');
const packagePath = path.join(BOT, 'package.json');

for (const file of [override, packagePath]) {
  if (!fs.existsSync(file)) throw new Error('[command-guarantee-patch] fichier absent: ' + file);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(override, target);

const checkInstaller = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
if (checkInstaller.status !== 0) {
  throw new Error('[command-guarantee-patch] installateur invalide: ' + (checkInstaller.stderr || checkInstaller.stdout));
}

const run = spawnSync(process.execPath, [target], { cwd: BOT, encoding: 'utf8' });
if (run.status !== 0) {
  throw new Error('[command-guarantee-patch] installation échouée: ' + (run.stderr || run.stdout));
}
if (run.stdout) process.stdout.write(run.stdout);

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
let prestart = String(pkg.scripts?.prestart || '');
const installer = 'node scripts/install-command-response-guarantee.js';
const verifier = 'node scripts/verify-command-runtime.js';
if (!prestart.includes(installer)) {
  if (prestart.includes(verifier)) {
    prestart = prestart.replace(verifier, installer + ' && ' + verifier);
  } else {
    prestart += (prestart ? ' && ' : '') + installer;
  }
  pkg.scripts = pkg.scripts || {};
  pkg.scripts.prestart = prestart;
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
}

const handlerPath = path.join(BOT, 'handler.js');
const handler = fs.readFileSync(handlerPath, 'utf8');
for (const marker of [
  '[COMMAND RESPONSE GUARANTEE]',
  '[COMMAND FEEDBACK RETRY]',
  '[UNKNOWN COMMAND RESPONSE GUARANTEE]',
  '[COMMAND SLOW ACK]',
  '[NO SILENT noReply]',
]) {
  if (!handler.includes(marker)) throw new Error('[command-guarantee-patch] garde-fou absent: ' + marker);
}

const checkHandler = spawnSync(process.execPath, ['--check', handlerPath], { encoding: 'utf8' });
if (checkHandler.status !== 0) {
  throw new Error('[command-guarantee-patch] handler invalide: ' + (checkHandler.stderr || checkHandler.stdout));
}

console.log('[command-guarantee-patch] ✅ garantie de réponse installée et persistante au prestart');
