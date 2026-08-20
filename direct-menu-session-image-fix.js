'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'bot', 'commands', 'general_tools', 'menu.js');
let src = fs.readFileSync(file, 'utf8');
if (!src.includes('[SESSION MENU IMAGE FINAL]')) {
  const anchors = [
    'let imageBuffer = providedImageBuffer || null;',
    'let imageBuffer=providedImageBuffer||null;'
  ];
  const anchor = anchors.find(candidate => src.includes(candidate));
  if (!anchor) throw new Error('[direct-menu-fix] direct sender anchor missing');
  const insert = `${anchor}\n  const _sessionMenuImage = sessionPreferences.get('menuImagePath', null); // [SESSION MENU IMAGE FINAL]\n  if (!imageBuffer && _sessionMenuImage && fs.existsSync(_sessionMenuImage)) {\n    try { imageBuffer = fs.readFileSync(_sessionMenuImage); } catch (_) {}\n  }`;
  src = src.replace(anchor, insert);
  fs.writeFileSync(file, src, 'utf8');
}
console.log('[direct-menu-fix] session image preserved in direct sender');