'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const file = path.join(__dirname, 'bot', 'commands', 'anime', 'anime.js');
const MARK = '[NEKO RESILIENT IMAGE]';

if (!fs.existsSync(file)) throw new Error('[neko-fix] anime.js absent');

let src = fs.readFileSync(file, 'utf8');
let changed = false;

if (!src.includes(MARK)) {
  const importAnchor = "const { isPremium } = require('../../utils/premiumDB');";
  if (src.includes(importAnchor)) {
    src = src.replace(
      importAnchor,
      `${importAnchor}\nconst resolveAnimeImage = require('../../utils/animeImageResolver'); // ${MARK}`
    );
    changed = true;
  } else {
    console.warn('[neko-fix] ⚠️ import premiumDB introuvable — patch média ignoré sans bloquer le build');
  }
}

if (src.includes(MARK) && !src.includes("resolveAnimeImage('neko')")) {
  // Patch global volontairement simple et robuste : la chaîne ne peut viser que
  // l'appel neko. Aucun découpage fragile par bloc de commande.
  const callPatterns = [
    /const\s+imgUrl\s*=\s*await\s+getWaifuPicsImage\(\s*['\"]neko['\"]\s*\)\s*;/m,
    /let\s+imgUrl\s*=\s*await\s+getWaifuPicsImage\(\s*['\"]neko['\"]\s*\)\s*;/m,
    /await\s+getWaifuPicsImage\(\s*['\"]neko['\"]\s*\)/m
  ];

  let matched = false;
  for (const pattern of callPatterns) {
    if (!pattern.test(src)) continue;
    matched = true;
    if (/^await/.test(pattern.source)) {
      // Cette variante n'expose pas imgUrl ; on ne la remplace pas à l'aveugle.
      break;
    }
    src = src.replace(pattern, "const imgResolved = await resolveAnimeImage('neko');\n        const imgUrl = imgResolved.url || null;");
    changed = true;
    break;
  }

  // Si la commande utilise ensuite axios.get(imgUrl), remplace uniquement cet
  // appel précis par le buffer déjà validé. Le regexp est borné à la déclaration.
  if (matched && src.includes("resolveAnimeImage('neko')")) {
    const axiosPattern = /const\s+imgBuf\s*=\s*await\s+axios\.get\(\s*imgUrl\s*,\s*\{[^;]*?responseType\s*:\s*['\"]arraybuffer['\"][^;]*?\}\s*\)\s*;/m;
    if (axiosPattern.test(src)) {
      src = src.replace(axiosPattern, 'const imgBuf = { data: imgResolved.buffer };');
      changed = true;
    }
  }

  if (!src.includes("resolveAnimeImage('neko')")) {
    console.warn('[neko-fix] ⚠️ logique média neko non reconnue — ancien comportement conservé; build non bloqué');
  }
}

if (changed) fs.writeFileSync(file, src, 'utf8');

const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
if (check.status !== 0) {
  throw new Error('[neko-fix] anime.js invalide après patch: ' + (check.stderr || check.stdout));
}

const finalSrc = fs.readFileSync(file, 'utf8');
if (finalSrc.includes("resolveAnimeImage('neko')")) {
  console.log('[neko-fix] ✅ neko relié au résolveur multi-source');
} else {
  console.log('[neko-fix] ℹ️ patch neko non applicable à cette révision; build autorisé avec logique source existante');
}
