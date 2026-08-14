'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const menuPath = path.join(ROOT, 'commands', 'general_tools', 'menu.js');
const MARKER = '[MENU UI DISCIPLINE]';

if (!fs.existsSync(menuPath)) throw new Error('[menu-ui] menu.js introuvable');
let src = fs.readFileSync(menuPath, 'utf8');

function replaceRegion(startNeedle, endNeedle, replacement, label) {
  const start = src.indexOf(startNeedle);
  const end = start < 0 ? -1 : src.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(`[menu-ui] ${label}: région introuvable`);
  src = src.slice(0, start) + replacement + src.slice(end);
}

function patchReturnText(startNeedle, endNeedle, label) {
  const start = src.indexOf(startNeedle);
  const end = start < 0 ? -1 : src.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end < 0) return false;
  let region = src.slice(start, end);
  if (!region.includes('return disciplineMenuText(text);')) {
    const next = region.replace(/return\s+text;\s*\}\s*$/, 'return disciplineMenuText(text);\n}\n\n');
    if (next === region) throw new Error(`[menu-ui] ${label}: return text introuvable`);
    region = next;
    src = src.slice(0, start) + region + src.slice(end);
  }
  return true;
}

if (!src.includes('[BENIN GREETING SAFE]')) {
  replaceRegion(
    'function getGreeting() {',
    '// Heure formatée Bénin',
    `function getGreeting() { // [BENIN GREETING SAFE]\n  let hour;\n  try {\n    const parts = new Intl.DateTimeFormat('en-GB', {\n      timeZone: 'Africa/Porto-Novo',\n      hour: '2-digit',\n      hourCycle: 'h23',\n    }).formatToParts(new Date());\n    hour = Number(parts.find(part => part.type === 'hour')?.value);\n  } catch (_) {\n    hour = (new Date().getUTCHours() + 1) % 24;\n  }\n  if (!Number.isFinite(hour)) hour = (new Date().getUTCHours() + 1) % 24;\n  if (hour >= 5  && hour < 12) return 'Bonjour 🌞';\n  if (hour >= 12 && hour < 17) return 'Bon après-midi ☀️';\n  if (hour >= 17 && hour < 21) return 'Bonsoir 🌙';\n  return 'Bonne nuit 🌌';\n}\n\n`,
    'salutation horaire'
  );
}

if (!src.includes(MARKER)) {
  const anchor = '// ── Construire l\'en-tête immersif — 10 styles thématiques ─────';
  const pos = src.indexOf(anchor);
  if (pos < 0) throw new Error('[menu-ui] ancre buildImmersiveHeader absente');
  const helpers = `// ${MARKER}\nfunction sanitizeDisplayName(value) {\n  const clean = String(value || '').replace(/\\s+/g, ' ').trim();\n  if (!clean) return '';\n  return clean.length > 32 ? clean.slice(0, 31) + '…' : clean;\n}\n\nfunction disciplineMenuText(text) {\n  return String(text || '').split('\\n').map(line =>\n    line.replace(/[ \\t]{2,}(?=[:»])/g, ' ')\n  ).join('\\n');\n}\n\n`;
  src = src.slice(0, pos) + helpers + src.slice(pos);
}

src = src.replace(
  'function buildImmersiveHeader(style, senderJid, count, botName) {',
  'function buildImmersiveHeader(style, senderJid, count, botName, displayName = \'\') {'
);

const immersiveStart = src.indexOf('function buildImmersiveHeader(style, senderJid, count, botName, displayName = \'\') {');
const immersiveEnd = immersiveStart < 0 ? -1 : src.indexOf('// ══════════════════════════════════════════════════════════════\n// 📋 NAVIGATION PAR CATÉGORIES', immersiveStart);
if (immersiveStart < 0 || immersiveEnd < 0) throw new Error('[menu-ui] buildImmersiveHeader final introuvable');
let immersive = src.slice(immersiveStart, immersiveEnd);

if (!immersive.includes('[DISPLAY NAME NO LID]')) {
  const mentionRegex = /\s*const mention\s*=\s*`@\$\{\(senderJid \|\| ''\)\.split\('@'\)\[0\]\.split\(':'\)\[0\]\}`;/;
  if (!mentionRegex.test(immersive)) throw new Error('[menu-ui] construction mention/LID introuvable');
  immersive = immersive.replace(
    mentionRegex,
    "\n  const userDisplay = sanitizeDisplayName(displayName) || formatUser(senderJid); // [DISPLAY NAME NO LID]"
  );
}
immersive = immersive.replaceAll('${mention}', '${userDisplay}');
immersive = immersive.replace(
  'return buildImmersiveHeader(0, senderJid, count, botName);',
  'return buildImmersiveHeader(0, senderJid, count, botName, displayName);'
);
src = src.slice(0, immersiveStart) + immersive + src.slice(immersiveEnd);

src = src.replace(
  'function buildCategoryOverview(style, botName, ownerName, userRank, prefix, categoryNames, categories, count, senderJid) {',
  'function buildCategoryOverview(style, botName, ownerName, userRank, prefix, categoryNames, categories, count, senderJid, displayName = \'\') {'
);
src = src.replace(
  'let text = buildImmersiveHeader(style, senderJid, count, botName);',
  'let text = buildImmersiveHeader(style, senderJid, count, botName, displayName);'
);
patchReturnText('function buildCategoryOverview(', '// Détail d\'une catégorie', 'aperçu menu');

