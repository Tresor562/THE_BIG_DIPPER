'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
if (!fs.existsSync(BOT)) throw new Error('[session-isolation] bot/ absent');

function read(rel){ return fs.readFileSync(path.join(BOT, rel),'utf8'); }
function write(rel,src){ fs.writeFileSync(path.join(BOT, rel),src,'utf8'); }
function replaceOnce(rel, search, replacement, marker, label) {
  let src = read(rel);
  if (marker && src.includes(marker)) return;
  const count = src.split(search).length - 1;
  if (count !== 1) throw new Error(`[session-isolation] ${label}: attendu 1 occurrence, trouvé ${count}`);
  src = src.replace(search, replacement);
  write(rel, src);
  console.log(`[session-isolation] ${label} ✓`);
}
function replaceRegexOnce(rel, re, replacement, marker, label) {
  let src = read(rel);
  if (marker && src.includes(marker)) return;
  const matches = src.match(re);
  if (!matches) throw new Error(`[session-isolation] ${label}: ancre absente`);
  src = src.replace(re, replacement);
  write(rel, src);
  console.log(`[session-isolation] ${label} ✓`);
}
function replaceAllLiteral(rel, search, replacement, label) {
  let src = read(rel);
  const count = src.split(search).length - 1;
  if (!count) return 0;
  src = src.split(search).join(replacement);
  write(rel, src);
  console.log(`[session-isolation] ${label}: ${count} occurrence(s) ✓`);
  return count;
}

const prefs = `'use strict';\nconst fs = require('fs');\nconst path = require('path');\nconst sessionContext = require('./sessionContext');\n\nfunction safeSid(sid = sessionContext.getCurrentSessionId()) {\n  return String(sid || sessionContext.DEFAULT_SESSION_ID).replace(/[^a-zA-Z0-9_.-]/g, '_');\n}\nfunction dirFor(sid) {\n  const dir = path.join(process.cwd(), 'database', 'sessions', safeSid(sid));\n  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });\n  return dir;\n}\nfunction fileFor(sid) { return path.join(dirFor(sid), 'preferences.json'); }\nfunction load(sid) {\n  try { const p=fileFor(sid); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,'utf8')) : {}; } catch { return {}; }\n}\nfunction save(data,sid) {\n  const p=fileFor(sid); const tmp=p+'.tmp-'+process.pid+'-'+Date.now();\n  fs.writeFileSync(tmp, JSON.stringify(data,null,2),'utf8'); fs.renameSync(tmp,p); return true;\n}\nfunction get(key,fallback,sid) { const data=load(sid); return Object.prototype.hasOwnProperty.call(data,key) ? data[key] : fallback; }\nfunction set(key,value,sid) { const data=load(sid); data[key]=value; save(data,sid); return value; }\nfunction update(values,sid) { const data={...load(sid),...values}; save(data,sid); return data; }\nfunction sessionFile(name,sid) { return path.join(dirFor(sid), String(name).replace(/[\\/]/g,'_')); }\nmodule.exports={safeSid,dirFor,fileFor,load,save,get,set,update,sessionFile};\n`;
write('utils/sessionPreferences.js', prefs);

replaceOnce('utils/styleManager.js',
`// ── Style actif (partagé entre tous les modules) ──────────────────\n// Style 0 = DIPPER, l'identité officielle du bot. C'est le style par\n// défaut (Phase 2, Étape 1). Les styles 1 → 20 restent accessibles via\n// .style1 → .style20.\nlet _styleActif = 0;\n\nfunction getStyle()        { return _styleActif; }\n// n >= 0 (et pas n >= 1) : 0 est une valeur valide, pas juste "falsy".\nfunction setStyle(n)       { if (n >= 0 && n <= 20) _styleActif = n; }`,
`// ── Style actif isolé par session ────────────────────────────────\nconst sessionPreferences = require('./sessionPreferences');\nfunction getStyle() {\n  const n = Number(sessionPreferences.get('style', 0));\n  return Number.isInteger(n) && n >= 0 && n <= 20 ? n : 0;\n}\nfunction setStyle(n) {\n  const v = Number(n);\n  if (Number.isInteger(v) && v >= 0 && v <= 20) sessionPreferences.set('style', v);\n}`,
`const sessionPreferences = require('./sessionPreferences');`, 'style par session');

