'use strict';
const fs=require('fs'); const path=require('path'); const {spawnSync}=require('child_process');
const BOT=path.join(__dirname,'bot');
function p(r){return path.join(BOT,r)} function rw(r,fn){let s=fs.readFileSync(p(r),'utf8'); const n=fn(s); fs.writeFileSync(p(r),n,'utf8');}

rw('commands/bot_sovereignty/mode.js',s=>{
  if(!s.includes("sessionPreferences = require('../../utils/sessionPreferences')")){
    const m=s.match(/const config\s*=\s*require\((['"])\.\.\/\.\.\/config(?:\.js)?\1\);/);
    if(m) s=s.replace(m[0],m[0]+"\nconst sessionPreferences = require('../../utils/sessionPreferences');");
  }
  s=s.replace("const isSelfMode = process.env.SELF_MODE === 'true' || config.selfMode === true;","const isSelfMode = sessionPreferences.get('selfMode', config.selfMode === true) === true;");
  return s;
});

rw('utils/sessionManager.js',s=>{
  s=s.replace('try { handler.initializeAntiCall(sock); } catch {}',"try { sessionContext.run(sessionId, () => handler.initializeAntiCall(sock)); } catch {}");
  return s;
});

for(const rel of ['commands/bot_sovereignty/mode.js','utils/sessionManager.js']){
  const c=spawnSync(process.execPath,['--check',p(rel)],{encoding:'utf8'}); if(c.status!==0) throw new Error(`[session-isolation-prep] syntaxe ${rel}: ${c.stderr||c.stdout}`);
}
const mode=fs.readFileSync(p('commands/bot_sovereignty/mode.js'),'utf8');
if(mode.includes('process.env.SELF_MODE')) throw new Error('[session-isolation-prep] SELF_MODE global encore présent');
const sm=fs.readFileSync(p('utils/sessionManager.js'),'utf8');
if(!sm.includes('sessionContext.run(sessionId, () => handler.initializeAntiCall(sock))')) throw new Error('[session-isolation-prep] antiCall pas enregistré dans la session');
console.log('[session-isolation-prep] ✅ mode initial + événement call attachés à la bonne session');
