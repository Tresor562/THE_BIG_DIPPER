'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const file = path.join(__dirname, 'bot', 'commands', 'anime', 'anime.js');
const MARK = '[NEKO RESILIENT IMAGE]';

if (!fs.existsSync(file)) throw new Error('[neko-fix] anime.js absent');

let src = fs.readFileSync(file, 'utf8');

if (!src.includes(MARK)) {
  const importAnchor = "const { isPremium } = require('../../utils/premiumDB');";
  if (!src.includes(importAnchor)) {
    throw new Error('[neko-fix] import premiumDB introuvable');
  }

  src = src.replace(
    importAnchor,
    `${importAnchor}\nconst resolveAnimeImage = require('../../utils/animeImageResolver'); // ${MARK}`
  );

  // Ne travaille que dans le bloc de la commande .neko pour éviter de toucher
  // waifu/cosplay et pour rester robuste aux espaces, CRLF et reformatages.
  const nekoStart = src.search(/\bname\s*:\s*['"]neko['"]/);
  if (nekoStart < 0) throw new Error('[neko-fix] commande neko introuvable');

  const nextCommand = src.slice(nekoStart + 1).search(/\n\s*\{\s*\n\s*name\s*:/);
  const nekoEnd = nextCommand >= 0 ? nekoStart + 1 + nextCommand : src.length;
  const before = src.slice(0, nekoStart);
  let nekoBlock = src.slice(nekoStart, nekoEnd);
  const after = src.slice(nekoEnd);

  const legacyPattern = /const\s+imgUrl\s*=\s*await\s+getWaifuPicsImage\(\s*['"]neko['"]\s*\)\s*;[\s\r\n]*const\s+imgBuf\s*=\s*await\s+axios\.get\(\s*imgUrl\s*,\s*\{[\s\S]*?responseType\s*:\s*['"]arraybuffer['"][\s\S]*?\}\s*\)\s*;/m;

  if (!legacyPattern.test(nekoBlock)) {
    // Variante plus tolérante : remplace seulement les deux déclarations,
    // même si l'objet axios a été réordonné ou enrichi.
    const imgUrlPattern = /const\s+imgUrl\s*=\s*await\s+getWaifuPicsImage\(\s*['"]neko['"]\s*\)\s*;/m;
    const imgBufPattern = /const\s+imgBuf\s*=\s*await\s+axios\.get\(\s*imgUrl\s*,[\s\S]*?\)\s*;/m;
    if (!imgUrlPattern.test(nekoBlock) || !imgBufPattern.test(nekoBlock)) {
      throw new Error('[neko-fix] logique média de la commande neko introuvable');
    }
    nekoBlock = nekoBlock.replace(imgUrlPattern, "const imgResolved = await resolveAnimeImage('neko');");
    nekoBlock = nekoBlock.replace(imgBufPattern, 'const imgBuf = { data: imgResolved.buffer };');
  } else {
    nekoBlock = nekoBlock.replace(
      legacyPattern,
      "const imgResolved = await resolveAnimeImage('neko');\n        const imgBuf = { data: imgResolved.buffer };"
    );
  }

  src = before + nekoBlock + after;
  fs.writeFileSync(file, src, 'utf8');
}

const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
if (check.status !== 0) {
  throw new Error('[neko-fix] anime.js invalide: ' + (check.stderr || check.stdout));
}

const finalSrc = fs.readFileSync(file, 'utf8');
if (!finalSrc.includes(MARK) || !finalSrc.includes("resolveAnimeImage('neko')")) {
  throw new Error('[neko-fix] validation finale échouée');
}

console.log('[neko-fix] ✅ neko utilise désormais plusieurs fournisseurs et valide réellement le média avant envoi');
