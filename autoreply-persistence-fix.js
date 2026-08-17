'use strict';
const fs=require('fs');const path=require('path');const {spawnSync}=require('child_process');
const BOT=path.join(__dirname,'bot');const handler=path.join(BOT,'handler.js');const reply=path.join(BOT,'commands','bot_sovereignty','reply.js');
for(const f of [handler,reply])if(!fs.existsSync(f))throw new Error('[autoreply-persist] fichier absent: '+f);

let h=fs.readFileSync(handler,'utf8');
if(!h.includes('[AUTOREPLY LEGACY FALLBACK]')){
  const start=h.indexOf('function getArCfgCached() {');
  const end=start<0?-1:h.indexOf('\n}\n\n// Invalider le cache',start);
  if(start<0||end<0)throw new Error('[autoreply-persist] getArCfgCached introuvable');
  const replacement=`function getArCfgCached() {\n  const sid = sessionContext.getCurrentSessionId();\n  const now = Date.now();\n  const entry = _arCfgCacheBySession.get(sid);\n  if (entry && (now - entry.ts) < AR_CFG_TTL) return entry.cache;\n\n  let cache = null;\n  const candidates = [\n    path.join(process.cwd(), 'database', 'sessions', sid, 'autoreply_video.json'),\n  ];\n  // [AUTOREPLY LEGACY FALLBACK]\n  // Les anciennes versions de .reply stockaient la config dans data/.\n  // Après une mise à jour, une simple mention doit donc continuer à utiliser\n  // cette ancienne note sans obliger le propriétaire à la reconfigurer.\n  if (sid === sessionContext.DEFAULT_SESSION_ID) {\n    candidates.push(path.join(process.cwd(), 'data', 'autoreply_video.json'));\n  }\n  for (const metaP of candidates) {\n    try {\n      if (!fs.existsSync(metaP)) continue;\n      const raw = fs.readFileSync(metaP, 'utf8').trim();\n      if (!raw) continue;\n      const parsed = JSON.parse(raw);\n      if (!parsed?.active) continue;\n      let localPath = parsed.localPath;\n      if (!localPath || !fs.existsSync(localPath)) {\n        const baseDir = path.dirname(metaP);\n        const fallbackName = parsed.mediaType === 'audioMessage' ? 'autoreply_audio.ogg' : parsed.mediaType === 'imageMessage' ? 'autoreply_image.jpg' : 'autoreply_video.mp4';\n        const candidateMedia = path.join(baseDir, fallbackName);\n        if (fs.existsSync(candidateMedia)) localPath = candidateMedia;\n      }\n      cache = { ...parsed, localPath };\n      break;\n    } catch (_) {}\n  }\n  _arCfgCacheBySession.set(sid, { cache, ts: now });\n  return cache;\n}`;
  h=h.slice(0,start)+replacement+h.slice(end+2);
}
fs.writeFileSync(handler,h,'utf8');

let r=fs.readFileSync(reply,'utf8');
if(!r.includes('[AUTOREPLY STORAGE ROOT]')){
  const old="function sessionMediaDir() {\n  const dir = path.join(process.cwd(), 'database', 'sessions', sessionContext.getCurrentSessionId());\n  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });\n  return dir;\n}";
  const neu="function sessionMediaDir() {\n  // [AUTOREPLY STORAGE ROOT]\n  // Utilise un disque persistant Render lorsqu'il est configuré, sinon garde\n  // exactement le chemin historique pour compatibilité.\n  const persistentRoot = process.env.RENDER_DISK_PATH || process.env.PERSISTENT_DATA_DIR || '';\n  const dir = persistentRoot\n    ? path.join(persistentRoot, 'dipper', 'sessions', sessionContext.getCurrentSessionId())\n    : path.join(process.cwd(), 'database', 'sessions', sessionContext.getCurrentSessionId());\n  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });\n  return dir;\n}";
  if(!r.includes(old))throw new Error('[autoreply-persist] sessionMediaDir introuvable');
  r=r.replace(old,neu);
}
fs.writeFileSync(reply,r,'utf8');
for(const f of [handler,reply]){const c=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(c.status!==0)throw new Error('[autoreply-persist] syntaxe invalide '+path.relative(BOT,f)+': '+(c.stderr||c.stdout))}
console.log('[autoreply-persist] ✅ anciennes notes vidéo restaurables après mise à jour + stockage persistant compatible Render');
