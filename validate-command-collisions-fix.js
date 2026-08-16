'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');

function replaceOnce(file, search, replacement, label) {
  const p = path.join(BOT, file);
  let src = fs.readFileSync(p, 'utf8');
  if (src.includes(replacement)) {
    console.log(`[validate-fix] ${label}: déjà corrigé`);
    return;
  }
  const count = src.split(search).length - 1;
  if (count !== 1) throw new Error(`[validate-fix] ${label}: attendu 1 occurrence, trouvé ${count}`);
  src = src.replace(search, replacement);
  fs.writeFileSync(p, src, 'utf8');
  console.log(`[validate-fix] ${label}: corrigé`);
}

// 1) La file de téléchargement et la file DJ avaient toutes deux .clearqueue.
//    On garde .clearqueue pour Audio Lab et on rend la variante download explicite.
replaceOnce(
  'commands/download_tools/download_tools.js',
  "['clearqueue','La file directe ne conserve aucun élément.']",
  "['dlclearqueue','La file directe ne conserve aucun élément.']",
  'collision clearqueue'
);

// 2) .silence existe déjà comme commande de gestion de groupe.
//    L'effet audio devient .audiosilence afin que les deux fonctionnalités restent disponibles.
replaceOnce(
  'commands/audio_lab/audio_lab.js',
  "['silence','Mettre une zone en silence','<début_sec> <fin_sec>']",
  "['audiosilence','Mettre une zone audio en silence','<début_sec> <fin_sec>']",
  'collision silence'
);

// 3) .groupname est la commande d'information générale ; le setter conserve
//    .setgroupname, .setnom et .renamegroup sans voler ce nom.
replaceOnce(
  'commands/group_management/groupsettings.js',
  "aliases: ['groupname', 'setnom', 'renamegroup']",
  "aliases: ['setnom', 'renamegroup']",
  'collision groupname'
);

// 4) File Lab utilise adm-zip. Le package est déclaré dans bot/package.json,
//    mais certains caches Render historiques ne l'avaient pas matérialisé.
//    On force son installation uniquement s'il est réellement absent.
try {
  require.resolve('adm-zip', { paths: [BOT] });
  console.log('[validate-fix] adm-zip disponible');
} catch (_) {
  console.log('[validate-fix] adm-zip absent — installation ciblée');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const run = spawnSync(npm, ['install', '--omit=dev', '--no-audit', '--no-fund', 'adm-zip@^0.5.16'], {
    cwd: BOT,
    stdio: 'inherit',
    env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: 'true', PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'true' },
  });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`[validate-fix] installation adm-zip échouée (${run.status})`);
  require.resolve('adm-zip', { paths: [BOT] });
  console.log('[validate-fix] adm-zip installé');
}

for (const rel of [
  'commands/download_tools/download_tools.js',
  'commands/audio_lab/audio_lab.js',
  'commands/group_management/groupsettings.js',
  'utils/fileLabEngine.js',
]) {
  const p = path.join(BOT, rel);
  const check = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[validate-fix] syntaxe invalide ${rel}: ${check.stderr || check.stdout}`);
}

console.log('[validate-fix] ✅ collisions et dépendance File Lab corrigées avant validate:commands');
