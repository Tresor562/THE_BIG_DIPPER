'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const menuPath = path.join(__dirname, 'bot', 'commands', 'general_tools', 'menu.js');
const marker = '[UNKNOWN COMMAND — COMPACT STYLE 0]';

if (!fs.existsSync(menuPath)) throw new Error('[unknown-compact] menu.js introuvable');

let src = fs.readFileSync(menuPath, 'utf8');
const startNeedle = 'function buildUnknownCommandVisual(ctx, title, cmds = [], mode = \'results\') {';
const endNeedle = 'async function sendUnknownCommandVisual';
const start = src.indexOf(startNeedle);
const end = start === -1 ? -1 : src.indexOf(endNeedle, start);

if (start === -1 || end === -1 || end <= start) {
  throw new Error('[unknown-compact] moteur visuel des commandes inconnues introuvable');
}

if (!src.includes(marker)) {
  const compactBuilder = `// ${marker}\nfunction buildUnknownCommandVisual(ctx, title, cmds = [], mode = 'results') {\n  // Style 0 compact uniquement : aucun panneau préfixe/mode/version/système.\n  const style = 0;\n  const s = STYLES[0] || STYLES[1];\n  let text = s.catOpen(title);\n\n  if (mode === 'results') {\n    text += '┃⚠️ *Commande inconnue.*\\n';\n    text += '┃✨ *Vouliez-vous dire :*\\n';\n    cmds.forEach((cmd, i) => {\n      text += s.catCmd({ ...cmd, name: \`\${i + 1}. \${prefix}\${cmd.name}\` });\n    });\n  } else if (mode === 'confirm' && cmds[0]) {\n    text += '┃⚠️ *Commande inconnue.*\\n';\n    text += '┃✅ *Correction proposée :*\\n';\n    text += s.catCmd({ ...cmds[0], name: \`\${prefix}\${cmds[0].name}\` });\n  } else {\n    text += '┃⚠️ *Commande inconnue.*\\n';\n    text += '┃Aucune commande suffisamment proche trouvée.\\n';\n  }\n\n  text += s.catClose();\n\n  if (mode === 'results') {\n    text += '💬 *Répondez avec le numéro pour voir la fiche.*\\n';\n    text += '0️⃣ *Répondez avec 0 pour revenir au menu principal.*\\n\\n';\n  } else if (mode === 'confirm') {\n    text += '💬 *Répondez oui pour exécuter la correction proposée.*\\n';\n    text += '0️⃣ *Répondez avec 0 pour revenir au menu principal.*\\n\\n';\n  } else {\n    text += \`💡 *Tapez \${prefix}menu pour afficher les commandes.*\\n\\n\`;\n  }\n\n  text += s.footer();\n  return { text, style };\n}\n\n`;

  src = src.slice(0, start) + compactBuilder + src.slice(end);
  fs.writeFileSync(menuPath, src, 'utf8');
  console.log('[unknown-compact] rendu compact Style 0 installé');
} else {
  console.log('[unknown-compact] déjà installé');
}

const check = spawnSync(process.execPath, ['--check', menuPath], { encoding: 'utf8' });
if (check.status !== 0) throw new Error(`[unknown-compact] menu invalide: ${check.stderr || check.stdout}`);

const finalSrc = fs.readFileSync(menuPath, 'utf8');
if (!finalSrc.includes(marker)) throw new Error('[unknown-compact] marqueur absent');
const compactStart = finalSrc.indexOf(marker);
const compactEnd = finalSrc.indexOf('async function sendUnknownCommandVisual', compactStart);
const compactBlock = finalSrc.slice(compactStart, compactEnd);
for (const forbidden of ['buildImmersiveHeader(', '𝐏𝐑𝐄𝐅𝐈𝐗', '𝐌𝐎𝐃𝐄', '𝐈𝐍𝐅𝐎𝐒 𝐒𝐘𝐒𝐓𝐄̀𝐌𝐄', 'Cpu load', 'Ram:']) {
  if (compactBlock.includes(forbidden)) throw new Error(`[unknown-compact] donnée système encore présente: ${forbidden}`);
}

console.log('[unknown-compact] ✅ commande inconnue = Style 0 compact, newsletter/CTA conservés');
