# THE BIG DIPPER

Wrapper de déploiement serveur de **THE BIG DIPPER**.

Le code applicatif principal est le dépôt `Tresor562/DIPPER-`, monté ici comme sous-module Git dans `bot/`.

## Démarrage

```bash
git clone --recurse-submodules https://github.com/Tresor562/THE_BIG_DIPPER.git
cd THE_BIG_DIPPER
npm install
npm start
```

Le processus lancé depuis `bot/` démarre à la fois :
- le bot WhatsApp multisession ;
- le moteur de sessions ;
- l'API de pairing ;
- le site de pairing sur la même adresse HTTP.

Le frontend appelle directement `POST /pair` sur ce même serveur. Aucun site Vercel séparé n'est nécessaire.

Consulte `bot/DEPLOY.md` pour les variables d'environnement et le déploiement VPS/PM2.
