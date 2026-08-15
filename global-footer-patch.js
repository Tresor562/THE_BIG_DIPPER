'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const installers = [
  'scripts/install-global-footer.js',
  'scripts/install-style-layout.js',
  'scripts/install-anime-carousel.js',
  'scripts/install-feature-pack-runtime.js',
];

for (const rel of installers) {
  const file = path.join(BOT, rel);
  if (!fs.existsSync(file)) throw new Error(`[feature-pack-deploy] installateur absent: ${rel}`);
  const run = spawnSync(process.execPath, [file], { cwd: BOT, encoding: 'utf8', timeout: 45_000 });
  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);
  if (run.error) throw new Error(`[feature-pack-deploy] ${rel}: ${run.error.message}`);
  if (run.status !== 0) throw new Error(`[feature-pack-deploy] ${rel} a échoué (${run.status})`);
}

const checks = [
  'utils/specialPresentation.js', 'utils/interactiveCarousel.js', 'utils/connectionPresentation.js', 'utils/featurePackRuntime.js',
  'commands/bot_sovereignty/autotyping.js', 'commands/bot_sovereignty/autorecording.js', 'commands/bot_sovereignty/pair.js',
  'commands/general_tools/repo.js', 'commands/general_tools/boutique.js', 'commands/general_tools/stylelist.js',
  'commands/group_management/antiwalink.js', 'commands/social_media_download/socialsearch.js',
  'commands/games_entertainment/hackpranks.js', 'commands/anime/anime.js', 'handler.js', 'utils/responseStyle.js',
];
for (const rel of checks) {
  const file = path.join(BOT, rel);
  if (!fs.existsSync(file)) throw new Error(`[feature-pack-deploy] fichier absent: ${rel}`);
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 15_000 });
  if (check.status !== 0) throw new Error(`[feature-pack-deploy] syntaxe ${rel}: ${check.stderr || check.stdout}`);
}

const helper = fs.readFileSync(path.join(BOT, 'utils', 'specialPresentation.js'), 'utf8');
const handler = fs.readFileSync(path.join(BOT, 'handler.js'), 'utf8');
const anime = fs.readFileSync(path.join(BOT, 'commands', 'anime', 'anime.js'), 'utf8');
const responseStyle = fs.readFileSync(path.join(BOT, 'utils', 'responseStyle.js'), 'utf8');

for (const invariant of [
  '[TARGETED CONNECTION FOOTER 2026-08-16]',
  '[FEATURE PACK 2026-08-16 RUNTIME]',
]) {
  if (!helper.includes(invariant) && !handler.includes(invariant)) throw new Error('[feature-pack-deploy] invariant absent: ' + invariant);
}
if (!handler.includes('[WELCOME TARGETED CONNECTION FOOTER]') || !handler.includes('[GOODBYE TARGETED CONNECTION FOOTER]')) {
  throw new Error('[feature-pack-deploy] welcome/goodbye non ciblés');
}
if (!anime.includes('[ANIME MULTI CAROUSEL 2026-08-16]')) throw new Error('[feature-pack-deploy] carrousel anime non installé');
if (!responseStyle.includes('[STYLE COMPACT SEPARATORS 2026-08-16]')) throw new Error('[feature-pack-deploy] séparateurs styles non installés');
if (helper.includes("'pair', 'sessions'") || helper.includes("'repere', 'repère'")) throw new Error('[feature-pack-deploy] footer connexion encore global');

console.log('[feature-pack-deploy] ✅ footer ciblé + styles compacts + anime carousel + runtime feature-pack validés');
