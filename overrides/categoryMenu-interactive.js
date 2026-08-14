'use strict';

const config = require('../config');
const styleManager = require('./styleManager');
const { loadCommands } = require('./commandLoader');

const CATEGORY_ALIASES = new Map([
  ['ia', '🤖 IA'],
  ['ai', '🤖 IA'],
  ['intelligence artificielle', '🤖 IA'],
  ['telechargement', '📥 Téléchargements'],
  ['telechargements', '📥 Téléchargements'],
  ['téléchargement', '📥 Téléchargements'],
  ['téléchargements', '📥 Téléchargements'],
  ['download', '📥 Téléchargements'],
  ['downloads', '📥 Téléchargements'],
  ['groupe', '⚙️ Gestion de groupe'],
  ['groupes', '⚙️ Gestion de groupe'],
  ['group', '⚙️ Gestion de groupe'],
  ['groups', '⚙️ Gestion de groupe'],
  ['gestion groupe', '⚙️ Gestion de groupe'],
  ['gestion de groupe', '⚙️ Gestion de groupe'],
  ['outil', '🛠️ Outils généraux'],
  ['outils', '🛠️ Outils généraux'],
  ['tools', '🛠️ Outils généraux'],
  ['outil general', '🛠️ Outils généraux'],
  ['outils generaux', '🛠️ Outils généraux'],
  ['jeux', '🎮 Jeux & Fun'],
  ['jeu', '🎮 Jeux & Fun'],
  ['games', '🎮 Jeux & Fun'],
  ['fun', '🎮 Jeux & Fun'],
  ['protection', '🛡️ Protections'],
  ['protections', '🛡️ Protections'],
  ['securite', '🛡️ Protections'],
  ['sécurité', '🛡️ Protections'],
  ['security', '🛡️ Protections'],
  ['anime', '🌸 Anime'],
  ['animes', '🌸 Anime'],
  ['recherche', '🔍 Recherche'],
  ['recherches', '🔍 Recherche'],
  ['search', '🔍 Recherche'],
  ['owner', '👑 Owner'],
  ['proprietaire', '👑 Owner'],
  ['propriétaire', '👑 Owner'],
  ['configuration', '🔧 Configuration'],
  ['config', '🔧 Configuration'],
  ['settings', '🔧 Configuration'],
  ['parametres', '🔧 Configuration'],
  ['paramètres', '🔧 Configuration'],
]);

const DISPLAY = {
  '🤖 IA': '🤖 IA',
  '📥 Téléchargements': '📥 Téléchargements',
  '⚙️ Gestion de groupe': '👥 Gestion de groupe',
  '🛠️ Outils généraux': '🛠️ Outils généraux',
  '🎮 Jeux & Fun': '🎮 Jeux & Fun',
  '🛡️ Protections': '🛡️ Protections',
  '🌸 Anime': '🌸 Anime',
  '🔍 Recherche': '🔎 Recherche',
  '👑 Owner': '👑 Owner',
  '🔧 Configuration': '⚙️ Configuration',
};

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9& ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NORMALIZED_ALIASES = new Map(
  Array.from(CATEGORY_ALIASES.entries()).map(([alias, category]) => [normalize(alias), category])
);

function uniqueCommands() {
  const out = [];
  const seen = new Set();
  for (const cmd of loadCommands().values()) {
    if (!cmd || seen.has(cmd)) continue;
    seen.add(cmd);
    out.push(cmd);
  }
  return out;
}

function availableCategories() {
  return new Set(uniqueCommands().map(cmd => cmd.category || '🔮 ᴀᴜᴛʀᴇs'));
}

function resolveCategory(label) {
  const normalized = normalize(label);
  if (!normalized) return null;

  const available = availableCategories();
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

function buildCategoryText(category, commands, prefix = config.prefix || '.') {
  const display = DISPLAY[category] || category;
  let text = `╭─❑ *${String(display).toUpperCase()}* ❑─⚯\n`;
  for (const cmd of commands) text += `┃⌥⎋ \`${prefix}${cmd.name}\`\n`;
  text += '╰━━━━━━━━━━━━━━━⚯\n\n';
  text += `📜 *${commands.length} commandes dans cette catégorie*\n\n`;
  text += '> 𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑';
  return text;
}

function extractRequestedCategory(body, prefix = '.') {
  let input = String(body || '').trim();
  if (prefix && input.startsWith(prefix)) input = input.slice(prefix.length).trim();
  const match = input.match(/^(.+?)\s+menu$/i);
  return match ? match[1].trim() : null;
}

function getSenderJid(msg) {
  return msg?.key?.participant || msg?.key?.remoteJid || '';
}

function getNewsletterContext() {
  return {
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: config.newsletterJid || '120363411005383995@newsletter',
      newsletterName: config.botName || '𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑',
      serverMessageId: -1,
    },
  };
}

async function handleCategoryMenuPhrase(sock, msg, context, body, prefix) {
  const requested = extractRequestedCategory(body, prefix);
  if (!requested) return false;

  const category = resolveCategory(requested);
  if (!category) return false;

  const commands = commandsForCategory(category);
  const from = context?.from || msg?.key?.remoteJid;
  if (!from) return false;

  const activePrefix = config.prefix || prefix || '.';
  const style = Number(styleManager.getStyle?.() ?? 0);
  const senderJid = getSenderJid(msg);
  const allCount = uniqueCommands().length;
  const menu = require('../commands/general_tools/menu');

  let text;
  if (typeof menu.buildCategoryDetail === 'function') {
    text = menu.buildCategoryDetail(style, category, commands, 1, {
      botName: config.botName || '𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑',
      ownerName: 'Trésor',
      userRank: 'utilisateur',
      prefix: activePrefix,
      count: allCount,
      senderJid,
      currentCategory: category,
    });
  } else {
    text = buildCategoryText(category, commands, activePrefix);
  }

  // [CATEGORY MENU INTERACTIVE]
  // Même moteur que .menu : effet newsletter + CTA chaîne + style actif.
  if (typeof menu.sendStyledMenuMessage === 'function') {
    await menu.sendStyledMenuMessage(sock, from, {
      text,
      style,
      quoted: msg,
      mentions: senderJid ? [senderJid] : [],
      withImage: true,
    });
    return true;
  }

  // Fallback : conserver au minimum l'effet newsletter si le moteur interactif
  // est indisponible, sans casser la commande de catégorie.
  await sock.sendMessage(
    from,
    { text, contextInfo: getNewsletterContext() },
    { quoted: msg }
  );
  return true;
}

module.exports = {
  CATEGORY_ALIASES,
  normalize,
  resolveCategory,
  commandsForCategory,
  buildCategoryText,
  extractRequestedCategory,
  handleCategoryMenuPhrase,
};
