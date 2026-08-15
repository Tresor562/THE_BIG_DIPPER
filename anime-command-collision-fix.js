'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const legacyPath = path.join(BOT, 'commands', 'general_tools', 'animeinfo.js');
const modernPath = path.join(BOT, 'commands', 'anime', 'anime.js');
const MARKER = '[ANIME COLLISION FIX]';

for (const file of [legacyPath, modernPath]) {
  if (!fs.existsSync(file)) throw new Error(`[anime-collision] fichier absent: ${file}`);
}

let legacy = fs.readFileSync(legacyPath, 'utf8');
const modern = fs.readFileSync(modernPath, 'utf8');

// Le module Otaku moderne est la source canonique pour .anime/.animeinfo.
if (!/name:\s*['"]anime['"]/.test(modern) || !/aliases:\s*\[[^\]]*['"]animeinfo['"]/.test(modern)) {
  throw new Error('[anime-collision] le module anime moderne ne réserve pas anime + animeinfo comme attendu');
}

if (!legacy.includes(MARKER)) {
  const oldName = "  name      : 'animeinfo',";
  const oldAliases = "  aliases   : ['anime', 'webtoon', 'infoanime', 'ainfo', 'winfo'],";

  const nameCount = legacy.split(oldName).length - 1;
  const aliasCount = legacy.split(oldAliases).length - 1;
  if (nameCount !== 1 || aliasCount !== 1) {
    throw new Error(`[anime-collision] forme legacy inattendue (name=${nameCount}, aliases=${aliasCount})`);
  }

  legacy = legacy
    .replace(oldName, "  name      : 'webtoon', // [ANIME COLLISION FIX] .anime/.animeinfo appartiennent au module Otaku moderne")
    .replace(oldAliases, "  aliases   : ['infoanime', 'ainfo', 'winfo'],");

  fs.writeFileSync(legacyPath, legacy, 'utf8');
  console.log('[anime-collision] ✅ legacy animeinfo converti en commande webtoon sans collision');
} else {
  console.log('[anime-collision] ✅ correctif déjà appliqué');
}

const finalLegacy = fs.readFileSync(legacyPath, 'utf8');
const check = spawnSync(process.execPath, ['--check', legacyPath], { encoding: 'utf8' });
if (check.status !== 0) {
  throw new Error(`[anime-collision] syntaxe animeinfo.js invalide: ${check.stderr || check.stdout}`);
}

if (!/name\s*:\s*['"]webtoon['"]/.test(finalLegacy)) {
  throw new Error('[anime-collision] nom webtoon absent après correction');
}
if (/aliases\s*:\s*\[[^\]]*['"]anime['"]/.test(finalLegacy)) {
  throw new Error('[anime-collision] alias anime legacy encore présent');
}
if (/name\s*:\s*['"]animeinfo['"]/.test(finalLegacy)) {
  throw new Error('[anime-collision] nom animeinfo legacy encore présent');
}

console.log('[anime-collision] ✅ .anime/.animeinfo modernes conservés; .webtoon legacy conservé');
