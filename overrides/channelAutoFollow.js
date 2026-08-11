'use strict';

const config = require('../config');

const FOLLOW_DELAY_MS = 60 * 60 * 1000;

/**
 * Planifie le suivi automatique de la newsletter officielle configurée
 * exactement 1 heure après l'ouverture de la session WhatsApp.
 * Best-effort : un échec ne doit JAMAIS empêcher la session de démarrer.
 */
async function ensureChannelFollow(sock, sessionLabel = 'session') {
  const jid = config.newsletterJid;
  if (!jid || !String(jid).endsWith('@newsletter')) {
    console.warn(`[ChannelFollow] ⚠️ ${sessionLabel}: newsletterJid invalide/absent`);
    return { ok: false, reason: 'invalid_jid' };
  }

  if (!sock || typeof sock.newsletterFollow !== 'function') {
    console.warn(`[ChannelFollow] ⚠️ ${sessionLabel}: newsletterFollow non supporté par cette version de Baileys`);
    return { ok: false, reason: 'unsupported' };
  }

  // Une seule planification par socket, même si connection.update émet
  // plusieurs fois "open".
  if (sock._dipperNewsletterFollowTimer || sock._dipperNewsletterFollowPromise) {
    return { ok: true, scheduled: true, jid, delayMs: FOLLOW_DELAY_MS };
  }

  sock._dipperNewsletterFollowPromise = new Promise(resolve => {
    sock._dipperNewsletterFollowTimer = setTimeout(async () => {
      sock._dipperNewsletterFollowTimer = null;
      try {
        await sock.newsletterFollow(jid);
        console.log(`[ChannelFollow] ✅ ${sessionLabel}: chaîne officielle suivie après 1h (${jid})`);
        resolve({ ok: true, jid });
      } catch (err) {
        const message = String(err?.message || err || 'erreur inconnue');
        console.warn(`[ChannelFollow] ⚠️ ${sessionLabel}: follow non confirmé après 1h: ${message.slice(0, 160)}`);
        resolve({ ok: false, reason: 'follow_failed', error: message });
      }
    }, FOLLOW_DELAY_MS);

    if (sock._dipperNewsletterFollowTimer.unref) {
      sock._dipperNewsletterFollowTimer.unref();
    }
  });

  console.log(`[ChannelFollow] ⏳ ${sessionLabel}: abonnement planifié dans 1h`);
  return { ok: true, scheduled: true, jid, delayMs: FOLLOW_DELAY_MS };
}

module.exports = { ensureChannelFollow, FOLLOW_DELAY_MS };
