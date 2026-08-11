'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const handlerPath = path.join(BOT, 'handler.js');
const utilPath = path.join(BOT, 'utils', 'categoryMenu.js');

if (!fs.existsSync(handlerPath)) throw new Error('[category-menu] bot/handler.js absent');

const utility = `'use strict';

const { loadCommands } = require('./commandLoader');

const CATEGORY_ALIASES = new Map([
  ['ia', '🤖 IA'], ['ai', '🤖 IA'], ['intelligence artificielle', '🤖 IA'],
  ['telechargement', '📥 Téléchargements'], ['telechargements', '📥 Téléchargements'],
  ['téléchargement', '📥 Téléchargements'], ['téléchargements', '📥 Téléchargements'],
  ['download', '📥 Téléchargements'], ['downloads', '📥 Téléchargements'],
  ['groupe', '⚙️ Gestion de groupe'], ['groupes', '⚙️ Gestion de groupe'],
  ['group', '⚙️ Gestion de groupe'], ['groups', '⚙️ Gestion de groupe'],
  ['gestion groupe', '⚙️ Gestion de groupe'], ['gestion de groupe', '⚙️ Gestion de groupe'],
  ['outil', '🛠️ Outils généraux'], ['outils', '🛠️ Outils généraux'], ['tools', '🛠️ Outils généraux'],
  ['outil general', '🛠️ Outils généraux'], ['outils generaux', '🛠️ Outils généraux'],
  ['jeux', '🎮 Jeux & Fun'], ['jeu', '🎮 Jeux & Fun'], ['games', '🎮 Jeux & Fun'], ['fun', '🎮 Jeux & Fun'],
  ['protection', '🛡️ Protections'], ['protections', '🛡️ Protections'],
  ['securite', '🛡️ Protections'], ['sécurité', '🛡️ Protections'], ['security', '🛡️ Protections'],
  ['anime', '🌸 Anime'], ['animes', '🌸 Anime'],
  ['recherche', '🔍 Recherche'], ['recherches', '🔍 Recherche'], ['search', '🔍 Recherche'],
  ['owner', '👑 Owner'], ['proprietaire', '👑 Owner'], ['propriétaire', '👑 Owner'],
  ['configuration', '🔧 Configuration'], ['config', '🔧 Configuration'], ['settings', '🔧 Configuration'],
  ['parametres', '🔧 Configuration'], ['paramètres', '🔧 Configuration'],
]);

const DISPLAY = {
  '🤖 IA': '🤖 IA', '📥 Téléchargements': '📥 Téléchargements',
  '⚙️ Gestion de groupe': '👥 Gestion de groupe', '🛠️ Outils généraux': '🛠️ Outils généraux',
  '🎮 Jeux & Fun': '🎮 Jeux & Fun', '🛡️ Protections': '🛡️ Protections',
  '🌸 Anime': '🌸 Anime', '🔍 Recherche': '🔎 Recherche',
  '👑 Owner': '👑 Owner', '🔧 Configuration': '⚙️ Configuration',
};

function normalize(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9& ]+/g, ' ')
    .replace(/\\s+/g, ' ').trim();
}

const NORMALIZED_ALIASES = new Map(
  [...CATEGORY_ALIASES].map(([alias, category]) => [normalize(alias), category])
);

function uniqueCommands() {
  const seen = new Set();
  const list = [];
  for (const cmd of loadCommands().values()) {
    if (!cmd || seen.has(cmd)) continue;
    seen.add(cmd);
    list.push(cmd);
  }
  return list;
}

function resolveCategory(label) {
  const normalized = normalize(label);
  if (!normalized) return null;
  const available = new Set(uniqueCommands().map(cmd => cmd.category || '🔮 ᴀᴜᴛʀᴇs'));
  const aliased = NORMALIZED_ALIASES.get(normalized);
  if (aliased && available.has(aliased)) return aliased;
  for (const category of available) {
    if (normalize(category) === normalized || normalize(DISPLAY[category]) === normalized) return category;
  }
  return null;
}

function commandsForCategory(category) {
  return uniqueCommands()
    .filter(cmd => cmd.category === category)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function buildCategoryText(category, commands) {
  let text = \`╭── \${DISPLAY[category] || category} ──\\n\\n\`;
  for (const cmd of commands) text += \`• \${cmd.name}\\n\`;
  text += \`\\nTotal : \${commands.length} commandes\\n\`;
  text += '\\n>Powered by 🌹 𝐌ꝛ⥔𝕿𝖗𝖊𝖘𝖔𝖗 🌹';
  return text;
}

function extractRequestedCategory(body, prefix = '.') {
  let input = String(body || '').trim();
  if (prefix && input.startsWith(prefix)) input = input.slice(prefix.length).trim();
  const match = input.match(/^(.+?)\\s+menu$/i);
  return match ? match[1].trim() : null;
}

async function handleCategoryMenuPhrase(sock, msg, context, body, prefix) {
  const requested = extractRequestedCategory(body, prefix);
  if (!requested) return false;
  const category = resolveCategory(requested);
  if (!category) return false;
  const from = context?.from || msg?.key?.remoteJid;
  if (!from) return false;
  await sock.sendMessage(from, { text: buildCategoryText(category, commandsForCategory(category)) }, { quoted: msg });
  return true;
}

module.exports = {
  CATEGORY_ALIASES, normalize, resolveCategory, commandsForCategory,
  buildCategoryText, extractRequestedCategory, handleCategoryMenuPhrase,
};
`;

fs.mkdirSync(path.dirname(utilPath), { recursive: true });
fs.writeFileSync(utilPath, utility);
console.log('[category-menu] utils/categoryMenu.js installé');

let handler = fs.readFileSync(handlerPath, 'utf8');
const marker = '[CATEGORY MENU PHRASE]';
if (!handler.includes(marker)) {
  const anchor = `    // ── CUSTOM REPLY — réponses automatiques personnalisées ─────────────`;
  const replacement = `    // ── [CATEGORY MENU PHRASE] ───────────────────────────────\n    // Cette navigation fait partie du menu natif et doit donc passer avant\n    // les custom replies portant éventuellement le même texte. Elle affiche\n    // uniquement une liste et n'exécute aucune commande.\n    if (body) {\n      try {\n        const { handleCategoryMenuPhrase } = require('./utils/categoryMenu');\n        if (await handleCategoryMenuPhrase(sock, msg, { from }, body, config.prefix)) return;\n      } catch (err) {\n        console.error('[category-menu]', err.message);\n      }\n    }\n\n    // ── CUSTOM REPLY — réponses automatiques personnalisées ─────────────`;
  const count = handler.split(anchor).length - 1;
  if (count !== 1) throw new Error(`[category-menu] anchor handler attendu 1 fois, trouvé ${count}`);
  handler = handler.replace(anchor, replacement);
  fs.writeFileSync(handlerPath, handler);
  console.log('[category-menu] routeur handler appliqué avant custom replies');
} else {
  console.log('[category-menu] routeur handler déjà appliqué');
}

for (const file of [utilPath, handlerPath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[category-menu] syntaxe invalide ${file}: ${check.stderr || check.stdout}`);
}

console.log('[category-menu] ✅ prêt');
