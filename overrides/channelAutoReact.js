'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');

const MAX_SEEN = 500;
const STORE_FILE = path.join(process.cwd(), 'database', 'main_channel_reactions.json');
const MONGO_COLLECTION = 'bot_runtime_config';
const MONGO_DOC_ID = 'main_channel_reactions';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function unwrapMessage(message) {
  let m = message || {};
  if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
  if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
  if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
  if (m.viewOnceMessageV2Extension?.message) m = m.viewOnceMessageV2Extension.message;
  if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;
  return m || {};
}

function extractPublicationText(msg) {
  const m = unwrapMessage(msg?.message);
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.pollCreationMessage?.name ||
    ''
  );
}

function isPublicationMessage(msg) {
  const m = unwrapMessage(msg?.message);
  if (!m || typeof m !== 'object') return false;
  if (m.protocolMessage || m.reactionMessage || m.senderKeyDistributionMessage) return false;
  return !!(
    m.conversation ||
    m.extendedTextMessage ||
    m.imageMessage ||
    m.videoMessage ||
    m.documentMessage ||
    m.audioMessage ||
    m.pollCreationMessage ||
    m.stickerMessage
  );
}

function chooseReactionEmoji(text, rawMessage) {
  const t = normalizeText(text);
  const m = unwrapMessage(rawMessage);

  const rules = [
    {
      emoji: '🛡️',
      test: /(cyber|securite|security|hacking|hack|vulnerabilite|vulnerability|faille|malware|phishing|protection|privacy|confidentialite)/,
    },
    {
      emoji: '🤖',
      test: /(^|\W)(ia|ai)(\W|$)|intelligence artificielle|machine learning|deep learning|llm|chatgpt|gemini|claude|automatisation|automation|robot/,
    },
    {
      emoji: '💻',
      test: /(developpement|developer|developpeur|dev\b|code\b|coding|programmation|programming|javascript|typescript|python|html|css|github|git\b|api\b|backend|frontend|web\b|application|app\b|bot\b)/,
    },
    {
      emoji: '💡',
      test: /(astuce|conseil|tip\b|guide|tutoriel|tutorial|tuto\b|apprendre|learn|formation|cours|explication|comment faire|saviez-vous)/,
    },
    {
      emoji: '🚀',
      test: /(lancement|launch|deploy|deploiement|release|sortie|disponible|nouveau projet|nouvelle version|mise a jour|update|beta|production)/,
    },
    {
      emoji: '🎉',
      test: /(annonce|evenement|event|concours|cadeau|giveaway|celebr|anniversaire|special)/,
    },
    {
      emoji: '❤️',
      test: /(merci|communaute|community|famille|ensemble|soutien|support|bienvenue|welcome|abonne|abonnes|followers)/,
    },
    {
      emoji: '👏',
      test: /(reussite|succes|success|objectif atteint|milestone|felicitation|bravo|accomplissement|termine|finalise)/,
    },
    {
      emoji: '🔥',
      test: /(nouveau|nouveaute|incroyable|puissant|performance|innovation|exclusif|exclusivite|top\b|meilleur)/,
    },
  ];

  for (const rule of rules) {
    if (rule.test.test(t)) return rule.emoji;
  }

  if (m.imageMessage) return '❤️';
  if (m.videoMessage) return '🔥';
  if (m.audioMessage) return '🎧';
  if (m.pollCreationMessage) return '👍';
  return '👍';
}

function readLocalSeen() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    return Array.isArray(parsed?.recentServerIds) ? parsed.recentServerIds.map(String) : [];
  } catch (_) {
    return [];
  }
}

function writeLocalSeen(ids) {
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(
      STORE_FILE,
      JSON.stringify({ recentServerIds: ids.slice(-MAX_SEEN), updatedAt: new Date().toISOString() }, null, 2)
    );
  } catch (_) {}
}

async function getMongoDb() {
  if (!process.env.MONGODB_URI) return null;
  try {
    return await require('./mongoClient').getDb();
  } catch (_) {
    return null;
  }
}

