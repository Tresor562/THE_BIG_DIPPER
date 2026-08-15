'use strict';

const config = require('../../config');
const database = require('../../database');
const { getMemberLevel, getLeaderboard } = require('../../utils/groupstats');
const { sendLevelCard } = require('../../utils/groupEngagement');

const prefix = config.prefix || '.';

function targetFromMessage(msg, fallback) {
  const ctx = msg?.message?.extendedTextMessage?.contextInfo;
  return ctx?.mentionedJid?.[0] || ctx?.participant || fallback;
}

function canManage(extra, msg) {
  return !!(extra?.isOwner || extra?.isSupremeOwner || extra?.isAdmin || msg?.key?.fromMe);
}

module.exports = {
  name: 'grouplevel',
  aliases: ['level', 'grouplvl', 'lvl', 'levelgroupe'],
  category: '⚙️ Gestion de groupe',
  description: 'Niveau de participation d’un membre selon ses messages dans le groupe.',
  usage: `${prefix}grouplevel [@membre|top|on|off|status]`,
  groupOnly: true,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    // IMPORTANT : extra.from est le JID du groupe courant. Le réglage est donc
    // enregistré uniquement sous ce groupe, jamais comme réglage global.
    const from = extra.from;
    const sub = String(args[0] || '').toLowerCase();
    const settings = database.getGroupSettings(from);

    if (sub === 'on' || sub === 'off') {
      if (!canManage(extra, msg)) return extra.reply(`🔒 Seuls les administrateurs peuvent modifier GroupLevel.\n\n${extra.phrases.footer()}`);
      const enabled = sub === 'on';
      database.updateGroupSettings(from, { grouplevel: enabled }); // [GROUPLEVEL GROUP SCOPED]
      return extra.reply(
        `${enabled ? '✅' : '⛔'} *GroupLevel ${enabled ? 'activé' : 'désactivé'} dans ce groupe uniquement.*\n` +
        `${enabled ? 'Les messages et LEVEL UP seront suivis uniquement ici.' : 'Le comptage automatique est arrêté ici ; l’historique déjà enregistré reste conservé.'}\n\n` +
        `${extra.phrases.footer()}`
      );
    }

    if (sub === 'status') {
      const enabled = settings?.grouplevel === true; // [GROUPLEVEL EXPLICIT ON]
      return extra.reply(
        `🎮 *GROUP LEVEL*\n` +
        `État dans ce groupe : *${enabled ? 'ACTIF ✅' : 'DÉSACTIVÉ ⛔'}*\n` +
        `Portée : *ce groupe uniquement*\n` +
        `Base : nombre total de messages envoyés dans ce groupe.\n\n` +
        `${extra.phrases.footer()}`
      );
    }

    if (sub === 'top' || sub === 'leaderboard' || sub === 'classement') {
      const leaders = getLeaderboard(from, 10);
      if (!leaders.length) return extra.reply(`📊 Aucun message comptabilisé pour le moment.\n\n${extra.phrases.footer()}`);
      const lines = leaders.map((entry, index) => {
        const medal = ['🥇', '🥈', '🥉'][index] || `${index + 1}.`;
        const num = String(entry.jid).split(':')[0].split('@')[0];
        return `${medal} @${num} — *Level ${entry.level}* • ${entry.messages} msg`;
      }).join('\n');
      return sock.sendMessage(from, {
        text: `🏆 *GROUP LEVEL — TOP 10*\n\n${lines}\n\n${extra.phrases.footer()}`,
        mentions: leaders.map(x => x.jid),
      }, { quoted: msg });
    }

    const target = targetFromMessage(msg, extra.sender || msg.key.participant || msg.key.remoteJid);
    const info = getMemberLevel(from, target);
    try {
      await sendLevelCard(sock, from, target, info, { quoted: msg, levelUp: false });
    } catch (err) {
      console.error('[grouplevel command]', err);
      return extra.reply(`❌ Impossible de générer la carte de niveau : ${err.message}\n\n${extra.phrases.footer()}`);
    }
  },
};
