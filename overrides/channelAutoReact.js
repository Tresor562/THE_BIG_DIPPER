'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { FOLLOW_DELAY_MS } = require('./channelAutoFollow');

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
    { emoji: '🛡️', test: /(cyber|securite|security|hacking|hack|vulnerabilite|vulnerability|faille|malware|phishing|protection|privacy|confidentialite)/ },
    { emoji: '🤖', test: /(^|\W)(ia|ai)(\W|$)|intelligence artificielle|machine learning|deep learning|llm|chatgpt|gemini|claude|automatisation|automation|robot/ },
    { emoji: '💻', test: /(developpement|developer|developpeur|dev\b|code\b|coding|programmation|programming|javascript|typescript|python|html|css|github|git\b|api\b|backend|frontend|web\b|application|app\b|bot\b)/ },
    { emoji: '💡', test: /(astuce|conseil|tip\b|guide|tutoriel|tutorial|tuto\b|apprendre|learn|formation|cours|explication|comment faire|saviez-vous)/ },
    { emoji: '🚀', test: /(lancement|launch|deploy|deploiement|release|sortie|disponible|nouveau projet|nouvelle version|mise a jour|update|beta|production)/ },
    { emoji: '🎉', test: /(annonce|evenement|event|concours|cadeau|giveaway|celebr|anniversaire|special)/ },
    { emoji: '❤️', test: /(merci|communaute|community|famille|ensemble|soutien|support|bienvenue|welcome|abonne|abonnes|followers)/ },
    { emoji: '👏', test: /(reussite|succes|success|objectif atteint|milestone|felicitation|bravo|accomplissement|termine|finalise)/ },
    { emoji: '🔥', test: /(nouveau|nouveaute|incroyable|puissant|performance|innovation|exclusif|exclusivite|top\b|meilleur)/ },
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

function readLocalState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    return {
      ids: Array.isArray(parsed?.recentServerIds) ? parsed.recentServerIds.map(String) : [],
      reactNext: typeof parsed?.reactNext === 'boolean' ? parsed.reactNext : true,
    };
  } catch (_) {
    return { ids: [], reactNext: true };
  }
}

function writeLocalState(ids, reactNext) {
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(
      STORE_FILE,
      JSON.stringify({ recentServerIds: ids.slice(-MAX_SEEN), reactNext, updatedAt: new Date().toISOString() }, null, 2)
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

async function loadState() {
  const local = readLocalState();
  const state = { seen: new Set(local.ids), reactNext: local.reactNext };
  const db = await getMongoDb();
  if (db) {
    try {
      const doc = await db.collection(MONGO_COLLECTION).findOne({ _id: MONGO_DOC_ID });
      for (const id of doc?.recentServerIds || []) state.seen.add(String(id));
      if (typeof doc?.reactNext === 'boolean') state.reactNext = doc.reactNext;
    } catch (_) {}
  }
  return state;
}

async function persistState(state) {
  const ids = Array.from(state.seen).slice(-MAX_SEEN);
  writeLocalState(ids, state.reactNext);

  const db = await getMongoDb();
  if (db) {
    try {
      await db.collection(MONGO_COLLECTION).updateOne(
        { _id: MONGO_DOC_ID },
        { $set: { recentServerIds: ids, reactNext: state.reactNext, updatedAt: new Date() } },
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

  const statePromise = loadState();
  sock._dipperMainChannelReactQueue = sock._dipperMainChannelReactQueue || Promise.resolve();

  const liveTimer = setTimeout(
    () => subscribeToLiveUpdates(sock, jid).catch(() => {}),
    FOLLOW_DELAY_MS + 2000
  );
  if (liveTimer.unref) liveTimer.unref();

  sock.ev.on('messages.upsert', ({ messages, type }) => {
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
          const state = await statePromise;
          if (state.seen.has(serverId)) return;

          const shouldReact = state.reactNext;
          state.reactNext = !state.reactNext;
          state.seen.add(serverId);
          while (state.seen.size > MAX_SEEN) {
            const oldest = state.seen.values().next().value;
            state.seen.delete(oldest);
          }
          await persistState(state);

          if (!shouldReact) {
            console.log(`[ChannelReact] ⏭️ Publication ${serverId} ignorée — alternance 1 sur 2`);
            return;
          }

          const text = extractPublicationText(msg);
          const emoji = chooseReactionEmoji(text, msg.message);
          await wait(2200);
          await sock.newsletterReactMessage(jid, serverId, emoji);
          console.log(`[ChannelReact] ✅ Publication ${serverId} → ${emoji}`);
        })
        .catch(err => {
          console.warn(`[ChannelReact] ⚠️ Réaction échouée pour ${serverId}: ${String(err?.message || err).slice(0, 160)}`);
        });
    }
  });

  console.log(`[ChannelReact] ✅ Auto-réactions 1 publication sur 2 activées sur le compte principal → ${jid}`);
}

module.exports = {
  installMainChannelAutoReact,
  chooseReactionEmoji,
  extractPublicationText,
};