for (const rel of ['utils/vipDB.js','utils/premiumDB.js']) {
  replaceRegexOnce(rel,
    /const DATA_DIR\s*=\s*path\.join\(__dirname, '\.\.', 'data'\);\nconst DB_PATH\s*=\s*path\.join\(DATA_DIR, '(vip|premium)\.json'\);/,
    (_m, kind) => `const sessionContext = require('./sessionContext');\nfunction DB_PATH() {\n  const dir = path.join(__dirname, '..', 'database', 'sessions', sessionContext.getCurrentSessionId());\n  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });\n  return path.join(dir, '${kind}.json');\n}`,
    `function DB_PATH()`, `${rel} chemin sessionné`);
  replaceAllLiteral(rel, 'fs.existsSync(DB_PATH)', 'fs.existsSync(DB_PATH())', `${rel} exists`);
  replaceAllLiteral(rel, "fs.readFileSync(DB_PATH, 'utf8')", "fs.readFileSync(DB_PATH(), 'utf8')", `${rel} read`);
  replaceAllLiteral(rel, 'fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), \'utf8\')', 'fs.writeFileSync(DB_PATH(), JSON.stringify(data, null, 2), \'utf8\')', `${rel} write`);
  let s=read(rel); s=s.replace(/\nif \(!fs\.existsSync\(DATA_DIR\)\) \{\n  fs\.mkdirSync\(DATA_DIR, \{ recursive: true \}\);\n\}\n/g,'\n'); write(rel,s);
}

replaceOnce('handler.js',
`const sessionContext = require('./utils/sessionContext');`,
`const sessionContext = require('./utils/sessionContext');\nconst sessionPreferences = require('./utils/sessionPreferences');`,
`const sessionPreferences = require('./utils/sessionPreferences');`, 'handler import préférences');
replaceRegexOnce('handler.js',
/const isBannedUser = \(sender\) => \{[\s\S]*?\n\};\n\n\/\/ ==========================================\n\/\/ MUTE CHECK/,
`const isBannedUser = (sender) => {\n  if (!sender) return false;\n  try {\n    const bannedList = sessionPreferences.get('bannedUsers', []);\n    const senderNum = sender.split('@')[0].split(':')[0].replace(/\\D/g, '');\n    return Array.isArray(bannedList) && bannedList.includes(senderNum);\n  } catch { return false; }\n};\n\n// ==========================================\n// MUTE CHECK`,
`sessionPreferences.get('bannedUsers', [])`, 'ban par session');
replaceOnce('handler.js',
`    const isSudo    = !isMe && isSudoUser(sender);`,
`    const isSudo    = !isMe && isSudoUser(sender);\n\n    // [SESSION ISOLATION] Tous les réglages runtime sont lus dans le contexte ALS courant.\n    const runtimePrefix    = String(sessionPreferences.get('prefix', database.getBotPrefix?.() || config.prefix || '.'));\n    const runtimeSelfMode  = sessionPreferences.get('selfMode', config.selfMode === true) === true;\n    const runtimePublic    = sessionPreferences.get('publicMode', config.public === true) === true;\n    const runtimeAutoReact = sessionPreferences.get('autoReact', config.autoReact === true) === true;\n    const runtimeAutoReactMode = String(sessionPreferences.get('autoReactMode', config.autoReactMode || 'bot'));`,
`const runtimePrefix    = String(sessionPreferences.get('prefix'`, 'runtime session settings');
replaceAllLiteral('handler.js','isUnmuteCommand(body, config.prefix)','isUnmuteCommand(body, runtimePrefix)','unmute prefix');
replaceAllLiteral('handler.js','body.startsWith(config.prefix)','body.startsWith(runtimePrefix)','command prefix detect');
replaceAllLiteral('handler.js','body.slice(config.prefix.length)','body.slice(runtimePrefix.length)','command prefix slice');
replaceAllLiteral('handler.js','isMe || isSudo || config.public','isMe || isSudo || runtimePublic','autoreact public');
replaceAllLiteral('handler.js','if (config.autoReact &&','if (runtimeAutoReact &&','autoreact enabled');
replaceAllLiteral('handler.js',"const mode   = config.autoReactMode || 'bot';","const mode   = runtimeAutoReactMode;",'autoreact mode');
replaceAllLiteral('handler.js','else if (config.selfMode) {','else if (runtimeSelfMode) {','self mode');
replaceAllLiteral('handler.js','if (!config.public && access.reason === null) {','if (!runtimePublic && access.reason === null) {','public mode');
replaceAllLiteral('handler.js',"const cacheKey = `${direction}:${user}`;","const cacheKey = `${sessionContext.getCurrentSessionId()}:${direction}:${user}`;",'LID cache scope');
replaceAllLiteral('handler.js','global._botSentMessageIds.add(result.key.id);','global._botSentMessageIds.add(sessionContext.scopeKey(result.key.id));','sent message cache add');
replaceAllLiteral('handler.js','global._botSentMessageIds.has(arCtx.stanzaId)','global._botSentMessageIds.has(sessionContext.scopeKey(arCtx.stanzaId))','sent message cache has');
replaceRegexOnce('handler.js',
/const initializeAntiCall = \(sock\) => \{[\s\S]*?\n\};\n\n\/\/ ==========================================\n\/\/ ANTI STATUS MENTION HANDLER/,
`const initializeAntiCall = (sock) => {\n  const sessionId = sock._sessionId || (sock._sessionPhoneNumber ? 'session_' + String(sock._sessionPhoneNumber).replace(/\\D/g,'') : sessionContext.getCurrentSessionId());\n  sock.ev.on('call', async (calls) => sessionContext.run(sessionId, async () => {\n    try {\n      if (sessionPreferences.get('anticall', config.defaultGroupSettings?.anticall === true) !== true) return;\n      for (const call of calls) {\n        if (call.status === 'offer') {\n          await sock.rejectCall(call.id, call.from);\n          await sock.updateBlockStatus(call.from, 'block');\n          await sock.sendMessage(call.from, { text: \`𝐃𝐈𝐏𝐏𝐄𝐑  ɴᴇ ʀᴇ́ᴘᴏɴᴅ ǫᴜ'ᴀᴜx ᴍᴇssᴀɢᴇs ᴇ́ᴄʀɪᴛs.\` });\n        }\n      }\n    } catch (_) {}\n  }));\n};\n\n// ==========================================\n// ANTI STATUS MENTION HANDLER`,
`sessionPreferences.get('anticall'`, 'anticall par session');

