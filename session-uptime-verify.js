'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const files = {
  session: path.join(ROOT, 'bot', 'utils', 'sessionManager.js'),
  sessionIndex: path.join(ROOT, 'bot', 'utils', 'sessionIndex.js'),
  index: path.join(ROOT, 'bot', 'index.js'),
};

for (const file of Object.values(files)) {
  if (!fs.existsSync(file)) throw new Error(`[session-uptime-verify] absent: ${file}`);
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[session-uptime-verify] syntaxe: ${check.stderr || check.stdout}`);
}

const session = fs.readFileSync(files.session, 'utf8');
const sessionIndex = fs.readFileSync(files.sessionIndex, 'utf8');
const index = fs.readFileSync(files.index, 'utf8');

for (const marker of [
  '[SESSION UPTIME GUARD]',
  '[SESSION SOCKET WATCHDOG]',
  '[MULTI SESSION APPEND FROMME]',
  '[MULTI SESSION APPEND FILTER]',
  '[SESSION HANDLER FAILURE FALLBACK]',
  '[REGISTERED SESSION RECONCILER]',
  '[SESSION LOGGEDOUT STATE]',
  '[SESSION LOAD LOGGEDOUT SKIP]',
  'startRegisteredSessionReconciler,',
]) {
  if (!session.includes(marker)) throw new Error(`[session-uptime-verify] sessionManager absent: ${marker}`);
}

for (const marker of [
  '[SESSION REPAIR STATE]',
  '[SESSION REPAIR STATE UPDATE]',
  "update['state.requiresPairing']",
]) {
  if (!sessionIndex.includes(marker)) throw new Error(`[session-uptime-verify] sessionIndex absent: ${marker}`);
}

for (const marker of [
  '[MONO SESSION UPTIME GUARD]',
  '[MONO IMMORTAL RECONNECT]',
  '[MONO RECONNECT LOOP]',
  '[MONO SOCKET WATCHDOG]',
  '[MONO HANDLER FAILURE FALLBACK]',
  '[MULTI SESSION RECONCILER START]',
  '[MONGO REQUIRED RETRY]',
]) {
  if (!index.includes(marker)) throw new Error(`[session-uptime-verify] index absent: ${marker}`);
}

const multiTerminalAt = session.indexOf('// [SESSION IMMORTAL RECONNECT]');
const multiTerminalBlock = multiTerminalAt >= 0 ? session.slice(multiTerminalAt, multiTerminalAt + 650) : '';
if (!multiTerminalBlock.includes('statusCode === DisconnectReason.loggedOut')) {
  throw new Error('[session-uptime-verify] multi-session: loggedOut doit être le seul terminal');
}
if (/terminalDisconnect[\s\S]{0,320}DisconnectReason\.(connectionReplaced|badSession)/.test(multiTerminalBlock)) {
  throw new Error('[session-uptime-verify] multi-session: connectionReplaced/badSession encore terminal');
}

const monoTerminalAt = index.indexOf('// [MONO IMMORTAL RECONNECT]');
const monoTerminalBlock = monoTerminalAt >= 0 ? index.slice(monoTerminalAt, monoTerminalAt + 420) : '';
if (!monoTerminalBlock.includes('statusCode === DisconnectReason.loggedOut')) {
  throw new Error('[session-uptime-verify] mono-session: loggedOut doit être le seul terminal');
}
if (/terminalDisconnect[\s\S]{0,260}DisconnectReason\.(connectionReplaced|badSession)/.test(monoTerminalBlock)) {
  throw new Error('[session-uptime-verify] mono-session: connectionReplaced/badSession encore terminal');
}

if (!session.includes("type !== 'notify' && type !== 'append'")) {
  throw new Error('[session-uptime-verify] multi-session ne traite pas append');
}
if (!session.includes("type === 'append' && !msg.key?.fromMe")) {
  throw new Error('[session-uptime-verify] filtre append/fromMe absent');
}

if (!session.includes("requiresPairing: true, lastDisconnectReason: 'loggedOut'")) {
  throw new Error('[session-uptime-verify] loggedOut non mémorisé');
}
if (!session.includes('requiresPairing: false, lastDisconnectReason: null')) {
  throw new Error('[session-uptime-verify] réactivation après open absente');
}

if (!index.includes('sm.startRegisteredSessionReconciler(_mongoDb)')) {
  throw new Error('[session-uptime-verify] reconciler non démarré');
}
if (!index.includes('if (process.env.MONGODB_URI && !multiSessionActive)')) {
  throw new Error('[session-uptime-verify] démarrage ne protège pas une panne Mongo initiale');
}

console.log('[session-uptime-verify] ✅ H24 guard: watchdog + reconnect + reconciler + append/fromMe + fallback handler');
