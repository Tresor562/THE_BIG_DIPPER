'use strict';

const config = require('../../config');
const database = require('../../database');
const { runCoupleDay, ensureCoupleSchedule } = require('../../utils/groupEngagement');

const prefix = config.prefix || '.';

function canManage(extra, msg) {
  return !!(extra?.isOwner || extra?.isSupremeOwner || extra?.isAdmin || msg?.key?.fromMe);
}

module.exports = {
  name: 'coupleday',
  aliases: ['coupledujour', 'dailycouple', 'coupleofday'],
  category: '⚙️ Gestion de groupe',
  description: 'Couple du jour automatique à une heure aléatoire.',
  usage: `${prefix}coupleday [status|on|off|now]`,
  groupOnly: true,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    // IMPORTANT : extra.from est le JID du groupe courant. CoupleDay est donc
    // activé/désactivé uniquement pour ce groupe et jamais globalement.
    const from = extra.from;
    const sub = String(args[0] || 'status').toLowerCase();

    if (sub === 'on' || sub === 'off') {
      if (!canManage(extra, msg)) return extra.reply(`🔒 Seuls les administrateurs peuvent modifier CoupleDay.\n\n${extra.phrases.footer()}`);
      const enabled = sub === 'on';
      database.updateGroupSettings(from, { coupleday: enabled }); // [COUPLEDAY GROUP SCOPED]
      const schedule = ensureCoupleSchedule(from);
      return extra.reply(
        `${enabled ? '💞✅' : '💔⛔'} *CoupleDay ${enabled ? 'activé' : 'désactivé'} dans ce groupe uniquement.*\n` +
        `${enabled ? `Prochain tirage de ce groupe prévu autour de *${schedule.targetLabel}*.` : 'Aucun couple automatique ne sera publié dans ce groupe.'}\n\n` +
        `${extra.phrases.footer()}`
      );
    }

    if (sub === 'now') {
      if (!canManage(extra, msg)) return extra.reply(`🔒 Seuls les administrateurs peuvent lancer un tirage manuel.\n\n${extra.phrases.footer()}`);
      try {
        const result = await runCoupleDay(sock, from, { force: true });
        if (result?.sent) return;
        if (result?.skipped === 'not-enough-members') return extra.reply(`❌ Il faut au moins deux membres éligibles dans ce groupe.\n\n${extra.phrases.footer()}`);
        return extra.reply(`❌ Tirage CoupleDay impossible pour le moment.\n\n${extra.phrases.footer()}`);
      } catch (err) {
        return extra.reply(`❌ CoupleDay : ${err.message}\n\n${extra.phrases.footer()}`);
      }
    }

    const settings = database.getGroupSettings(from);
    const enabled = settings?.coupleday === true; // [COUPLEDAY EXPLICIT ON]
    const schedule = ensureCoupleSchedule(from);
    return extra.reply(
      `💞 *COUPLE DU JOUR*\n` +
      `État dans ce groupe : *${enabled ? 'ACTIF ✅' : 'DÉSACTIVÉ ⛔'}*\n` +
      `Portée : *ce groupe uniquement*\n` +
      `Heure aléatoire d’aujourd’hui : *${schedule.targetLabel}*\n` +
      `Déjà publié aujourd’hui : *${schedule.sent ? 'Oui' : 'Non'}*\n\n` +
      `${extra.phrases.footer()}`
    );
  },
};