replaceOnce('utils/sessionManager.js',
`        if (!sock._sessionPhoneNumber) {\n          sock._sessionPhoneNumber = String(phoneNumber).replace(/\\D/g, '');\n        }`,
`        if (!sock._sessionPhoneNumber) {\n          sock._sessionPhoneNumber = String(phoneNumber).replace(/\\D/g, '');\n        }\n        sock._sessionId = sessionId;`,
`sock._sessionId = sessionId;`, 'socket sessionId explicite');

function injectPrefs(rel) {
  replaceRegexOnce(rel,/const config\s*=\s*require\((['"])\.\.\/\.\.\/config(?:\.js)?\1\);/,
    m => `${m}\nconst sessionPreferences = require('../../utils/sessionPreferences');`,
    `sessionPreferences = require('../../utils/sessionPreferences')`, `${rel} import prefs`);
}

injectPrefs('commands/bot_sovereignty/mode.js');
replaceRegexOnce('commands/bot_sovereignty/mode.js',/\s*const envPath = path\.join\(process\.cwd\(\), '\.env'\);[\s\S]*?\n\s*try \{\n\s*let envContent = fs\.existsSync\(envPath\) \? fs\.readFileSync\(envPath, 'utf8'\) : '';\n\s*\n\s*const isCurrentlyPrivate = \/\^SELF_MODE=true\/m\.test\(envContent\);/,
`\n    try {\n      const isCurrentlyPrivate = sessionPreferences.get('selfMode', config.selfMode === true) === true;`,
`sessionPreferences.get('selfMode'`, 'mode lecture session');
replaceRegexOnce('commands/bot_sovereignty/mode.js',/\n\s*\/\/ Fonction utilitaire pour mettre à jour proprement le \.env[\s\S]*?\n\s*};\n/,'\n',`[SESSION MODE NO ENV]`,'mode retire writer env');
let modeSrc=read('commands/bot_sovereignty/mode.js');
modeSrc=modeSrc.replace("        updateEnv('SELF_MODE', 'true');\n\n        // 🧠 APPLICATION IMMÉDIATE EN MÉMOIRE VIVE GLOBALE\n        process.env.SELF_MODE = 'true';\n        config.selfMode = true;\n        config.public = false; ","        sessionPreferences.update({ selfMode: true, publicMode: false }); // [SESSION MODE NO ENV]");
modeSrc=modeSrc.replace("        updateEnv('SELF_MODE', 'false');\n\n        // 🧠 APPLICATION IMMÉDIATE EN MÉMOIRE VIVE GLOBALE\n        process.env.SELF_MODE = 'false';\n        config.selfMode = false;\n        config.public = true;","        sessionPreferences.update({ selfMode: false, publicMode: true }); // [SESSION MODE NO ENV]");
write('commands/bot_sovereignty/mode.js',modeSrc);

injectPrefs('commands/bot_sovereignty/autoreact.js');
replaceRegexOnce('commands/bot_sovereignty/autoreact.js',/\s*const envPath = path\.join\(process\.cwd\(\), '\.env'\);[\s\S]*?const opt = args\.join\(' '\)\.toLowerCase\(\)\.trim\(\);/,
`\n    try {\n      const isCurrentlyOn = sessionPreferences.get('autoReact', config.autoReact === true) === true;\n      const currentMode = String(sessionPreferences.get('autoReactMode', config.autoReactMode || 'bot'));\n      const opt = args.join(' ').toLowerCase().trim();`,
`sessionPreferences.get('autoReact'`, 'autoreact lecture session');
let ar=read('commands/bot_sovereignty/autoreact.js');
ar=ar.replace(/\n\s*\/\/ Fonction utilitaire pour mettre à jour ou ajouter proprement une variable[\s\S]*?\n\s*};\n/,'\n');
ar=ar.replace("        updateEnv('AUTOREACT', 'true');\n        process.env.AUTOREACT = 'true'; // Forçage immédiat en mémoire vive","        sessionPreferences.set('autoReact', true);");
ar=ar.replace("        updateEnv('AUTOREACT', 'false');\n        process.env.AUTOREACT = 'false'; // Forçage immédiat en mémoire vive","        sessionPreferences.set('autoReact', false);");
ar=ar.replace("        updateEnv('AUTOREACT_MODE', 'bot');\n        process.env.AUTOREACT_MODE = 'bot';","        sessionPreferences.set('autoReactMode', 'bot');");
ar=ar.replace("        updateEnv('AUTOREACT_MODE', 'all');\n        process.env.AUTOREACT_MODE = 'all';","        sessionPreferences.set('autoReactMode', 'all');");
write('commands/bot_sovereignty/autoreact.js',ar);

injectPrefs('commands/bot_sovereignty/anticall.js');
let ac=read('commands/bot_sovereignty/anticall.js');
ac=ac.replace(/\s*const envPath = path\.join\(process\.cwd\(\), '\.env'\);\n/,'\n');
ac=ac.replace(/\s*\/\/ Lecture chirurgicale du fichier \.env[\s\S]*?const isCurrentlyEnabled = \/\^ANTICALL=true\/m\.test\(envContent\);/,
"\n      const isCurrentlyEnabled = sessionPreferences.get('anticall', config.defaultGroupSettings?.anticall === true) === true;");
ac=ac.replace(/\n\s*\/\/ Modification propre de la ligne dans le \.env[\s\S]*?process\.env\.ANTICALL = targetValue;\n/,
"\n      sessionPreferences.set('anticall', enable);\n");
write('commands/bot_sovereignty/anticall.js',ac);

injectPrefs('commands/bot_sovereignty/bannir.js');
let ban=read('commands/bot_sovereignty/bannir.js');
ban=ban.replace(/\s*\/\/ Lecture\/mise à jour du \.env[\s\S]*?let bannedList = \[\];[\s\S]*?\n\s*}\n\n\s*if \(bannedList\.includes\(cleanTarget\)\)/,
"\n      let bannedList = sessionPreferences.get('bannedUsers', []);\n      if (!Array.isArray(bannedList)) bannedList = [];\n\n      if (bannedList.includes(cleanTarget))");
ban=ban.replace(/\n\s*const newBannedString = bannedList\.join\(','\);[\s\S]*?process\.env\.BANNED_USERS = newBannedString;\n/,
"\n      sessionPreferences.set('bannedUsers', bannedList);\n");
write('commands/bot_sovereignty/bannir.js',ban);

injectPrefs('commands/bot_sovereignty/setbotname.js');
let sb=read('commands/bot_sovereignty/setbotname.js');
sb=sb.replace("${config.botName || 'ɢʜᴏsᴛɢ-x'}","${sessionPreferences.get('botName', config.botName || 'ɢʜᴏsᴛɢ-x')}");
sb=sb.replace(/\n\s*\/\/ Mise à jour de la configuration en mémoire vive[\s\S]*?delete require\.cache\[require\.resolve\('\.\.\/\.\.\/config'\)\];\n\s*} catch \(e\) \{}\n/,
"\n      sessionPreferences.set('botName', newOracleName);\n");
write('commands/bot_sovereignty/setbotname.js',sb);

