'use strict';

const config = require('../config');

/**
 * Tente de suivre automatiquement la newsletter officielle configurée.
 * Best-effort : un échec ne doit JAMAIS empêcher la session WhatsApp de démarrer.
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

  // Une seule tentative concurrente par socket. Si connection.update émet
  // plusieurs fois "open", on réutilise la même Promise au lieu de spammer WA.
  if (sock._dipperNewsletterFollowPromise) {
    return sock._dipperNewsletterFollowPromise;
  }

  sock._dipperNewsletterFollowPromise = (async () => {
    try {
      // Petit délai après l'ouverture du WebSocket : laisse les creds/app-state
      // terminer leur synchronisation avant l'action newsletter.
      await new Promise(resolve => setTimeout(resolve, 1500));
      await sock.newsletterFollow(jid);
      console.log(`[ChannelFollow] ✅ ${sessionLabel}: chaîne officielle suivie (${jid})`);
      return { ok: true, jid };
    } catch (err) {
      // Selon la version/état WhatsApp, "déjà abonné" peut être renvoyé comme
      // une erreur/no-op. On journalise seulement : la session reste utilisable.
      const message = String(err?.message || err || 'erreur inconnue');
      console.warn(`[ChannelFollow] ⚠️ ${sessionLabel}: follow non confirmé: ${message.slice(0, 160)}`);
      return { ok: false, reason: 'follow_failed', error: message };
    }
  })();

  return sock._dipperNewsletterFollowPromise;
}

module.exports = { ensureChannelFollow };
