'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const packagePath = path.join(BOT, 'package.json');

const copies = [
  [path.join(ROOT, 'overrides', 'languageManager.js'), path.join(BOT, 'utils', 'languageManager.js')],
  [path.join(ROOT, 'overrides', 'language-command.js'), path.join(BOT, 'commands', 'bot_sovereignty', 'language.js')],
  [path.join(ROOT, 'overrides', 'install-bilingual.js'), path.join(BOT, 'scripts', 'install-bilingual.js')],
];

for (const [source, target] of copies) {
  if (!fs.existsSync(source)) throw new Error('[bilingual-patch] override absent: ' + source);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

const installer = path.join(BOT, 'scripts', 'install-bilingual.js');
const run = spawnSync(process.execPath, [installer], { cwd: BOT, encoding: 'utf8' });
if (run.status !== 0) throw new Error('[bilingual-patch] installation échouée: ' + (run.stderr || run.stdout));
if (run.stdout) process.stdout.write(run.stdout);

if (!fs.existsSync(packagePath)) throw new Error('[bilingual-patch] bot/package.json absent');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.scripts = pkg.scripts || {};
let prestart = String(pkg.scripts.prestart || '');
const cmd = 'node scripts/install-bilingual.js';
const verifier = 'node scripts/verify-command-runtime.js';
if (!prestart.includes(cmd)) {
  if (prestart.includes(verifier)) prestart = prestart.replace(verifier, cmd + ' && ' + verifier);
  else prestart += (prestart ? ' && ' : '') + cmd;
  pkg.scripts.prestart = prestart;
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
}

for (const file of [
  path.join(BOT, 'utils', 'languageManager.js'),
  path.join(BOT, 'commands', 'bot_sovereignty', 'language.js'),
  path.join(BOT, 'scripts', 'install-bilingual.js'),
  path.join(BOT, 'index.js'),
  path.join(BOT, 'utils', 'sessionManager.js'),
]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[bilingual-patch] syntaxe invalide ${path.relative(BOT, file)}: ${check.stderr || check.stdout}`);
}

const lang = fs.readFileSync(path.join(BOT, 'utils', 'languageManager.js'), 'utf8');
const cmdSrc = fs.readFileSync(path.join(BOT, 'commands', 'bot_sovereignty', 'language.js'), 'utf8');
const index = fs.readFileSync(path.join(BOT, 'index.js'), 'utf8');
const sessions = fs.readFileSync(path.join(BOT, 'utils', 'sessionManager.js'), 'utf8');
for (const marker of ["DEFAULT_LANGUAGE = 'fr'", "import('@vitalets/google-translate-api')", 'sock.relayMessage = async']) {
  if (!lang.includes(marker)) throw new Error('[bilingual-patch] languageManager incomplet: ' + marker);
}
for (const marker of ["name: 'language'", "aliases: ['lang', 'langue']", 'ownerOnly: true']) {
  if (!cmdSrc.includes(marker)) throw new Error('[bilingual-patch] commande language incomplète: ' + marker);
}
if (!index.includes('[BILINGUAL MAIN SOCKET]')) throw new Error('[bilingual-patch] main socket non équipé');
if (!sessions.includes('[BILINGUAL SECONDARY SOCKET]')) throw new Error('[bilingual-patch] sous-sessions non équipées');

console.log('[bilingual-patch] ✅ .language + traduction globale FR/EN installées et persistantes');
