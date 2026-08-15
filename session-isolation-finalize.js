'use strict';
const fs=require('fs'); const path=require('path'); const {spawnSync}=require('child_process');
const BOT=path.join(__dirname,'bot');
function p(r){return path.join(BOT,r)} function read(r){return fs.readFileSync(p(r),'utf8')} function write(r,s){fs.writeFileSync(p(r),s,'utf8')}

let pm=read('utils/prefixManager.js');
if(!pm.includes("const sessionPreferences = require('./sessionPreferences');")){
  pm=pm.replace("const database = require('../database');","const database = require('../database');\nconst sessionContext = require('./sessionContext');\nconst sessionPreferences = require('./sessionPreferences');");
}
pm=pm.replace("const DOC_ID = 'global_prefix';","const DOC_ID = () => 'prefix_' + sessionContext.getCurrentSessionId();");
pm=pm.split('{ _id: DOC_ID }').join('{ _id: DOC_ID() }');
pm=pm.replace(/function applyRuntimePrefix\(prefix\) \{[\s\S]*?\n\}/,`function applyRuntimePrefix(prefix) {\n  sessionPreferences.set('prefix', prefix);\n  try { database.setBotPrefix?.(prefix); } catch (_) {}\n  return prefix;\n}`);
pm=pm.replace("const fallback = validatePrefix(process.env.PREFIX || config.prefix || '.');","const fallback = validatePrefix(config.prefix || '.');");
pm=pm.replace(/function getPrefix\(\) \{[\s\S]*?\n\}/,`function getPrefix() {\n  return String(sessionPreferences.get('prefix', database.getBotPrefix?.() || config.prefix || '.'));\n}`);
write('utils/prefixManager.js',pm);

let menu=read('commands/general_tools/menu.js');
menu=menu.replace(/\n\s*const _sessionMenuImage = sessionPreferences\.get\('menuImagePath', null\); \/\/ \[SESSION MENU IMAGE\]/g,'');
menu=menu.replace(/const imagePath = \(_sessionMenuImage && fs\.existsSync\(_sessionMenuImage\)\) \? _sessionMenuImage : ([^;]+);/g,'const imagePath = $1;');
if(!menu.includes('[SESSION MENU IMAGE FINAL]')){
  const old='if (!imageBuffer) imageBuffer = await getImageBufferForStyle(style);';
  const neu=`if (!imageBuffer) {\n    const _sessionMenuImage = sessionPreferences.get('menuImagePath', null); // [SESSION MENU IMAGE FINAL]\n    if (_sessionMenuImage && fs.existsSync(_sessionMenuImage)) {\n      try { imageBuffer = fs.readFileSync(_sessionMenuImage); } catch (_) {}\n    }\n    if (!imageBuffer) imageBuffer = await getImageBufferForStyle(style);\n  }`;
  if(!menu.includes(old)) throw new Error('[session-isolation-finalize] sender image anchor absent');
  menu=menu.replace(old,neu);
}
write('commands/general_tools/menu.js',menu);

for(const rel of ['commands/bot_sovereignty/botstatus.js','commands/general_tools/ping.js']){
  if(!fs.existsSync(p(rel))) continue;
  let s=read(rel);
  if(s.includes('config.botName')){
    if(!s.includes("sessionPreferences = require('../../utils/sessionPreferences')")){
      const m=s.match(/const config\s*=\s*require\((['"])\.\.\/\.\.\/config(?:\.js)?\1\);/);
      if(m) s=s.replace(m[0],m[0]+"\nconst sessionPreferences = require('../../utils/sessionPreferences');");
    }
    s=s.split('config.botName').join("sessionPreferences.get('botName', config.botName)");
    write(rel,s);
  }
}

const checks=['utils/prefixManager.js','commands/general_tools/menu.js','commands/bot_sovereignty/botstatus.js','commands/general_tools/ping.js'];
for(const rel of checks){ if(!fs.existsSync(p(rel))) continue; const c=spawnSync(process.execPath,['--check',p(rel)],{encoding:'utf8'}); if(c.status!==0) throw new Error(`[session-isolation-finalize] syntaxe ${rel}: ${c.stderr||c.stdout}`); }
pm=read('utils/prefixManager.js');
for(const bad of ['process.env.PREFIX = prefix',"const DOC_ID = 'global_prefix'"]){if(pm.includes(bad))throw new Error('[session-isolation-finalize] fuite prefix: '+bad)}
menu=read('commands/general_tools/menu.js');
if(!menu.includes('[SESSION MENU IMAGE FINAL]')) throw new Error('[session-isolation-finalize] image menu non sessionnée');
console.log('[session-isolation-finalize] ✅ prefix Mongo/runtime + menu image + identité affichée isolés');

// Après l'isolation par session, remplacer le stockage local éphémère des
// préférences par son backend Mongo durable et brancher les réglages de groupe.
require('./runtime-settings-persistence-v2');
require('./runtime-settings-shutdown-guard');
require('./fix-session-preferences-test-exit');