injectPrefs('commands/bot_sovereignty/setnewsletter.js');
let sn=read('commands/bot_sovereignty/setnewsletter.js');
sn=sn.replace("const currentJid = config.newsletterJid || 'ɴᴏɴ ᴅᴇ́ғɪɴɪ';","const currentJid = sessionPreferences.get('newsletterJid', config.newsletterJid) || 'ɴᴏɴ ᴅᴇ́ғɪɴɪ';");
sn=sn.replace(/\n\s*\/\/ 💥 ÉCRITURE SÉCURISÉE DANS LE FICHIER CONFIG\.JS[\s\S]*?config\.newsletterJid = newsletterJid;\n/,
"\n      sessionPreferences.set('newsletterJid', newsletterJid);\n");
write('commands/bot_sovereignty/setnewsletter.js',sn);

injectPrefs('commands/bot_sovereignty/setmenuimage.js');
let smi=read('commands/bot_sovereignty/setmenuimage.js');
smi=smi.replace(/\n\s*const fallbackPath = path\.join\(process\.cwd\(\), 'utils', 'bot_image\.jpg'\);[\s\S]*?\n\s*}\n\n\s*await reply\(/,
"\n      const fallbackPath = sessionPreferences.sessionFile('menu_image.jpg');\n      fs.writeFileSync(fallbackPath, finalBuffer);\n      sessionPreferences.set('menuImagePath', fallbackPath);\n\n      await reply(");
write('commands/bot_sovereignty/setmenuimage.js',smi);

