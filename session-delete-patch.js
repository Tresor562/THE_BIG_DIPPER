'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const sessionPath = path.join(BOT, 'utils', 'sessionManager.js');
const serverPath = path.join(BOT, 'api', 'server.js');

for (const file of [sessionPath, serverPath]) {
  if (!fs.existsSync(file)) throw new Error(`[session-delete] fichier absent: ${file}`);
}

function replaceOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`[session-delete] ${label}: attendu 1 occurrence, trouvé ${count}`);
  return source.replace(search, replacement);
}

// ── SessionManager : vraie suppression persistante ────────────────────────
let sessionSrc = fs.readFileSync(sessionPath, 'utf8');

if (!sessionSrc.includes('[PERMANENT SESSION DELETE]')) {
  if (!/^const fs\s*=\s*require\(['"]fs['"]\);/m.test(sessionSrc)) {
    sessionSrc = replaceOnce(
      sessionSrc,
      "const path    = require('path');",
      "const path    = require('path');\nconst fs      = require('fs');",
      'import fs'
    );
  }

  // persistence-patch a déjà basculé sessionManager sur mongoAuth avant ici.
  const mongoImportRe = /const \{([^}]+)\} = require\('\.\/mongoAuth'\);/;
  const mongoMatch = sessionSrc.match(mongoImportRe);
  if (!mongoMatch) throw new Error('[session-delete] import mongoAuth introuvable — persistence-patch doit passer avant');
  if (!/\bdeleteMongoSession\b/.test(mongoMatch[1])) {
    const names = mongoMatch[1].split(',').map(v => v.trim()).filter(Boolean);
    names.push('deleteMongoSession');
    sessionSrc = sessionSrc.replace(mongoImportRe, `const { ${names.join(', ')} } = require('./mongoAuth');`);
  }

  const deleteBlock = `/**\n * [PERMANENT SESSION DELETE]\n * Supprime une session même si son socket est déjà déconnecté.\n * - ferme le runtime s'il existe ;\n * - supprime les credentials Mongo auth_<sessionId> ;\n * - supprime les credentials locaux résiduels ;\n * - retire les métadonnées sessions_index.\n *\n * La suppression est idempotente : une session déjà absente peut être\n * supprimée à nouveau sans être confondue avec une panne réseau.\n */\nasync function deleteSession(phoneNumber) {\n  const cleanPhone = String(phoneNumber || '').replace(/\\D/g, '');\n  if (!cleanPhone) throw new Error('Numéro de session invalide.');\n\n  const sessionId = toSessionId(cleanPhone);\n  const session = activeSessions.get(sessionId) || null;\n  let runtimeStopped = false;\n\n  if (session) {\n    try { _closeSession(session, 'session supprimée définitivement'); } catch (_) {}\n    if (activeSessions.get(sessionId) === session) activeSessions.delete(sessionId);\n    runtimeStopped = true;\n  }\n\n  // Récupérer d'abord une DB déjà ouverte ; si toutes les sessions sont\n  // arrêtées, ouvrir une connexion courte avec la même URI Mongo Render.\n  let db = session?.db || null;\n  if (!db) {\n    for (const candidate of activeSessions.values()) {\n      if (candidate?.db) { db = candidate.db; break; }\n    }\n  }\n\n  let transientClient = null;\n  try {\n    if (!db) {\n      const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGODB_URL || '';\n      if (!mongoUri) throw new Error('MongoDB indisponible pour supprimer les credentials persistants.');\n      const { MongoClient } = require('mongodb');\n      transientClient = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10000 });\n      await transientClient.connect();\n      const configuredDbName = process.env.MONGODB_DB || process.env.MONGO_DB || process.env.DB_NAME || undefined;\n      db = transientClient.db(configuredDbName);\n    }\n\n    // Source durable Render : collection auth_session_<numéro>.\n    await deleteMongoSession(db, sessionId);\n\n    // Nettoyage local de secours : d'anciens dossiers peuvent subsister après\n    // une migration, même si MongoDB reste la source durable actuelle.\n    try {\n      const dir = typeof getSessionDir === 'function' ? getSessionDir(sessionId) : null;\n      if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });\n    } catch (err) {\n      console.warn(\`[SessionManager] nettoyage local ${sessionId}: ${err.message}\`);\n    }\n\n    if (typeof sessionIndex.deleteSessionMeta !== 'function') {\n      throw new Error('sessionIndex.deleteSessionMeta indisponible.');\n    }\n    await sessionIndex.deleteSessionMeta(sessionId);\n\n    console.log(\`[SessionManager] 🗑️ Session ${sessionId} supprimée définitivement\`);\n    return { success: true, deleted: true, sessionId, runtimeStopped };\n  } finally {\n    if (transientClient) {\n      try { await transientClient.close(); } catch (_) {}\n    }\n  }\n}\n\n`;

  const timeoutAnchor = 'function withTimeout(promise, ms, label) {';
  sessionSrc = replaceOnce(sessionSrc, timeoutAnchor, deleteBlock + timeoutAnchor, 'fonction deleteSession');

  // Si le lifecycle installer n'a pas déjà remplacé ce chemin, un pairing\n  // jamais finalisé est désormais purgé au lieu d'être seulement arrêté.
  if (sessionSrc.includes('await stopSession(session.phoneNumber);')) {
    sessionSrc = sessionSrc.replace('await stopSession(session.phoneNumber);', 'await deleteSession(session.phoneNumber);');
  }

  // Export robuste : ne dépend pas de l'ordre exact ajouté par d'autres patches.
  if (!/module\.exports\s*=\s*\{[\s\S]*?\bdeleteSession\s*,[\s\S]*?\};/m.test(sessionSrc)) {
    const stopExport = /(^\s*stopSession,\s*$)/m;
    if (!stopExport.test(sessionSrc)) throw new Error('[session-delete] export stopSession introuvable');
    sessionSrc = sessionSrc.replace(stopExport, '$1\n  deleteSession,');
  }

  fs.writeFileSync(sessionPath, sessionSrc);
  console.log('[session-delete] deleteSession permanent installé');
} else {
  console.log('[session-delete] deleteSession permanent déjà installé');
}

// ── API : POST /session/delete ─────────────────────────────────────────────
let serverSrc = fs.readFileSync(serverPath, 'utf8');

if (!serverSrc.includes("url.pathname === '/session/delete'")) {
  const handlerBlock = `/**\n * POST /session/delete\n * Body : { phoneNumber }\n * Suppression définitive, y compris si la session est déjà déconnectée.\n */\nasync function handleSessionDeleteRoute(req, res) {\n  if (!isAuthorizedInternalCall(req)) {\n    return sendJSON(res, 401, { error: 'UNAUTHORIZED', message: 'En-tête X-Internal-Token invalide ou manquant.' });\n  }\n\n  let body;\n  try {\n    body = await readJsonBody(req);\n  } catch (err) {\n    return sendJSON(res, err.statusCode || 400, { error: 'BAD_REQUEST', message: err.message });\n  }\n\n  const phoneNumber = body?.phoneNumber;\n  if (!phoneNumber) {\n    return sendJSON(res, 400, { error: 'MISSING_PHONE_NUMBER', message: 'Le champ "phoneNumber" est requis dans le corps JSON.' });\n  }\n\n  try {\n    const result = await sessionManager.deleteSession(phoneNumber);\n    return sendJSON(res, 200, {\n      success: true,\n      deleted: result?.deleted !== false,\n      sessionId: result?.sessionId || sessionManager.toSessionId(phoneNumber),\n      runtimeStopped: !!result?.runtimeStopped,\n    });\n  } catch (err) {\n    console.error('[api] /session/delete erreur:', err);\n    return sendJSON(res, 500, { error: 'DELETE_FAILED', message: 'Impossible de supprimer définitivement cette session.' });\n  }\n}\n\n`;

  const createAnchor = 'function createServer() {';
  serverSrc = replaceOnce(serverSrc, createAnchor, handlerBlock + createAnchor, 'handler /session/delete');

  const stopRoute = `      if (req.method === 'POST' && url.pathname === '/session/stop') {\n        return await handleSessionStopRoute(req, res);\n      }`;
  const routes = `${stopRoute}\n      if (req.method === 'POST' && url.pathname === '/session/delete') {\n        return await handleSessionDeleteRoute(req, res);\n      }`;
  serverSrc = replaceOnce(serverSrc, stopRoute, routes, 'route POST /session/delete');

  fs.writeFileSync(serverPath, serverSrc);
  console.log('[session-delete] route POST /session/delete installée');
} else {
  console.log('[session-delete] route POST /session/delete déjà installée');
}

for (const file of [sessionPath, serverPath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[session-delete] syntaxe invalide ${path.relative(BOT, file)}: ${check.stderr || check.stdout}`);
  }
}

const finalSession = fs.readFileSync(sessionPath, 'utf8');
const finalServer = fs.readFileSync(serverPath, 'utf8');
const requiredSession = [
  '[PERMANENT SESSION DELETE]',
  'async function deleteSession(phoneNumber)',
  'await deleteMongoSession(db, sessionId)',
  'await sessionIndex.deleteSessionMeta(sessionId)',
  '  deleteSession,',
];
for (const marker of requiredSession) {
  if (!finalSession.includes(marker)) throw new Error(`[session-delete] garde-fou session absent: ${marker}`);
}
if (!finalServer.includes("url.pathname === '/session/delete'")) throw new Error('[session-delete] route /session/delete absente');
if (!finalServer.includes('sessionManager.deleteSession(phoneNumber)')) throw new Error('[session-delete] appel deleteSession absent');

console.log('[session-delete] ✅ suppression définitive prête pour Render');
