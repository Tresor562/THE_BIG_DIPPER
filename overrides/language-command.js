'use strict';

const config = require('../../config');
const { normalizeLanguage, getSocketLanguage, setSocketLanguage } = require('../../utils/languageManager');
const FOOTER = '> Powered by 🌹 Mr Tresor 🌹';

module.exports = {
  name: 'language',
  aliases: ['lang', 'langue'],
  category: '♛ Souveraineté',
  description: 'Change la langue globale du bot entre français et anglais.',
  usage: `${config.prefix || '.'}language <french|english>`,
  ownerOnly: true,
  groupOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const current = getSocketLanguage(sock);
    const requested = normalizeLanguage(args?.[0]);
    if (!requested) {
      const text = current === 'en'
        ? `╭─❑ *BOT LANGUAGE* ❑─⚯\n┃🌐 Current language: *English*\n┃🇫🇷 ${(config.prefix || '.')}language french\n┃🇬🇧 ${(config.prefix || '.')}language english\n╰━━━━━━━━━━━━━━━⚯\n\n${FOOTER}`
        : `╭─❑ *LANGUE DU BOT* ❑─⚯\n┃🌐 Langue actuelle : *Français*\n┃🇫🇷 ${(config.prefix || '.')}language french\n┃🇬🇧 ${(config.prefix || '.')}language english\n╰━━━━━━━━━━━━━━━⚯\n\n${FOOTER}`;
      return extra.reply(text);
    }
    setSocketLanguage(sock, requested);
    if (requested === 'en') {
      return extra.reply(`╭─❑ *BOT LANGUAGE* ❑─⚯\n┃✅ The entire bot is now set to *English*.\n┃🌐 Menus, commands, errors, captions and interactive buttons will be displayed in English.\n┃🇫🇷 Use ${(config.prefix || '.')}language french to switch back to French.\n╰━━━━━━━━━━━━━━━⚯\n\n${FOOTER}`);
    }
    return extra.reply(`╭─❑ *LANGUE DU BOT* ❑─⚯\n┃✅ Tout le bot est maintenant en *français*.\n┃🌐 Menus, commandes, erreurs, légendes et boutons interactifs seront affichés en français.\n┃🇬🇧 Utilise ${(config.prefix || '.')}language english pour passer en anglais.\n╰━━━━━━━━━━━━━━━⚯\n\n${FOOTER}`);
  },
};