injectPrefs('commands/bot_sovereignty/presence.js');
let pr=read('commands/bot_sovereignty/presence.js');
pr=pr.replaceAll("process.env.DEFAULT_PRESENCE = 'available';","sessionPreferences.set('presence', 'available');");
pr=pr.replaceAll("process.env.DEFAULT_PRESENCE = 'composing';","sessionPreferences.set('presence', 'composing');");
pr=pr.replaceAll("process.env.DEFAULT_PRESENCE = 'recording';","sessionPreferences.set('presence', 'recording');");
pr=pr.replaceAll("process.env.DEFAULT_PRESENCE = 'paused';","sessionPreferences.set('presence', 'paused');");
write('commands/bot_sovereignty/presence.js',pr);

let menu=read('commands/general_tools/menu.js');
if (!menu.includes("sessionPreferences = require('../../utils/sessionPreferences')")) {
  menu=menu.replace("const sessionContext = require('../../utils/sessionContext');", "const sessionContext = require('../../utils/sessionContext');\nconst sessionPreferences = require('../../utils/sessionPreferences');\nconst database = require('../../database');");
}
menu=menu.replace("let prefix = config.prefix || '.';", "const prefix = { [Symbol.toPrimitive]: () => String(sessionPreferences.get('prefix', database.getBotPrefix?.() || config.prefix || '.')) };");
menu=menu.replace("const prefix = config.prefix || '.';", "const prefix = { [Symbol.toPrimitive]: () => String(sessionPreferences.get('prefix', database.getBotPrefix?.() || config.prefix || '.')) };");
menu=menu.replace(/module\.exports\.setRuntimePrefix = \(value\) => \{\n\s*prefix = String\(value \|\| '\.'\);\n\};/,
"module.exports.setRuntimePrefix = () => {}; // sessionPreferences est la source runtime");
menu=menu.split('config.botName').join("sessionPreferences.get('botName', config.botName)");
menu=menu.split('config.newsletterJid').join("sessionPreferences.get('newsletterJid', config.newsletterJid)");
if (!menu.includes('[SESSION MENU IMAGE]')) {
  const needle = 'const style = styleManager.getStyle();';
  if (menu.includes(needle)) menu=menu.replace(needle, `${needle}\n    const _sessionMenuImage = sessionPreferences.get('menuImagePath', null); // [SESSION MENU IMAGE]`);
  menu=menu.replace(/const imagePath = ([^;]+);/g, "const imagePath = (_sessionMenuImage && fs.existsSync(_sessionMenuImage)) ? _sessionMenuImage : $1;");
}
write('commands/general_tools/menu.js',menu);

