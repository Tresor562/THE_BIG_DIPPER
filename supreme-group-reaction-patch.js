'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const installerSrc = path.join(ROOT, 'overrides', 'install-supreme-group-reaction.js');
const installerDst = path.join(BOT, 'scripts', 'install-supreme-group-reaction.js');
const packagePath = path.join(BOT, 'package.json');

for (const file of [installerSrc, packagePath]) {
  if (!fs.existsSync(file)) throw new Error(`[supreme-react-deploy] fichier absent: ${file}`);
}

fs.mkdirSync(path.dirname(installerDst), { recursive: true });
fs.copyFileSync(installerSrc, installerDst);
console.log('[supreme-react-deploy] installateur copié dans bot/scripts');

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const installCmd = 'node scripts/install-supreme-group-reaction.js';
const prestart = String(pkg.scripts?.prestart || '').trim();
if (!prestart.includes(installCmd)) {
  pkg.scripts = pkg.scripts || {};
  pkg.scripts.prestart = prestart ? `${prestart} && ${installCmd}` : installCmd;
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log('[supreme-react-deploy] prestart renforcé');
} else {
  console.log('[supreme-react-deploy] prestart déjà renforcé');
}

const run = spawnSync(process.execPath, [installerDst], { cwd: BOT, encoding: 'utf8' });
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) throw new Error(`[supreme-react-deploy] installation échouée (${run.status})`);

for (const file of [installerDst, path.join(BOT, 'handler.js')]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[supreme-react-deploy] syntaxe invalide ${path.relative(BOT, file)}: ${check.stderr || check.stdout}`);
}

const finalPkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
if (!String(finalPkg.scripts?.prestart || '').includes(installCmd)) {
  throw new Error('[supreme-react-deploy] installateur absent du prestart final');
}
const handler = fs.readFileSync(path.join(BOT, 'handler.js'), 'utf8');
if (!handler.includes('[SUPREME GROUP REACTION — CLOSED GROUP SAFE]')) {
  throw new Error('[supreme-react-deploy] garde-fou absent du handler final');
}

console.log('[supreme-react-deploy] ✅ réaction Supreme persistante sur Render');