src = src.replace(
  'let text = buildImmersiveHeader(style, senderJid, allCount, botName);',
  "let text = buildImmersiveHeader(style, senderJid, allCount, botName, context.displayName || '');"
);
patchReturnText('function buildCategoryDetail(', '// ══════════════════════════════════════════════════════════════\n// 🔎 MOTEUR DE RECHERCHE', 'détail catégorie');

const hasGeneratedAllMenu = src.includes('function buildAllMenuChunks(') || src.includes("if (body === 'allmenu')");
if (hasGeneratedAllMenu) {
  src = src.replace(
    'buildImmersiveHeader(style, senderJid, count, botName) +',
    "buildImmersiveHeader(style, senderJid, count, botName, context.displayName || '') +"
  );
  if (src.includes('function buildAllMenuChunks(')) {
    const allStart = src.indexOf('function buildAllMenuChunks(');
    const allEnd = src.indexOf('\nmodule.exports = {', allStart);
    if (allEnd > allStart) {
      let all = src.slice(allStart, allEnd);
      all = all.replaceAll('chunks.push((current + footer).trim());', 'chunks.push(disciplineMenuText((current + footer).trim()));');
      src = src.slice(0, allStart) + all + src.slice(allEnd);
    }
  }
}

src = src.replace(
  /entry\.prefix,\s*entry\.categoryNames,\s*entry\.categories,\s*entry\.count,\s*entry\.senderJid\s*\n\s*\);/,
  "entry.prefix, entry.categoryNames, entry.categories, entry.count, entry.senderJid, entry.displayName || ''\n    );"
);

if (!src.includes('[MENU REAL DISPLAY NAME]')) {
  const needle = '      const rawSender = extra.sender || msg.key.participant || msg.key.remoteJid;';
  if (!src.includes(needle)) throw new Error('[menu-ui] rawSender introuvable');
  src = src.replace(
    needle,
    `${needle}\n      const displayName = // [MENU REAL DISPLAY NAME]\n        sanitizeDisplayName(msg?.pushName || extra?.pushName || extra?.senderName || '') ||\n        formatUser(rawSender);`
  );
}

src = src.replace(
  /buildCategoryOverview\(styleActif,\s*botName,\s*ownerName,\s*userRank,\s*prefix,\s*categoryNames,\s*categories,\s*count,\s*rawSender\);/,
  'buildCategoryOverview(styleActif, botName, ownerName, userRank, prefix, categoryNames, categories, count, rawSender, displayName);'
);

if (hasGeneratedAllMenu && !src.includes('[ALLMENU REAL DISPLAY NAME]')) {
  src = src.replace(
    /(if \(body === 'allmenu'\) \{[\s\S]{0,400}?const ctx = buildMenuContext\(rawSender, isSupreme, sock\);)/,
    "$1\n    ctx.displayName = displayName; // [ALLMENU REAL DISPLAY NAME]"
  );
}

// Le tracking peut déjà contenir imageUrl injecté par menu-visual-patch.
// On cible le trackMenu racine au lieu d'exiger un ordre de propriétés précis.
const menuTrackRegex = /(trackMenu\(sentMsg\.key\.id,\s*\{[\s\S]{0,700}?senderJid:\s*rawSender,)(?!\s*displayName\b)/;
if (menuTrackRegex.test(src)) {
  src = src.replace(menuTrackRegex, '$1 displayName,');
}

fs.writeFileSync(menuPath, src, 'utf8');

const final = fs.readFileSync(menuPath, 'utf8');
const basicRequired = [
  '[BENIN GREETING SAFE]',
  MARKER,
  '[DISPLAY NAME NO LID]',
  '[MENU REAL DISPLAY NAME]',
  'return disciplineMenuText(text);',
  'entry.displayName',
];
for (const marker of basicRequired) {
  if (!final.includes(marker)) throw new Error('[menu-ui] garde-fou absent: ' + marker);
}

const trackedDisplayNameRegex = /trackMenu\(sentMsg\.key\.id,\s*\{[\s\S]{0,700}?senderJid:\s*rawSender,\s*displayName\b/;
if (!trackedDisplayNameRegex.test(final)) {
  throw new Error('[menu-ui] displayName absent du tracking menu principal');
}

const finalHasAllMenu = final.includes('function buildAllMenuChunks(') || final.includes("if (body === 'allmenu')");
if (finalHasAllMenu && !final.includes('[ALLMENU REAL DISPLAY NAME]')) {
  throw new Error('[menu-ui] allmenu présent mais displayName non propagé');
}
const finalUsesContextCategory = /function buildCategoryDetail\([^)]*context\s*=\s*\{\}/.test(final);
if (finalUsesContextCategory && !final.includes("context.displayName || ''")) {
  throw new Error('[menu-ui] catégorie stylée présente mais displayName non propagé');
}

const check = spawnSync(process.execPath, ['--check', menuPath], { encoding: 'utf8' });
if (check.status !== 0) throw new Error('[menu-ui] syntaxe menu invalide: ' + (check.stderr || check.stdout));

console.log(`[menu-ui] ✅ heure Bénin + nom réel + styles disciplinés | allmenu=${finalHasAllMenu ? 'yes' : 'optional'}`);
