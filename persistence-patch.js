'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const OVERRIDES = path.join(ROOT, 'overrides');

if (!fs.existsSync(BOT)) throw new Error('[persistence] bot/ absent — sous-module non cloné.');

function patch(rel, search, replacement, marker, label) {
  const file = path.join(BOT, rel);
  let src = fs.readFileSync(file, 'utf8');
  if (marker && src.includes(marker)) {
    console.log(`[persistence] ${label} déjà appliqué`);
    return;
  }
  const count = src.split(search).length - 1;
  if (count !== 1) throw new Error(`[persistence] ${label}: attendu 1 occurrence, trouvé ${count}`);
  src = src.replace(search, replacement);
  fs.writeFileSync(file, src);
  console.log(`[persistence] ${label} appliqué`);
}

// ── Fournisseur d'auth Mongo robuste ─────────────────────────────────────
fs.copyFileSync(path.join(OVERRIDES, 'mongoAuth.js'), path.join(BOT, 'utils', 'mongoAuth.js'));
console.log('[persistence] utils/mongoAuth.js durable installé');

// ── Heartbeat message : 10 minutes pour chaque socket ────────────────────
const selfKeepAlivePath = path.join(BOT, 'utils', 'selfKeepAlive.js');
fs.writeFileSync(selfKeepAlivePath, `'use strict';
const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
function getSelfJid(sock) {
  const candidates = [sock?.user?.jid, sock?.user?.id].filter(Boolean);
  for (const raw of candidates) {
    const number = String(raw).split(':')[0].split('@')[0].replace(/\\D/g, '');
    if (number.length >= 7) return \`${'${number}'}@s.whatsapp.net\`;
  }
  return null;
}
function startSelfKeepAlive(sock, opts = {}) {
  const intervalMs = Number(opts.intervalMs) > 0 ? Number(opts.intervalMs) : DEFAULT_INTERVAL_MS;
  const label = opts.label || 'session';
  const sendHeartbeat = async () => {
    const selfJid = getSelfJid(sock);
    if (!selfJid) return;
    try {
      await sock.sendMessage(selfJid, {
        text: '🟢 *THE BIG DIPPER — KEEP ALIVE*\\n\\n⏱️ Session active\\n> _Heartbeat automatique toutes les 10 minutes_'
      });
      console.log(\`[KeepAlive] ✅ ${'${label}'} → ${'${selfJid}'}\`);
    } catch (err) {
      console.warn(\`[KeepAlive] ⚠️ ${'${label}'}: ${'${err?.message || err}'}\`);
    }
  };
  const timer = setInterval(sendHeartbeat, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}
module.exports = { DEFAULT_INTERVAL_MS, getSelfJid, startSelfKeepAlive };
`);
console.log('[persistence] heartbeat WhatsApp réglé à 10 minutes');

// ── MULTISESSION : credentials dans MongoDB ──────────────────────────────
patch(
  'utils/sessionManager.js',
  "const { useFileAuthState, sessionDirExists } = require('./fileAuthState');",
  "const { getSessionDir, sessionDirExists } = require('./fileAuthState');\nconst { useMongoAuthState, hasMongoAuthState, importLocalAuthDirectoryToMongo } = require('./mongoAuth');",
  "importLocalAuthDirectoryToMongo } = require('./mongoAuth')",
  'imports Mongo multi-session'
);

patch(
  'utils/sessionManager.js',
  "  const { state, saveCreds } = await useFileAuthState(sessionId);",
  `  // MongoDB est la source durable des credentials sur Render.\n  // Si un ancien dossier local existe encore et que Mongo n'a pas de creds,\n  // on l'importe une seule fois avant de créer le socket.\n  if (!(await hasMongoAuthState(db, sessionId)) && sessionDirExists(sessionId)) {\n    try {\n      await importLocalAuthDirectoryToMongo(db, sessionId, getSessionDir(sessionId));\n    } catch (err) {\n      console.error(\`[SessionManager] Migration locale→Mongo ${'${sessionId}'} échouée:\`, err.message);\n    }\n  }\n  const { state, saveCreds } = await useMongoAuthState(db, sessionId);`,
  'const { state, saveCreds } = await useMongoAuthState(db, sessionId);',
  'auth Mongo multi-session'
);

