'use strict';

const config = require('../../config');
const { getPrefix, setPrefix, validatePrefix } = require('../../utils/prefixManager');

module.exports = {
  name: 'setprefix',
  aliases: ['setpfx', 'changeprefix'],
  category: '🔧 Configuration',
  description: 'Modifie le préfixe du bot avec un symbole ou un emoji.',
  usage: 'setprefix <symbole|emoji>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const current = getPrefix();
    const requested = args.join(' ').trim();

    if (!requested) {
      return extra.reply(
        `⚙️ *PRÉFIXE DU BOT*\n\n` +
        `Préfixe actuel : *${current}*\n\n` +
        `Utilisation : *${current}setprefix <symbole ou emoji>*\n\n` +
        `Exemples :\n` +
        `• ${current}setprefix !\n` +
        `• ${current}setprefix ⚡\n` +
        `• ${current}setprefix 🔥\n` +
        `• ${current}setprefix ☠️\n` +
        `• ${current}setprefix 🔥⚡\n\n` +
        `❌ Lettres, chiffres et espaces interdits.`
      );
    }

    const validation = validatePrefix(requested);
    if (!validation.ok) {
      return extra.reply(`❌ *Préfixe refusé*\n\n${validation.reason}`);
    }

    const previous = config.prefix || current;
    const result = await setPrefix(validation.prefix);
    if (!result.ok) {
      return extra.reply(`❌ *Préfixe refusé*\n\n${result.reason || 'Valeur invalide.'}`);
    }

    const persistence = result.mongoPersisted
      ? '💾 Sauvegardé durablement.'
      : '💾 Sauvegardé localement (Mongo indisponible).';

    return extra.reply(
      `✅ *PRÉFIXE MODIFIÉ*\n\n` +
      `Ancien : *${previous}*\n` +
      `Nouveau : *${result.prefix}*\n\n` +
      `Exemple : *${result.prefix}menu*\n` +
      `${persistence}`
    );
  },
};