let sp=read('commands/bot_sovereignty/setprefix.js');
if (!sp.includes("sessionPreferences = require('../../utils/sessionPreferences')")) {
  sp=sp.replace("const config", "const sessionPreferences = require('../../utils/sessionPreferences');\nconst config");
}
sp=sp.replaceAll('config.prefix = newPrefix;', "sessionPreferences.set('prefix', newPrefix);");
sp=sp.replace(/process\.env\.PREFIX\s*=\s*newPrefix;?/g,'');
write('commands/bot_sovereignty/setprefix.js',sp);

const forbidden = {
  'commands/bot_sovereignty/mode.js': ['process.env.SELF_MODE', "updateEnv('SELF_MODE'"],
  'commands/bot_sovereignty/autoreact.js': ['process.env.AUTOREACT', "updateEnv('AUTOREACT'"],
  'commands/bot_sovereignty/anticall.js': ['process.env.ANTICALL', "path.join(process.cwd(), '.env')"],
  'commands/bot_sovereignty/bannir.js': ['process.env.BANNED_USERS', "path.join(process.cwd(), '.env')"],
  'commands/bot_sovereignty/setbotname.js': ['fs.writeFileSync(configPath', 'config.botName = newOracleName'],
  'commands/bot_sovereignty/setnewsletter.js': ['fs.writeFileSync(configPath', 'config.newsletterJid = newsletterJid'],
};
for (const [rel, needles] of Object.entries(forbidden)) {
  const src=read(rel); for (const n of needles) if (src.includes(n)) throw new Error(`[session-isolation] fuite globale restante ${rel}: ${n}`);
}

const testScript = path.join(BOT, 'tests', 'session-preferences-isolation.test.js');
fs.writeFileSync(testScript, `'use strict';\nconst test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('fs'); const path=require('path');\nconst ctx=require('../utils/sessionContext'); const prefs=require('../utils/sessionPreferences');\nconst keys={style:3,prefix:'!',selfMode:true,publicMode:false,autoReact:true,autoReactMode:'all',anticall:true,botName:'A',newsletterJid:'111@newsletter',presence:'recording',bannedUsers:['123']};\nfunction clean(s){ try{fs.rmSync(path.join(process.cwd(),'database','sessions',s),{recursive:true,force:true});}catch{}}\ntest('preferences are bidirectionally isolated', async()=>{ const A='__iso_A__',B='__iso_B__'; clean(A);clean(B); try { await ctx.run(A,async()=>{for(const [k,v] of Object.entries(keys)) prefs.set(k,v);}); await ctx.run(B,async()=>{assert.equal(prefs.get('style',0),0); assert.equal(prefs.get('prefix','.'),'.'); prefs.set('style',17); prefs.set('prefix','#'); prefs.set('botName','B');}); await ctx.run(A,async()=>{assert.equal(prefs.get('style'),3);assert.equal(prefs.get('prefix'),'!');assert.equal(prefs.get('botName'),'A');}); await ctx.run(B,async()=>{assert.equal(prefs.get('style'),17);assert.equal(prefs.get('prefix'),'#');assert.equal(prefs.get('botName'),'B');}); } finally {clean(A);clean(B);} });\n`,'utf8');

const touched = [
'utils/sessionPreferences.js','utils/styleManager.js','utils/vipDB.js','utils/premiumDB.js','handler.js','utils/sessionManager.js',
'commands/bot_sovereignty/mode.js','commands/bot_sovereignty/autoreact.js','commands/bot_sovereignty/anticall.js','commands/bot_sovereignty/bannir.js',
'commands/bot_sovereignty/setbotname.js','commands/bot_sovereignty/setnewsletter.js','commands/bot_sovereignty/setmenuimage.js','commands/bot_sovereignty/presence.js',
'commands/bot_sovereignty/setprefix.js','commands/general_tools/menu.js','tests/session-preferences-isolation.test.js'];
for (const rel of touched) {
  const check=spawnSync(process.execPath,['--check',path.join(BOT,rel)],{encoding:'utf8'});
  if (check.status!==0) throw new Error(`[session-isolation] node --check ${rel}: ${check.stderr||check.stdout}`);
}
const tests=spawnSync(process.execPath,['--test',testScript],{cwd:BOT,encoding:'utf8'});
if(tests.stdout) process.stdout.write(tests.stdout); if(tests.stderr) process.stderr.write(tests.stderr);
if(tests.status!==0) throw new Error(`[session-isolation] test isolation échoué (${tests.status})`);
console.log('[session-isolation] ✅ isolation multi-session appliquée et testée A↔B');