async function loadSeen() {
  const ids = new Set(readLocalSeen());
  const db = await getMongoDb();
  if (db) {
    try {
      const doc = await db.collection(MONGO_COLLECTION).findOne({ _id: MONGO_DOC_ID });
      for (const id of doc?.recentServerIds || []) ids.add(String(id));
    } catch (_) {}
  }
  return ids;
}

async function persistSeen(seen) {
  const ids = Array.from(seen).slice(-MAX_SEEN);
  writeLocalSeen(ids);

  const db = await getMongoDb();
  if (db) {
    try {
      await db.collection(MONGO_COLLECTION).updateOne(
        { _id: MONGO_DOC_ID },
        { $set: { recentServerIds: ids, updatedAt: new Date() } },
        { upsert: true }
      );
    } catch (err) {
      console.warn('[ChannelReact] ⚠️ Persistance Mongo échouée:', err.message);
    }
  }
}

async function subscribeToLiveUpdates(sock, jid) {
  if (typeof sock.subscribeNewsletterUpdates !== 'function') return;
  try {
    const result = await sock.subscribeNewsletterUpdates(jid);
    console.log(`[ChannelReact] 📡 Live updates actifs${result?.duration ? ` (${result.duration})` : ''}`);
  } catch (err) {
    console.warn('[ChannelReact] ⚠️ Abonnement live updates non confirmé:', err.message);
  }
}

async function installMainChannelAutoReact(sock) {
  if (!sock || sock._dipperMainChannelReactInstalled) return;
  sock._dipperMainChannelReactInstalled = true;

  const jid = config.newsletterJid;
  if (!jid || !String(jid).endsWith('@newsletter')) {
    console.warn('[ChannelReact] ⚠️ newsletterJid invalide/absent');
    return;
  }

  if (typeof sock.newsletterReactMessage !== 'function') {
    console.warn('[ChannelReact] ⚠️ newsletterReactMessage non supporté par cette version de Baileys');
    return;
  }

  const seenPromise = loadSeen();
  sock._dipperMainChannelReactQueue = sock._dipperMainChannelReactQueue || Promise.resolve();

  // Le follow est effectué juste avant par channelAutoFollow. On demande ensuite
  // les live updates pour recevoir les nouvelles publications sans scruter la chaîne.
  setTimeout(() => subscribeToLiveUpdates(sock, jid).catch(() => {}), 2000);

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    // Réagir uniquement aux NOUVELLES publications, jamais à l'historique synchronisé.
    if (type !== 'notify') return;

    for (const msg of messages || []) {
      if (msg?.key?.remoteJid !== jid) continue;
      if (!msg.message || !isPublicationMessage(msg)) continue;

      const serverId = msg.key?.server_id != null ? String(msg.key.server_id) : '';
      if (!serverId) {
        console.warn('[ChannelReact] ⚠️ Publication ignorée: server_id absent');
        continue;
      }

      sock._dipperMainChannelReactQueue = sock._dipperMainChannelReactQueue
        .then(async () => {
          const seen = await seenPromise;
          if (seen.has(serverId)) return;

          const text = extractPublicationText(msg);
          const emoji = chooseReactionEmoji(text, msg.message);

          // Petit délai naturel et surtout temps laissé à WhatsApp pour finaliser
          // l'enregistrement serveur de la publication avant la réaction.
          await wait(2200);
          await sock.newsletterReactMessage(jid, serverId, emoji);

          seen.add(serverId);
          while (seen.size > MAX_SEEN) {
            const oldest = seen.values().next().value;
            seen.delete(oldest);
          }
          await persistSeen(seen);
          console.log(`[ChannelReact] ✅ Publication ${serverId} → ${emoji}`);
        })
        .catch(err => {
          console.warn(`[ChannelReact] ⚠️ Réaction échouée pour ${serverId}: ${String(err?.message || err).slice(0, 160)}`);
        });
    }
  });

  console.log(`[ChannelReact] ✅ Auto-réactions intelligentes activées sur le compte principal → ${jid}`);
}

module.exports = {
  installMainChannelAutoReact,
  chooseReactionEmoji,
  extractPublicationText,
};
