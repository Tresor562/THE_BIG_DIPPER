'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const carousel = path.join(BOT, 'utils', 'interactiveCarousel.js');
const handler = path.join(BOT, 'handler.js');
const reply = path.join(BOT, 'commands', 'bot_sovereignty', 'reply.js');

for (const f of [carousel, handler, reply]) if (!fs.existsSync(f)) throw new Error('[ux-fix] fichier absent: ' + f);

const carouselSource = `'use strict';
const { proto, prepareWAMessageMedia, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
function normalizeItems(items){return(Array.isArray(items)?items:[]).filter(i=>i&&(i.mediaUrl||i.image||i.video)).slice(0,10).map((i,n)=>({type:i.type==='video'?'video':'image',mediaUrl:i.mediaUrl||i.video||i.image,title:String(i.title||\`Résultat \${n+1}\`).slice(0,160),body:String(i.body||'').slice(0,280),url:i.url?String(i.url):''}))}
function timeout(p,ms,label){let t;return Promise.race([Promise.resolve(p),new Promise((_,r)=>{t=setTimeout(()=>r(new Error(label+' timeout')),ms);if(t.unref)t.unref()})]).finally(()=>{if(t)clearTimeout(t)})}
function relayNodes(jid){const biz={tag:'biz',attrs:{actual_actors:'2',host_storage:'2',privacy_mode_ts:String(Math.floor(Date.now()/1000)-77980457)},content:[{tag:'interactive',attrs:{type:'native_flow',v:'1'},content:[{tag:'native_flow',attrs:{v:'9',name:'mixed'}}]},{tag:'quality_control',attrs:{source_type:'third_party'}}]};return jid.endsWith('@g.us')?[biz]:[{tag:'bot',attrs:{biz_bot:'1'}},biz]}
async function card(sock,item){const input=item.type==='video'?{video:{url:item.mediaUrl}}:{image:{url:item.mediaUrl}};const prepared=await timeout(prepareWAMessageMedia(input,{upload:sock.waUploadToServer,mediaUploadTimeoutMs:15000}),18000,'upload media');return{body:proto.Message.InteractiveMessage.Body.fromObject({text:[item.title,item.body,item.url].filter(Boolean).join('\\n').slice(0,900)}),footer:proto.Message.InteractiveMessage.Footer.fromObject({text:''}),header:proto.Message.InteractiveMessage.Header.fromObject({...prepared,title:'',subtitle:'',hasMediaAttachment:true}),nativeFlowMessage:proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({buttons:[],messageParamsJson:'{}',messageVersion:1})}}
async function fallback(sock,jid,title,items,quoted){const sent=[];for(const item of items.slice(0,4)){try{const p=item.type==='video'?{video:{url:item.mediaUrl},caption:item.title}:{image:{url:item.mediaUrl},caption:item.title};sent.push(await timeout(sock.sendMessage(jid,p,quoted?{quoted}:undefined),15000,'fallback'))}catch(_){}}if(!sent.length)return sock.sendMessage(jid,{text:(title||'Résultats')+'\\n\\nImpossible d’afficher le carrousel pour le moment.'},quoted?{quoted}:undefined);return sent}
async function sendMediaCarousel(sock,jid,{title='Résultats',subtitle='',items=[],quoted=null,contextInfo=undefined}={}){const list=normalizeItems(items);if(!list.length)throw new Error('Aucun média valide pour le carrousel.');const q=quoted&&jid.endsWith('@g.us')?quoted:undefined;try{const cards=[];for(const item of list){try{cards.push(await card(sock,item))}catch(e){console.warn('[carousel] carte ignorée:',e.message)}}if(cards.length<2)throw new Error('Pas assez de cartes exploitables');const interactiveMessage=proto.Message.InteractiveMessage.fromObject({body:proto.Message.InteractiveMessage.Body.fromObject({text:[title,subtitle].filter(Boolean).join('\\n')}),footer:proto.Message.InteractiveMessage.Footer.fromObject({text:''}),header:proto.Message.InteractiveMessage.Header.fromObject({title:'',subtitle:'',hasMediaAttachment:false}),carouselMessage:proto.Message.InteractiveMessage.CarouselMessage.fromObject({cards}),contextInfo});const generated=generateWAMessageFromContent(jid,{interactiveMessage},{quoted:q,userJid:sock.user?.id});await timeout(sock.relayMessage(jid,generated.message,{messageId:generated.key.id,additionalNodes:relayNodes(jid)}),15000,'relay carrousel');return generated}catch(e){console.warn('[carousel] fallback:',e.message);return fallback(sock,jid,title,list,q)}}
module.exports={normalizeItems,sendMediaCarousel};
`;
fs.writeFileSync(carousel, carouselSource, 'utf8');

