'use strict';
const fs=require('fs');const path=require('path');const{spawnSync}=require('child_process');
const ROOT=__dirname,BOT=path.join(ROOT,'bot'),handler=path.join(BOT,'handler.js');
const imageSource=path.join(ROOT,'overrides','ownerProfileImage.js');
const imageTarget=path.join(BOT,'utils','ownerProfileImage.js');
const helper=path.join(BOT,'utils','ownerResponseHeader.js');
const MARK='[OWNER RESPONSE HEADER]';
if(!fs.existsSync(handler)||!fs.existsSync(imageSource))throw new Error('[owner-header] fichiers requis absents');
let normalized=null;
try{
  const code=`const sharp=require('sharp');const img=require(process.env.OWNER_IMG);sharp(img).rotate().resize(320,320,{fit:'cover',position:'centre'}).flatten({background:'#000000'}).jpeg({quality:92,chromaSubsampling:'4:4:4'}).toBuffer().then(b=>process.stdout.write(b.toString('base64'))).catch(e=>{console.error(e.message);process.exit(1)});`;
  const out=spawnSync(process.execPath,['-e',code],{cwd:BOT,encoding:'utf8',env:{...process.env,OWNER_IMG:imageSource},timeout:20000,maxBuffer:5*1024*1024});
  if(out.status===0&&out.stdout.trim())normalized=Buffer.from(out.stdout.trim(),'base64');
}catch(_){}
if(!normalized||normalized.length<1000)normalized=require(imageSource);
fs.writeFileSync(imageTarget,`'use strict';\nmodule.exports=Buffer.from('${normalized.toString('base64')}','base64');\n`,'utf8');
fs.writeFileSync(helper,`'use strict';
let thumbnail=null;try{thumbnail=require('./ownerProfileImage')}catch(_){}
const TITLE='𝐌ꝛ⥔𝕿𝖗𝖊𝖘𝖔𝖗 🌹';
const BODY='𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑';
const URL='https://the-big-dipper.onrender.com';
function eligible(p){return !!p&&typeof p==='object'&&!p.react&&!p.delete&&!p.sticker&&!p.poll&&!p.contacts&&!p.location&&!p.product&&!!(typeof p.text==='string'||typeof p.caption==='string'||p.image||p.video||p.audio||p.document)}
function decorate(payload){if(!eligible(payload)||payload.contextInfo)return payload;const next={...payload};const ad={title:TITLE,body:BODY,sourceUrl:URL,mediaUrl:URL,mediaType:1,showAdAttribution:false,renderLargerThumbnail:false};if(Buffer.isBuffer(thumbnail)&&thumbnail.length>1000)ad.thumbnail=thumbnail;next.contextInfo={externalAdReply:ad};return next}
module.exports={decorate,TITLE,BODY,URL};
`,'utf8');
let src=fs.readFileSync(handler,'utf8');
if(!src.includes(MARK)){
 const old='    const disciplinedPayload = decoratePayload(payload);';
 if(!src.includes(old))throw new Error('[owner-header] ancre disciplinedPayload introuvable');
 src=src.replace(old,`    const disciplinedPayload = require('./utils/ownerResponseHeader').decorate(decoratePayload(payload)); // ${MARK}`);
 fs.writeFileSync(handler,src,'utf8');
}
for(const f of [imageTarget,helper,handler]){const c=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(c.status!==0)throw new Error('[owner-header] syntaxe invalide '+path.basename(f)+': '+(c.stderr||c.stdout))}
const image=require(imageTarget);if(!Buffer.isBuffer(image)||image.length<1000)throw new Error('[owner-header] miniature propriétaire invalide');
console.log('[owner-header] ✅ miniature carrée complète + rich preview global actif');
