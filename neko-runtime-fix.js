'use strict';
const fs=require('fs');const path=require('path');const {spawnSync}=require('child_process');
const file=path.join(__dirname,'bot','commands','anime','anime.js');const MARK='[NEKO RESILIENT IMAGE]';
if(!fs.existsSync(file))throw new Error('[neko-fix] anime.js absent');
let src=fs.readFileSync(file,'utf8');
if(!src.includes(MARK)){
 const anchor="const { isPremium } = require('../../utils/premiumDB');";
 if(!src.includes(anchor))throw new Error('[neko-fix] import premiumDB introuvable');
 src=src.replace(anchor,`${anchor}\nconst resolveAnimeImage = require('../../utils/animeImageResolver'); // ${MARK}`);
 const old="        const imgUrl = await getWaifuPicsImage('neko');\n        const imgBuf = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 20000 });";
 const replacement="        const imgResolved = await resolveAnimeImage('neko');\n        const imgBuf = { data: imgResolved.buffer };";
 const count=src.split(old).length-1;if(count!==1)throw new Error(`[neko-fix] bloc neko attendu 1 fois, trouvé ${count}`);
 src=src.replace(old,replacement);fs.writeFileSync(file,src,'utf8');
}
const c=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(c.status!==0)throw new Error('[neko-fix] anime.js invalide: '+(c.stderr||c.stdout));
console.log('[neko-fix] ✅ neko utilise désormais plusieurs fournisseurs et valide réellement le média avant envoi');
