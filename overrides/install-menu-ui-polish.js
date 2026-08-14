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

const overviewStart = src.indexOf('function buildCategoryOverview(');
const overviewEnd = overviewStart < 0 ? -1 : src.indexOf('// Détail d\'une catégorie', overviewStart);
if (overviewStart < 0 || overviewEnd < 0) throw new Error('[menu-ui] buildCategoryOverview introuvable');
let overview = src.slice(overviewStart, overviewEnd);
if (!overview.includes('return disciplineMenuText(text);')) {
  overview = overview.replace(/return\s+text;\s*\}\s*$/, 'return disciplineMenuText(text);\n}\n\n');
}
src = src.slice(0, overviewStart) + overview + src.slice(overviewEnd);

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

if (!/senderJid:\s*rawSender,\s*displayName/.test(src)) {
  src = src.replace(
    /categoryNames,\s*categories,\s*count,\s*senderJid:\s*rawSender,\s*\n\s*currentCategory:/,
    'categoryNames, categories, count, senderJid: rawSender, displayName,\n          currentCategory:'
  );
}

fs.writeFileSync(menuPath, src, 'utf8');

const final = fs.readFileSync(menuPath, 'utf8');
for (const marker of [
  '[BENIN GREETING SAFE]',
  MARKER,
  '[DISPLAY NAME NO LID]',
  '[MENU REAL DISPLAY NAME]',
  'return disciplineMenuText(text);',
  'entry.displayName',
  'senderJid: rawSender, displayName',
]) {
  if (!final.includes(marker)) throw new Error('[menu-ui] garde-fou absent: ' + marker);
}

const check = spawnSync(process.execPath, ['--check', menuPath], { encoding: 'utf8' });
if (check.status !== 0) throw new Error('[menu-ui] syntaxe menu invalide: ' + (check.stderr || check.stdout));

console.log('[menu-ui] ✅ heure Bénin + nom réel + 21 styles disciplinés + navigation persistante');
