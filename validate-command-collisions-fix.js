'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const BOT = path.join(__dirname, 'bot');

function replaceOnce(file, search, replacement, label) {
  const p = path.join(BOT, file); let src = fs.readFileSync(p, 'utf8');
  if (src.includes(replacement)) { console.log(`[validate-fix] ${label}: déjà corrigé`); return; }
  const count = src.split(search).length - 1;
  if (count !== 1) throw new Error(`[validate-fix] ${label}: attendu 1 occurrence, trouvé ${count}`);
  fs.writeFileSync(p, src.replace(search, replacement), 'utf8');
}
replaceOnce('commands/download_tools/download_tools.js', "['clearqueue','La file directe ne conserve aucun élément.']", "['dlclearqueue','La file directe ne conserve aucun élément.']", 'collision clearqueue');
replaceOnce('commands/audio_lab/audio_lab.js', "['silence','Mettre une zone en silence','<début_sec> <fin_sec>']", "['audiosilence','Mettre une zone audio en silence','<début_sec> <fin_sec>']", 'collision silence');
replaceOnce('commands/group_management/groupsettings.js', "aliases: ['groupname', 'setnom', 'renamegroup']", "aliases: ['setnom', 'renamegroup']", 'collision groupname');

function botCanResolve(pkg) {
  try { execFileSync(process.execPath, ['-e', `require.resolve(${JSON.stringify(pkg)})`], { cwd: BOT, stdio: 'ignore' }); return true; }
  catch (_) { return false; }
}

// fileLabEngine charge ces modules au require(), donc validate:commands a besoin
// de tous les résoudre même lorsqu'une commande 7z/rar n'est pas exécutée.
const required = [
  ['adm-zip', 'adm-zip@^0.5.16'],
  ['node-7z', 'node-7z@^3.0.0'],
  ['7zip-bin', '7zip-bin@^5.2.0'],
  ['node-unrar-js', 'node-unrar-js@^2.0.2']
];
const missing = required.filter(([pkg]) => !botCanResolve(pkg));
if (missing.length) {
  console.log(`[validate-fix] dépendances File Lab absentes: ${missing.map(x => x[0]).join(', ')}`);
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const run = spawnSync(npm, ['install', '--omit=dev', '--no-audit', '--no-fund', ...missing.map(x => x[1])], {
    cwd: BOT, stdio: 'inherit',
    env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: 'true', PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'true' }
  });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`[validate-fix] installation dépendances File Lab échouée (${run.status})`);
}
for (const [pkg] of required) if (!botCanResolve(pkg)) throw new Error(`[validate-fix] ${pkg} reste introuvable depuis bot/`);
console.log('[validate-fix] dépendances File Lab résolues depuis bot/node_modules');

for (const rel of ['commands/download_tools/download_tools.js','commands/audio_lab/audio_lab.js','commands/group_management/groupsettings.js','utils/fileLabEngine.js']) {
  const p = path.join(BOT, rel); const check = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[validate-fix] syntaxe invalide ${rel}: ${check.stderr || check.stdout}`);
}
console.log('[validate-fix] ✅ collisions et dépendances File Lab corrigées avant validate:commands');