let h = fs.readFileSync(handler, 'utf8');
const infoBlock = /if \(!arCfg\?\.active\) \{[\s\S]*?\n\s*\} else \{/m;
if (!h.includes('[AUTOREPLY SILENT WHEN UNCONFIGURED]')) {
  const m = h.match(infoBlock);
  if (!m) throw new Error('[ux-fix] bloc autoreply sans config introuvable');
  h = h.replace(infoBlock, `if (!arCfg?.active) {\n            // [AUTOREPLY SILENT WHEN UNCONFIGURED]\n            // Une simple mention ne produit rien tant qu'aucune note vidéo n'est configurée.\n            console.log('[autoReply] mention ignorée silencieusement : aucune note configurée');\n            if (!isCommand) return;\n          } else {`);
}
// Si la config existe mais que le fichier a disparu/corrompu, rester discret côté chat.
h = h.replace(/try \{\n\s*await sock\.sendMessage\(from, \{\n\s*text: `\*⚠️ Erreur note vidéo\*[\s\S]*?\n\s*\} catch \(_\) \{\}/m, "// [AUTOREPLY SILENT BROKEN MEDIA] erreur journalisée uniquement");
h = h.replace(/try \{\n\s*await sock\.sendMessage\(from, \{\n\s*text: `\*⚠️ Fichier vidéo corrompu\*[\s\S]*?\n\s*\} catch \(_\) \{\}/m, "// [AUTOREPLY SILENT CORRUPT MEDIA] erreur journalisée uniquement");
fs.writeFileSync(handler, h, 'utf8');

let r = fs.readFileSync(reply, 'utf8');
if (!r.includes('[AUTOREPLY CONFIRM AUTO DELETE 3S]')) {
  const old = `      // Toujours répondre dans le chat courant (groupe ou privé)\n      await reply(confirmMsg);\n\n      // Bonus : aussi en DM si en groupe (non bloquant)\n      if (isGroup) {\n        sock.sendMessage(senderNumber + '@s.whatsapp.net', { text: confirmMsg }).catch(() => {});\n      }`;
  if (!r.includes(old)) throw new Error('[ux-fix] confirmation .reply introuvable');
  const neu = `      // [AUTOREPLY CONFIRM AUTO DELETE 3S]\n      // Confirmation courte et discrète : visible 3 secondes puis supprimée.\n      const confirmSent = await reply(confirmMsg);\n      if (confirmSent?.key) {\n        const timer = setTimeout(() => {\n          sock.sendMessage(chatId, { delete: confirmSent.key }).catch(() => {});\n        }, 3000);\n        if (timer.unref) timer.unref();\n      }`;
  r = r.replace(old, neu);
}
fs.writeFileSync(reply, r, 'utf8');

for (const f of [carousel, handler, reply]) {
  const c = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (c.status !== 0) throw new Error('[ux-fix] syntaxe invalide '+path.relative(BOT,f)+': '+(c.stderr||c.stdout));
}
console.log('[ux-fix] ✅ carrousels horizontaux, mentions silencieuses et confirmation .reply auto-effacée');
