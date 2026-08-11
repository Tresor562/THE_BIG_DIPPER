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

const newLoadCheck = `      // Le numéro principal est démarré par index.js avec la même collection\n      // auth_session_<numéro>. Le lancer ici créerait deux sockets concurrents.\n      const configuredMain = String(process.env.PHONE_NUMBER || '').replace(/\\D/g, '');\n      if (configuredMain && phoneNumber === configuredMain) {\n        console.log(\`[SessionManager] ⏭️ ${'${meta.sessionId}'} réservé à la session principale — chargement par index.js\`);\n        continue;\n      }\n\n      let hasPersistentAuth;\n      try {\n        hasPersistentAuth = await hasMongoAuthState(db, meta.sessionId);\n      } catch (err) {\n        console.error(\`[SessionManager] ⚠️ Vérification auth Mongo ${'${meta.sessionId}'} impossible — session ignorée pour ce cycle: ${'${err.message}'}\`);\n        continue;\n      }\n      if (!hasPersistentAuth && sessionDirExists(meta.sessionId)) {\n        try {\n          await importLocalAuthDirectoryToMongo(db, meta.sessionId, getSessionDir(meta.sessionId));\n          hasPersistentAuth = await hasMongoAuthState(db, meta.sessionId);\n        } catch (err) {\n          console.error(\`[SessionManager] Migration locale→Mongo ${'${meta.sessionId}'} échouée:\`, err.message);\n        }\n      }\n      if (!hasPersistentAuth) {\n        console.error(\`[SessionManager] ⚠️ Session ${'${meta.sessionId}'} indexée mais sans credentials Mongo persistants — réappairage requis une fois.\`);\n        continue;\n      }`;

patch(
  'utils/sessionManager.js',
  oldLoadCheck,
  newLoadCheck,
  'Vérification auth Mongo ${meta.sessionId} impossible',
  'restauration multi-session depuis Mongo'
);

// ── SESSION PRINCIPALE : même collection persistante session_<numéro> ───
patch(
  'index.js',
  "const sessionContext = require('./utils/sessionContext'); // [PHASE 1] isolation données — voir utils/sessionContext.js",
  "const sessionContext = require('./utils/sessionContext'); // [PHASE 1] isolation données — voir utils/sessionContext.js\nconst { useMongoAuthState, hasMongoAuthState, importLocalAuthDirectoryToMongo } = require('./utils/mongoAuth');",
  "importLocalAuthDirectoryToMongo } = require('./utils/mongoAuth')",
  'imports Mongo session principale'
);

const oldMainAuth = `  const sessionFolder = \`./${'${config.sessionName || \'auth_info_baileys\'}'}\`;\n  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);\n  const { version } = await fetchLatestBaileysVersion();`;

const newMainAuth = `  const sessionFolder = \`./${'${config.sessionName || \'auth_info_baileys\'}'}\`;\n  let authState;\n  if (_mongoDb) {\n    const mainPhone = String(process.env.PHONE_NUMBER || config.ownerNumber?.[0] || '').replace(/\\D/g, '');\n    const persistentSessionId = mainPhone ? \`session_${'${mainPhone}'}\` : 'owner_main';\n    const localSessionDir = path.resolve(sessionFolder);\n    let hasPersistentMainAuth = await hasMongoAuthState(_mongoDb, persistentSessionId);\n\n    if (!hasPersistentMainAuth && fs.existsSync(path.join(localSessionDir, 'creds.json'))) {\n      try {\n        await importLocalAuthDirectoryToMongo(_mongoDb, persistentSessionId, localSessionDir);\n        hasPersistentMainAuth = await hasMongoAuthState(_mongoDb, persistentSessionId);\n      } catch (err) {\n        originalConsoleError('[MongoAuth] Migration owner locale→Mongo échouée:', err.message);\n      }\n    }\n\n    // Ne jamais créer silencieusement de nouveaux creds pour le compte\n    // principal : s'ils ont disparu du disque Render avant migration, le\n    // pairing explicite via le site/API doit recréer session_<numéro>.\n    if (!hasPersistentMainAuth) {\n      originalConsoleLog(\`⚠️ [MongoAuth] Aucune auth persistante pour ${'${persistentSessionId}'} — réappairage explicite requis.\`);\n      return null;\n    }\n\n    authState = await useMongoAuthState(_mongoDb, persistentSessionId);\n    originalConsoleLog(\`✅ [MongoAuth] Session principale ${'${persistentSessionId}'} chargée depuis MongoDB\`);\n  } else {\n    authState = await useMultiFileAuthState(sessionFolder);\n    originalConsoleLog('⚠️ [MongoAuth] Mongo indisponible — session principale en stockage local de secours');\n  }\n  const { state, saveCreds } = authState;\n  const { version } = await fetchLatestBaileysVersion();`;

patch(
  'index.js',
  oldMainAuth,
  newMainAuth,
  'let hasPersistentMainAuth = await hasMongoAuthState',
  'auth Mongo session principale'
);

console.log('[persistence] ✅ Credentials WhatsApp persistants Mongo prêts.');