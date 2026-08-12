# THE BIG DIPPER — Render Deploy

Dépôt privé de déploiement du bot THE BIG DIPPER.

Le code de base est référencé comme sous-module privé dans `bot/` depuis `Tresor562/DIPPER-`. Le script `prepare.js` applique avant installation les fichiers audités de cette version : configuration des images du menu, `gc2.js`, `gc3.js`, `gc4.js`, `package.json` corrigé et `.env` fourni.

## Render

Render doit avoir accès aux deux dépôts privés `Tresor562/THE_BIG_DIPPER` et `Tresor562/DIPPER-`, car Render clone automatiquement les sous-modules Git privés lorsque le compte GitHub lié dispose des accès correspondants.

Build : `npm install`

Start : `npm start`

Health check : `/health`

> Les sessions WhatsApp sont créées dans `bot/sessions/` et `bot/auth_info_baileys/`. Sur Render sans disque persistant, les fichiers créés à l’exécution restent éphémères.
