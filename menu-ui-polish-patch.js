'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const source = path.join(ROOT, 'overrides', 'install-menu-ui-polish.js');
const target = path.join(BOT, 'scripts', 'install-menu-ui-polish.js');
const menuPath = path.join(BOT, 'commands', 'general_tools', 'menu.js');
const packagePath = path.join(BOT, 'package.json');

for (const file of [source, menuPath, packagePath]) {
  if (!fs.existsSync(file)) throw new Error('[menu-ui-patch] fichier absent: ' + file);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);

const installerCheck = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
if (installerCheck.status !== 0) throw new Error('[menu-ui-patch] installateur invalide: ' + (installerCheck.stderr || installerCheck.stdout));

const run = spawnSync(process.execPath, [target], { cwd: BOT, encoding: 'utf8' });
if (run.status !== 0) throw new Error('[menu-ui-patch] installation échouée: ' + (run.stderr || run.stdout));
if (run.stdout) process.stdout.write(run.stdout);

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.scripts = pkg.scripts || {};
let prestart = String(pkg.scripts.prestart || '');
const cmd = 'node scripts/install-menu-ui-polish.js';
const verifier = 'node scripts/verify-command-runtime.js';
if (!prestart.includes(cmd)) {
  if (prestart.includes(verifier)) prestart = prestart.replace(verifier, `${cmd} && ${verifier}`);
  else prestart += (prestart ? ' && ' : '') + cmd;
  pkg.scripts.prestart = prestart;
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
}

const final = fs.readFileSync(menuPath, 'utf8');
for (const marker of ['[BENIN GREETING SAFE]', '[MENU UI DISCIPLINE]', '[DISPLAY NAME NO LID]', '[MENU REAL DISPLAY NAME]']) {
  if (!final.includes(marker)) throw new Error('[menu-ui-patch] garde-fou absent: ' + marker);
}

const menuCheck = spawnSync(process.execPath, ['--check', menuPath], { encoding: 'utf8' });
if (menuCheck.status !== 0) throw new Error('[menu-ui-patch] menu invalide: ' + (menuCheck.stderr || menuCheck.stdout));

console.log('[menu-ui-patch] ✅ menu/allmenu/styles/navigation disciplinés');
