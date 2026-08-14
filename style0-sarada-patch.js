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
    // L'en-tête complet est déjà produit par buildImmersiveHeader().
    header: () => '',
    catOpen: cat => \`╭─❑ *\${String(cat).toUpperCase()}* ❑─⚯\\n\`,
    catCmd: cmd => \`┃⌥⎋ \\\`\${cmd.name}\\\`\\n\`,
    catClose: () => \`╰━━━━━━━━━━━━━━━⚯\\n\\n\`,
    footer: () => \`> 𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑\`,
  },
`;
src = src.slice(0, style0Start) + style0Block + src.slice(style1Start);
console.log('[style0-sarada] STYLES[0] remplacé');

// ── 2) En-tête immersif Style 0 ─────────────────────────────────────
const immersiveStart = '  // ── Style 0 · DIPPER (identité officielle) ──────────────────';
const immersiveEnd = '  // ── Style 1 · Dark ─────────────────────────────────────────';
const immersiveBlock = `  // ── Style 0 · DIPPER — panneau système Sarada-inspired ───────
  if (style === 0) {
    const osInfo = require('os');
    const totalRam = osInfo.totalmem();
    const usedRam = totalRam - osInfo.freemem();
    const ramUsedGb = (usedRam / 1024 ** 3).toFixed(1);
    const ramTotalGb = (totalRam / 1024 ** 3).toFixed(1);
    const memoryMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
    const cpuLoad = Number(osInfo.loadavg?.()[0] || 0).toFixed(2);
    const host = osInfo.hostname() || process.env.HOSTNAME || 'N/A';
    const serverId = process.env.RENDER_INSTANCE_ID || process.env.RENDER_SERVICE_ID || 'N/A';
    const mode = config.selfMode ? 'self' : (config.public ? 'public' : 'semi-public');

    return (
      \`╭━━❑ *\${bot}* ❑━━⚯\\n\` +
      \`┃𓊈⭐𓊉 *𝐏𝐑𝐄𝐅𝐈𝐗* : \\\`\${pfx}\\\`\\n\` +
      \`┃𓊈⭐𓊉 *𝐌𝐎𝐃𝐄* : \${mode}\\n\` +
      \`┃𓊈⭐𓊉 *𝐎𝐖𝐍𝐄𝐑* : \${owner}\\n\` +
      \`┃𓊈⭐𓊉 *𝐕𝐄𝐑𝐒𝐈𝐎𝐍* : *\${ver}*\\n\` +
      \`┃𓊈⭐𓊉 *𝐂𝐌𝐃𝐒* : \${count}\\n\` +
      \`╰━━━━━━━━━━━━━━━⚯\\n\\n\` +
      \`╭─❑ *𝐈𝐍𝐅𝐎𝐒 𝐒𝐘𝐒𝐓𝐄̀𝐌𝐄* ❑─⚯\\n\` +
      \`┃☍╭⚬𝐋𝐚𝐭𝐞𝐧𝐜𝐲: \${getLatency()}ms\\n\` +
      \`┃☍│⚬𝐇𝐨𝐬𝐭: \${host}\\n\` +
      \`┃☍│⚬𝐈𝐃 𝐬𝐞𝐫𝐯𝐞𝐫: \${serverId}\\n\` +
      \`┃☍│⚬𝐂𝐩𝐮 𝐥𝐨𝐚𝐝: \${cpuLoad}\\n\` +
      \`┃☍│⚬𝐑𝐚𝐦: \${ramUsedGb} Go / \${ramTotalGb} Go\\n\` +
      \`┃☍│⚬𝐌𝐞𝐦𝐨𝐫𝐲: \${memoryMb} Mo\\n\` +
      \`┃☍╰⚬𝐔𝐩𝐭𝐢𝐦𝐞: \${uptime}\\n\` +
      \`╰━━━━━━━━━━━━━━━⚯\\n\\n\`
    );
  }

`;
replaceBetween(immersiveStart, immersiveEnd, immersiveBlock, 'en-tête immersif style 0');

fs.writeFileSync(menuPath, src, 'utf8');
fs.copyFileSync(pingOverride, pingPath);
console.log('[style0-sarada] ping style 0 installé');

for (const file of [menuPath, pingPath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[style0-sarada] syntaxe invalide ${path.relative(BOT, file)}: ${check.stderr || check.stdout}`);
  }
}

console.log('[style0-sarada] ✅ style 0 menu + ping prêts');
