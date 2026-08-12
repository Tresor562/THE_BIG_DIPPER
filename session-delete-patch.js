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

function nodeCheck(file) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`[session-delete] syntaxe invalide ${path.relative(BOT, file)}: ${result.stderr || result.stdout}`);
  }
}

// Le lifecycle privé doit déjà avoir installé la politique immortelle :
// - aucune suppression automatique d'une session enregistrée ;
// - connectionReplaced/badSession reconnectés ;
// - deleteSessionData reste l'unique moteur de suppression explicite.
const sessionSrc = fs.readFileSync(sessionPath, 'utf8');
for (const marker of [
  '[SESSION LIFECYCLE CLEANUP]',
  '[SESSION IMMORTAL RECONNECT]',
  '[SESSION IMMORTAL POLICY]',
  'async function deleteSessionData(',
  '  deleteSessionData,',
]) {
  if (!sessionSrc.includes(marker)) throw new Error(`[session-delete] lifecycle préalable absent: ${marker}`);
}

const immortalStart = sessionSrc.indexOf('// [SESSION IMMORTAL POLICY]');
const immortalBlock = immortalStart >= 0 ? sessionSrc.slice(immortalStart, immortalStart + 950) : '';
if (/purgeSessionPersistence\s*\(|deleteSessionData\s*\(/.test(immortalBlock)) {
  throw new Error('[session-delete] sécurité: loggedOut ne doit jamais supprimer automatiquement les données');
}

let serverSrc = fs.readFileSync(serverPath, 'utf8');

if (!serverSrc.includes("url.pathname === '/session/delete'")) {
  const handlerBlock = [
    '/**',
    ' * POST /session/delete',
    ' * Body : { phoneNumber }',
    ' * Suppression définitive EXPLICITE, même si la session est déconnectée.',
    ' */',
    'async function handleSessionDeleteRoute(req, res) {',
    '  if (!isAuthorizedInternalCall(req)) {',
    "    return sendJSON(res, 401, { error: 'UNAUTHORIZED', message: 'En-tête X-Internal-Token invalide ou manquant.' });",
    '  }',
    '',
    '  let body;',
    '  try { body = await readJsonBody(req); }',
    "  catch (err) { return sendJSON(res, err.statusCode || 400, { error: 'BAD_REQUEST', message: err.message }); }",
    '',
    '  const phoneNumber = body?.phoneNumber;',
    '  if (!phoneNumber) {',
    "    return sendJSON(res, 400, { error: 'MISSING_PHONE_NUMBER', message: 'Le champ phoneNumber est requis dans le corps JSON.' });",
    '  }',
    '',
    '  try {',
    "    const deleted = await sessionManager.deleteSessionData(phoneNumber, null, 'suppression demandée explicitement via API');",
    '    if (!deleted) {',
    "      return sendJSON(res, 500, { error: 'DELETE_INCOMPLETE', message: 'La suppression persistante de la session est incomplète.' });",
    '    }',
    '    return sendJSON(res, 200, { success: true, deleted: true, sessionId: sessionManager.toSessionId(phoneNumber) });',
    '  } catch (err) {',
    "    console.error('[api] /session/delete erreur:', err);",
    "    return sendJSON(res, 500, { error: 'DELETE_FAILED', message: 'Impossible de supprimer définitivement cette session.' });",
    '  }',
    '}',
    '',
    '',
  ].join('\n');

  serverSrc = replaceOnce(serverSrc, 'function createServer() {', handlerBlock + 'function createServer() {', 'handler POST /session/delete');

  const stopRoute = [
    "      if (req.method === 'POST' && url.pathname === '/session/stop') {",
    '        return await handleSessionStopRoute(req, res);',
    '      }',
  ].join('\n');
  const deleteRoute = [
    stopRoute,
    "      if (req.method === 'POST' && url.pathname === '/session/delete') {",
    '        return await handleSessionDeleteRoute(req, res);',
    '      }',
  ].join('\n');

  serverSrc = replaceOnce(serverSrc, stopRoute, deleteRoute, 'route POST /session/delete');
  fs.writeFileSync(serverPath, serverSrc);
  console.log('[session-delete] route POST /session/delete installée — suppression explicite uniquement');
} else {
  console.log('[session-delete] route POST /session/delete déjà installée');
}

nodeCheck(sessionPath);
nodeCheck(serverPath);

const finalServer = fs.readFileSync(serverPath, 'utf8');
for (const marker of [
  "url.pathname === '/session/delete'",
  'sessionManager.deleteSessionData(phoneNumber',
  "'suppression demandée explicitement via API'",
]) {
  if (!finalServer.includes(marker)) throw new Error(`[session-delete] garde-fou API absent: ${marker}`);
}

console.log('[session-delete] ✅ sessions conservées automatiquement; /session/delete reste la suppression manuelle définitive');
