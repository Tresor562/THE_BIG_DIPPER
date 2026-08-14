'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const menuPath = path.join(BOT, 'commands', 'general_tools', 'menu.js');
const pingPath = path.join(BOT, 'commands', 'general_tools', 'ping.js');
const pingOverride = path.join(ROOT, 'overrides', 'ping-style0.js');

for (const file of [menuPath, pingOverride]) {
  if (!fs.existsSync(file)) throw new Error(`[style0-sarada] fichier absent: ${file}`);
}

let src = fs.readFileSync(menuPath, 'utf8');

function replaceBetween(startNeedle, endNeedle, replacement, label) {
  const start = src.indexOf(startNeedle);
  const end = start === -1 ? -1 : src.indexOf(endNeedle, start + startNeedle.length);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`[style0-sarada] ${label}: bloc introuvable`);
  }
  src = src.slice(0, start) + replacement + src.slice(end);
  console.log(`[style0-sarada] ${label} appliqué`);
}

// ── 1) Style 0 de rendu des catégories ──────────────────────────────
const stylesAnchor = 'const STYLES = {';
const stylesPos = src.indexOf(stylesAnchor);
if (stylesPos === -1) throw new Error('[style0-sarada] objet STYLES introuvable');
const style0Start = src.indexOf('  0: {', stylesPos);
const style1Start = src.indexOf('  1: {', style0Start);
if (style0Start === -1 || style1Start === -1) {
  throw new Error('[style0-sarada] blocs STYLES[0]/STYLES[1] introuvables');
}

const style0Block = `  0: {
    nom: 'DIPPER',
    // L'en-tête compact est déjà produit par buildImmersiveHeader().
    header: () => '',
    catOpen: cat => \`╭─❑ *\${String(cat).toUpperCase()}* ❑─⚯\\n\`,
    catCmd: cmd => \`┃⌥⎋ \\\`\${cmd.name}\\\`\\n\`,
    catClose: () => \`╰━━━━━━━━━━━━━━━⚯\\n\\n\`,
    footer: () => \`> Powered by 🌹 Mr Tresor 🌹\`,
  },
`;
src = src.slice(0, style0Start) + style0Block + src.slice(style1Start);
console.log('[style0-sarada] STYLES[0] remplacé');

// ── 2) En-tête immersif Style 0 ─────────────────────────────────────
// IMPORTANT : aucune information système ici. Ce renderer est partagé par
// .menu, .allmenu, les catégories et la navigation par réponse. Les métriques
// host/CPU/RAM/latence/uptime appartiennent uniquement à .ping.
const immersiveStart = '  // ── Style 0 · DIPPER (identité officielle) ──────────────────';
const immersiveEnd = '  // ── Style 1 · Dark ─────────────────────────────────────────';
const immersiveBlock = `  // ── Style 0 · DIPPER — identité compacte, sans métriques système ──
  if (style === 0) {
    const mode = config.selfMode ? 'self' : (config.public ? 'public' : 'semi-public');

    return (
      \`╭━━❑ *\${bot}* ❑━━⚯\\n\` +
      \`┃𓊈⭐𓊉 *𝐏𝐑𝐄𝐅𝐈𝐗* : \\\`\${pfx}\\\`\\n\` +
      \`┃𓊈⭐𓊉 *𝐌𝐎𝐃𝐄* : \${mode}\\n\` +
      \`┃𓊈⭐𓊉 *𝐎𝐖𝐍𝐄𝐑* : \${owner}\\n\` +
      \`┃𓊈⭐𓊉 *𝐕𝐄𝐑𝐒𝐈𝐎𝐍* : *\${ver}*\\n\` +
      \`┃𓊈⭐𓊉 *𝐂𝐌𝐃𝐒* : \${count}\\n\` +
      \`╰━━━━━━━━━━━━━━━⚯\\n\\n\`
    );
  }

`;
replaceBetween(immersiveStart, immersiveEnd, immersiveBlock, 'en-tête immersif style 0 compact');

fs.writeFileSync(menuPath, src, 'utf8');
fs.copyFileSync(pingOverride, pingPath);
console.log('[style0-sarada] ping style 0 installé — métriques système réservées à ping');

for (const file of [menuPath, pingPath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[style0-sarada] syntaxe invalide ${path.relative(BOT, file)}: ${check.stderr || check.stdout}`);
  }
}

console.log('[style0-sarada] ✅ style 0 menu compact + ping système prêts');
