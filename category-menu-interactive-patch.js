'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const menuPath = path.join(BOT, 'commands', 'general_tools', 'menu.js');
const categoryPath = path.join(BOT, 'utils', 'categoryMenu.js');
const categoryOverride = path.join(ROOT, 'overrides', 'categoryMenu-interactive.js');

for (const file of [menuPath, categoryOverride]) {
  if (!fs.existsSync(file)) throw new Error(`[category-interactive] fichier absent: ${file}`);
}

let menu = fs.readFileSync(menuPath, 'utf8');

const exportsToAdd = [];
if (!menu.includes('module.exports.sendStyledMenuMessage = sendStyledMenuMessage;')) {
  exportsToAdd.push('module.exports.sendStyledMenuMessage = sendStyledMenuMessage;');
}
if (!menu.includes('module.exports.buildCategoryDetail = buildCategoryDetail;')) {
  exportsToAdd.push('module.exports.buildCategoryDetail = buildCategoryDetail;');
}

if (exportsToAdd.length) {
  menu += `\n\n// [CATEGORY MENU INTERACTIVE EXPORTS]\n${exportsToAdd.join('\n')}\n`;
  fs.writeFileSync(menuPath, menu, 'utf8');
  console.log('[category-interactive] exports visuels du menu ajoutés');
} else {
  console.log('[category-interactive] exports visuels déjà présents');
}

fs.copyFileSync(categoryOverride, categoryPath);
console.log('[category-interactive] categoryMenu interactif installé');

for (const file of [menuPath, categoryPath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[category-interactive] syntaxe invalide ${path.relative(BOT, file)}: ${check.stderr || check.stdout}`);
  }
}

const finalMenu = fs.readFileSync(menuPath, 'utf8');
const finalCategory = fs.readFileSync(categoryPath, 'utf8');
for (const marker of [
  'module.exports.sendStyledMenuMessage = sendStyledMenuMessage;',
  'module.exports.buildCategoryDetail = buildCategoryDetail;',
]) {
  if (!finalMenu.includes(marker)) throw new Error(`[category-interactive] export absent: ${marker}`);
}
for (const marker of [
  '[CATEGORY MENU INTERACTIVE]',
  'menu.sendStyledMenuMessage',
  'menu.buildCategoryDetail',
  'forwardedNewsletterMessageInfo',
]) {
  if (!finalCategory.includes(marker)) throw new Error(`[category-interactive] garde-fou absent: ${marker}`);
}

console.log('[category-interactive] ✅ menus de catégories = style + newsletter + CTA');

require('./unknown-command-visual-patch');
require('./unknown-command-compact-patch');
require('./special-presentation-patch');
require('./premium-runtime-verifier-patch');
require('./command-response-guarantee-patch');

// .owner dédié : deux vCards + newsletter + réseaux sociaux.
require('./owner-premium-patch');
