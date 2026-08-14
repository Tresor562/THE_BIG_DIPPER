'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_LANGUAGE = 'fr';
const SUPPORTED = new Set(['fr', 'en']);
const cache = new Map();
const translationCache = new Map();
const MAX_TRANSLATION_CACHE = 1200;
const MAX_TRANSLATION_CHUNK = 2800;

const SMALL_CAPS = Object.freeze({
  'ᴀ':'a','ʙ':'b','ᴄ':'c','ᴅ':'d','ᴇ':'e','ꜰ':'f','ғ':'f','ɢ':'g','ʜ':'h','ɪ':'i','ᴊ':'j','ᴋ':'k','ʟ':'l','ᴍ':'m','ɴ':'n','ᴏ':'o','ᴘ':'p','ǫ':'q','ʀ':'r','ꜱ':'s','ѕ':'s','ᴛ':'t','ᴜ':'u','ᴠ':'v','ᴡ':'w','x':'x','ʏ':'y','ᴢ':'z',
});

function normalizeSessionId(value) {
  const raw = String(value || 'default').trim() || 'default';
  return raw.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 100) || 'default';
}
function languageFile(sessionId) {
  return path.join(process.cwd(), 'database', 'sessions', normalizeSessionId(sessionId), 'language.json');
}
function normalizeLanguage(value) {
  const v = String(value || '').trim().toLowerCase();
  if (['en', 'eng', 'english', 'anglais'].includes(v)) return 'en';
  if (['fr', 'fra', 'fre', 'french', 'français', 'francais'].includes(v)) return 'fr';
  return null;
}
function getLanguage(sessionId = 'default') {
  const id = normalizeSessionId(sessionId);
  if (cache.has(id)) return cache.get(id);
  let lang = DEFAULT_LANGUAGE;
  try {
    const file = languageFile(id);
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (SUPPORTED.has(parsed?.language)) lang = parsed.language;
    }
  } catch (_) {}
  cache.set(id, lang);
  return lang;
}
function setLanguage(sessionId, language) {
  const id = normalizeSessionId(sessionId);
  const lang = normalizeLanguage(language);
  if (!lang) throw new Error('Unsupported language');
  const file = languageFile(id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ language: lang, updatedAt: new Date().toISOString() }, null, 2));
  fs.renameSync(tmp, file);
  cache.set(id, lang);
  return lang;
}
function normalizeDecorativeLatin(input) {
  const normalized = String(input || '').normalize('NFKC');
  return Array.from(normalized, ch => SMALL_CAPS[ch] || ch).join('');
}
function protectText(input) {
  const tokens = [];
  let text = String(input || '');
  const patterns = [
    /```[\s\S]*?```/g,
    /https?:\/\/[^\s)>\]}]+/gi,
    /`[^`\n]+`/g,
    />\s*Powered by 🌹 Mr Tresor 🌹/gi,
    /THE BIG DIPPER/gi,
    /🌹 Mr Tresor 🌹/gi,
    /@[0-9A-Za-z_.:+-]+/g,
    /(?:^|\s)[.!/#][a-zA-Z0-9_+-]+/g,
  ];
  for (const pattern of patterns) {
    text = text.replace(pattern, match => {
      const lead = /^\s/.test(match) ? match[0] : '';
      const value = lead ? match.slice(1) : match;
      const token = `ZXQDIPPER${tokens.length}QXZ`;
      tokens.push(value);
      return lead + token;
    });
  }
  return { text, tokens };
}
function restoreText(text, tokens) {
  let out = String(text || '');
  tokens.forEach((value, index) => {
    const compact = `ZXQDIPPER${index}QXZ`;
    const spaced = `ZXQ DIPPER ${index} QXZ`;
    out = out.replaceAll(compact, value).replaceAll(spaced, value);
  });
  return out;
}
function shouldTranslate(text) {
  const value = normalizeDecorativeLatin(String(text || '')).trim();
  if (!value || /^https?:\/\/\S+$/.test(value)) return false;
  if (/^[\d\s+._:/@#*`>|=\-]+$/.test(value)) return false;
  return /[A-Za-zÀ-ÿ]/.test(value);
}
function splitForTranslation(text, max = MAX_TRANSLATION_CHUNK) {
  const source = String(text || '');
  if (source.length <= max) return [source];
  const chunks = [];
  let current = '';
  for (const line of source.split(/(?<=\n)/)) {
    if (line.length > max) {
      if (current) { chunks.push(current); current = ''; }
      for (let i = 0; i < line.length; i += max) chunks.push(line.slice(i, i + max));
      continue;
    }
    if (current.length + line.length > max && current) {
      chunks.push(current);
      current = line;
    } else current += line;
  }
  if (current) chunks.push(current);
  return chunks;
}
let translateFnPromise = null;
async function getTranslateFn() {
  if (!translateFnPromise) {
    translateFnPromise = import('@vitalets/google-translate-api')
      .then(mod => mod.translate || mod.default?.translate || mod.default)
      .catch(() => null);
  }
  return translateFnPromise;
}
const FALLBACK_REPLACEMENTS = [
  [/Commande inconnue/gi, 'Unknown command'], [/commandes disponibles/gi, 'available commands'],
  [/Traitement en cours/gi, 'Processing'], [/Patiente/gi, 'Please wait'], [/Accès refusé/gi, 'Access denied'],
  [/réservé aux/gi, 'reserved for'], [/Le bot est actuellement en mode silencieux/gi, 'The bot is currently muted'],
  [/Le bot est actuellement en mode privé/gi, 'The bot is currently in private mode'], [/Cette commande/gi, 'This command'],
  [/Informations système/gi, 'System information'], [/Infos système/gi, 'System info'], [/Téléchargements/gi, 'Downloads'],
  [/Outils généraux/gi, 'General tools'], [/Gestion de groupe/gi, 'Group management'], [/Langue actuelle/gi, 'Current language'],
  [/groupe/gi, 'group'], [/utilisateur/gi, 'user'], [/propriétaire/gi, 'owner'], [/administrateur/gi, 'administrator'],
  [/commande/gi, 'command'], [/Erreur/gi, 'Error'], [/Échec/gi, 'Failure'], [/Succès/gi, 'Success'],
  [/Langue/gi, 'Language'], [/Français/gi, 'French'], [/Anglais/gi, 'English'],
];
function fallbackEnglish(text) {
  let out = normalizeDecorativeLatin(String(text || ''));
  for (const [pattern, replacement] of FALLBACK_REPLACEMENTS) out = out.replace(pattern, replacement);
  return out;
}
async function translateShortText(source) {
  const normalized = normalizeDecorativeLatin(source);
  const { text: protectedText, tokens } = protectText(normalized);
  let translated = null;
  const fn = await getTranslateFn();
  if (typeof fn === 'function') {
    for (let attempt = 0; attempt < 2 && !translated; attempt++) {
      try {
        const result = await Promise.race([
          fn(protectedText, { to: 'en' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('translation timeout')), 7000)),
        ]);
        translated = typeof result === 'string' ? result : result?.text;
      } catch (_) { if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 250)); }
    }
  }
  let out = translated ? restoreText(translated, tokens) : fallbackEnglish(source);
  out = out.replace(/>\s*Powered by 🌹 Mr Tresor 🌹/gi, '> Powered by 🌹 Mr Tresor 🌹');
  return out;
}
async function translateText(text, target = 'en') {
  const source = String(text ?? '');
  if (target !== 'en' || !shouldTranslate(source)) return source;
  const key = `en:${source}`;
  if (translationCache.has(key)) return translationCache.get(key);
  const parts = splitForTranslation(source);
  const translatedParts = [];
  for (const part of parts) translatedParts.push(await translateShortText(part));
  const out = translatedParts.join('');
  translationCache.set(key, out);
  if (translationCache.size > MAX_TRANSLATION_CACHE) translationCache.delete(translationCache.keys().next().value);
  return out;
}
const TRANSLATABLE_KEYS = new Set([
  'text','caption','title','subtitle','description','footer','footerText','contentText','buttonText','displayText','selectedDisplayText','display_text','body','header','label',
]);
async function translateButtonParamsJson(value) {
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return value;
  try {
    const obj = JSON.parse(value);
    for (const key of ['display_text','title','description','text','buttonText','displayText']) {
      if (typeof obj[key] === 'string') obj[key] = await translateText(obj[key], 'en');
    }
    return JSON.stringify(obj);
  } catch (_) { return value; }
}
async function translateNode(node, seen = new WeakSet(), keyHint = '') {
  if (node == null) return node;
  if (typeof node === 'string') {
    if (keyHint === 'buttonParamsJson') return translateButtonParamsJson(node);
    if (TRANSLATABLE_KEYS.has(keyHint)) return translateText(node, 'en');
    return node;
  }
  if (typeof node !== 'object' || Buffer.isBuffer(node) || node instanceof Uint8Array) return node;
  if (seen.has(node)) return node;
  seen.add(node);
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) node[i] = await translateNode(node[i], seen, keyHint);
    return node;
  }
  for (const key of Object.keys(node)) {
    if (['vcard','url','sourceUrl','mediaUrl','newsletterName','displayName','id','jid'].includes(key)) continue;
    const value = node[key];
    if (typeof value === 'string' && (TRANSLATABLE_KEYS.has(key) || key === 'buttonParamsJson')) {
      node[key] = key === 'buttonParamsJson' ? await translateButtonParamsJson(value) : await translateText(value, 'en');
    } else if (value && typeof value === 'object') await translateNode(value, seen, key);
  }
  return node;
}
async function translatePayload(payload, language) {
  if (language !== 'en' || !payload || typeof payload !== 'object') return payload;
  return translateNode(payload);
}
async function installLanguageMiddleware(sock, sessionId = 'default') {
  if (!sock) return sock;
  const id = normalizeSessionId(sessionId);
  sock.__dipperLanguageSessionId = id;
  sock.__botLanguage = getLanguage(id);
  if (sock.__dipperLanguageMiddlewareInstalled) return sock;
  sock.__dipperLanguageMiddlewareInstalled = true;
  if (typeof sock.sendMessage === 'function') {
    const originalSendMessage = sock.sendMessage.bind(sock);
    sock.sendMessage = async (jid, payload, options) => {
      const lang = sock.__botLanguage || getLanguage(id);
      return originalSendMessage(jid, lang === 'en' ? await translatePayload(payload, lang) : payload, options);
    };
  }
  if (typeof sock.relayMessage === 'function') {
    const originalRelayMessage = sock.relayMessage.bind(sock);
    sock.relayMessage = async (jid, message, options) => {
      const lang = sock.__botLanguage || getLanguage(id);
      return originalRelayMessage(jid, lang === 'en' ? await translatePayload(message, lang) : message, options);
    };
  }
  return sock;
}
function setSocketLanguage(sock, language) {
  const lang = normalizeLanguage(language);
  if (!lang) throw new Error('Unsupported language');
  const id = sock?.__dipperLanguageSessionId || 'default';
  setLanguage(id, lang);
  if (sock) sock.__botLanguage = lang;
  return lang;
}
function getSocketLanguage(sock) {
  return sock?.__botLanguage || getLanguage(sock?.__dipperLanguageSessionId || 'default');
}
module.exports = { DEFAULT_LANGUAGE, normalizeLanguage, getLanguage, setLanguage, getSocketLanguage, setSocketLanguage, translateText, translatePayload, installLanguageMiddleware };
