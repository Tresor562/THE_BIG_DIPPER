'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');

function replaceOnce(file, search, replacement, label) {
  const p = path.join(BOT, file);
  let src = fs.readFileSync(p, 'utf8');
  if (src.includes(replacement)) { console.log(`[validate-fix] ${label}: déjà corrigé`); return; }
  const count = src.split(search).length - 1;
  if (count !== 1) throw new Error(`[validate-fix] ${label}: attendu 1 occurrence, trouvé ${count}`);
  fs.writeFileSync(p, src.replace(search, replacement), 'utf8');
  console.log(`[validate-fix] ${label}: corrigé`);
}

replaceOnce('commands/download_tools/download_tools.js', "['clearqueue','La file directe ne conserve aucun élément.']", "['dlclearqueue','La file directe ne conserve aucun élément.']", 'collision clearqueue');
replaceOnce('commands/audio_lab/audio_lab.js', "['silence','Mettre une zone en silence','<début_sec> <fin_sec>']", "['audiosilence','Mettre une zone audio en silence','<début_sec> <fin_sec>']", 'collision silence');
replaceOnce('commands/group_management/groupsettings.js', "aliases: ['groupname', 'setnom', 'renamegroup']", "aliases: ['setnom', 'renamegroup']", 'collision groupname');

// IMPORTANT: ce script vit dans le wrapper /src alors que les dépendances du bot
// sont installées dans /src/bot/node_modules. require.resolve() exécuté depuis le
// wrapper ne doit donc jamais servir de test de présence d'un package du bot.
function botCanResolve(pkg) {
  const probe = `require.resolve(${JSON.stringify(pkg)}); process.stdout.write('ok')`;
  try {
    execFileSync(process.execPath, ['-e', probe], { cwd: BOT, stdio: ['ignore', 'pipe', 'pipe'] });
    return true;
  } catch (_) { return false; }
}

if (!botCanResolve('adm-zip')) {
  console.log('[validate-fix] adm-zip absent dans bot/node_modules — installation ciblée');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const run = spawnSync(npm, ['install', '--omit=dev', '--no-audit', '--no-fund', 'adm-zip@^0.5.16'], {
    cwd: BOT, stdio: 'inherit',
    env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: 'true', PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'true' },
  });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`[validate-fix] installation adm-zip échouée (${run.status})`);
}
if (!botCanResolve('adm-zip')) throw new Error('[validate-fix] adm-zip reste introuvable depuis le contexte du bot');
console.log('[validate-fix] adm-zip résolu depuis bot/node_modules');

for (const rel of ['commands/download_tools/download_tools.js','commands/audio_lab/audio_lab.js','commands/group_management/groupsettings.js','utils/fileLabEngine.js']) {
  const p = path.join(BOT, rel);
  const check = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[validate-fix] syntaxe invalide ${rel}: ${check.stderr || check.stdout}`);
}
console.log('[validate-fix] ✅ collisions et dépendance File Lab corrigées avant validate:commands');