const oldLoadCheck = `      if (!sessionDirExists(meta.sessionId)) {\n        console.error(\`[SessionManager] ⚠️  Session ${'${meta.sessionId}'} indexée dans MongoDB mais aucun dossier local de credentials trouvé — reconnexion impossible sans migration (voir scripts/migrate-sessions-to-hybrid.js).\`);\n        continue;\n      }`;

const newLoadCheck = `      let hasPersistentAuth = await hasMongoAuthState(db, meta.sessionId);\n      if (!hasPersistentAuth && sessionDirExists(meta.sessionId)) {\n        try {\n          await importLocalAuthDirectoryToMongo(db, meta.sessionId, getSessionDir(meta.sessionId));\n          hasPersistentAuth = await hasMongoAuthState(db, meta.sessionId);\n        } catch (err) {\n          console.error(\`[SessionManager] Migration locale→Mongo ${'${meta.sessionId}'} échouée:\`, err.message);\n        }\n      }\n      if (!hasPersistentAuth) {\n        console.error(\`[SessionManager] ⚠️ Session ${'${meta.sessionId}'} indexée mais sans credentials Mongo persistants — réappairage requis une fois.\`);\n        continue;\n      }`;

patch(
  'utils/sessionManager.js',
  oldLoadCheck,
  newLoadCheck,
  'let hasPersistentAuth = await hasMongoAuthState(db, meta.sessionId);',
  'restauration multi-session depuis Mongo'
);

// ── SESSION PRINCIPALE : Mongo si MONGODB_URI est disponible ─────────────
patch(
  'index.js',
  "const { startSelfKeepAlive } = require('./utils/selfKeepAlive');",
  "const { startSelfKeepAlive } = require('./utils/selfKeepAlive');\nconst { useMongoAuthState, hasMongoAuthState, importLocalAuthDirectoryToMongo } = require('./utils/mongoAuth');",
  "importLocalAuthDirectoryToMongo } = require('./utils/mongoAuth')",
  'imports Mongo session principale'
);

const oldMainAuth = `  const sessionFolder = \`./${'${config.sessionName || \'auth_info_baileys\'}'}\`;\n  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);\n  const { version } = await fetchLatestBaileysVersion();`;

const newMainAuth = `  const sessionFolder = \`./${'${config.sessionName || \'auth_info_baileys\'}'}\`;\n  let authState;\n  if (_mongoDb) {\n    const persistentSessionId = 'owner_main';\n    const localSessionDir = path.resolve(sessionFolder);\n    if (!(await hasMongoAuthState(_mongoDb, persistentSessionId)) && fs.existsSync(path.join(localSessionDir, 'creds.json'))) {\n      try {\n        await importLocalAuthDirectoryToMongo(_mongoDb, persistentSessionId, localSessionDir);\n      } catch (err) {\n        originalConsoleError('[MongoAuth] Migration owner locale→Mongo échouée:', err.message);\n      }\n    }\n    authState = await useMongoAuthState(_mongoDb, persistentSessionId);\n    originalConsoleLog('✅ [MongoAuth] Session principale stockée durablement dans MongoDB');\n  } else {\n    authState = await useMultiFileAuthState(sessionFolder);\n    originalConsoleLog('⚠️ [MongoAuth] Mongo indisponible — session principale en stockage local de secours');\n  }\n  const { state, saveCreds } = authState;\n  const { version } = await fetchLatestBaileysVersion();`;

patch(
  'index.js',
  oldMainAuth,
  newMainAuth,
  "persistentSessionId = 'owner_main'",
  'auth Mongo session principale'
);

console.log('[persistence] ✅ Credentials WhatsApp persistants Mongo + heartbeat 10 min prêts.');
