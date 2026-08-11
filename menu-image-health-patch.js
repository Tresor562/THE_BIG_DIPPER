'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const menuPath = path.join(__dirname, 'bot', 'commands', 'general_tools', 'menu.js');
if (!fs.existsSync(menuPath)) throw new Error('[menu-image-health] menu.js introuvable');

// URLs vérifiées comme inutilisables par le même seuil que le bot :
// HTTP en erreur, corps vide, ou image <= 1000 octets.
const DEAD_URLS = [
  'https://i.imgur.com/6F2V6eD.jpeg',
  'https://i.imgur.com/nX1WVHH.jpeg',
  'https://i.imgur.com/3z2ABPN.jpeg',
  'https://i.imgur.com/UlDSoMy.jpeg',
  'https://i.imgur.com/Q8jbvKo.jpeg',
  'https://i.imgur.com/YK2BKBZ.jpeg',
  'https://files.catbox.moe/5yjazr.jpg',
  'https://i.imgur.com/2v3YMYW.jpeg',
  'https://i.imgur.com/YaFRkON.jpeg',
  'https://i.imgur.com/wMqFGHH.jpeg',
  'https://files.catbox.moe/vpfs80.jpg',
  'https://i.imgur.com/OhY9sTe.jpeg',
  'https://i.imgur.com/dvGCVmo.jpeg',
  'https://i.imgur.com/qS3c5dh.jpeg',
  'https://i.imgur.com/BJHbV2X.jpeg',
  'https://i.imgur.com/YDGmsDN.jpeg',
  'https://i.imgur.com/4jJukHR.jpeg',
  'https://i.imgur.com/Rb0ZWOH.jpeg',
  'https://i.imgur.com/7b4iuDP.jpeg',
  'https://i.imgur.com/pHqnFmC.jpeg',
  'https://files.catbox.moe/gkek17.jpg',
  'https://i.imgur.com/zLaT5KT.jpeg',
  'https://i.imgur.com/A5cMbwA.jpeg',
  'https://i.imgur.com/mkrmEQf.jpeg',
  'https://i.imgur.com/VgmhBaZ.jpeg',
  'https://i.imgur.com/GwnNj7R.jpeg',
  'https://i.imgur.com/wXsUEab.jpeg',
  'https://i.imgur.com/hIiPCsY.jpeg',
  'https://i.imgur.com/mJqzPJl.jpeg',
  'https://i.imgur.com/wXrNGFp.jpeg',
  'https://i.imgur.com/4sMVZaB.jpeg',
  'https://i.imgur.com/9t2i4VK.jpeg',
  'https://i.imgur.com/v8BByTt.jpeg',
];

let src = fs.readFileSync(menuPath, 'utf8');
let removed = 0;

for (const url of DEAD_URLS) {
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const line = new RegExp(`^\\s*['\"]${escaped}['\"],?\\s*$`, 'gm');
  const before = src;
  src = src.replace(line, '');
  if (src !== before) removed++;
}

fs.writeFileSync(menuPath, src);

const remaining = DEAD_URLS.filter(url => fs.readFileSync(menuPath, 'utf8').includes(`'${url}'`) || fs.readFileSync(menuPath, 'utf8').includes(`\"${url}\"`));
if (remaining.length) {
  throw new Error(`[menu-image-health] URLs mortes encore actives: ${remaining.join(', ')}`);
}

const check = spawnSync(process.execPath, ['--check', menuPath], { encoding: 'utf8' });
if (check.status !== 0) throw new Error(`[menu-image-health] menu.js invalide: ${check.stderr || check.stdout}`);

console.log(`[menu-image-health] ✅ ${removed}/${DEAD_URLS.length} URL(s) morte(s) retirée(s) du pool déployé`);
