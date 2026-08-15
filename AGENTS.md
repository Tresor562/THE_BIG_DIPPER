# THE BIG DIPPER — Procédure permanente de modification et déploiement

Ce fichier est la règle de travail officielle pour tout agent/assistant qui modifie THE BIG DIPPER. Le lire avant toute modification du bot.

## Objectif prioritaire

Éviter qu'une mise à jour de code interrompe les sockets WhatsApp actifs, casse un pairing en cours ou provoque un redémarrage Render inutile.

## Étape obligatoire avant toute modification

Classer la modification en **HOT** ou **CORE**.

### HOT

Exemples :
- création/modification d'une commande dans `commands/**` ;
- textes, réponses, menus et logique isolée d'une commande ;
- changement qui ne nécessite pas de recréer les sockets Baileys ni de modifier le moteur central.

Règles :
1. Ne jamais mettre à jour automatiquement le pointeur du sous-module `bot` dans `THE_BIG_DIPPER` uniquement parce qu'une commande HOT a changé.
2. Tester le fichier modifié avant activation : syntaxe Node, chargement du module, exports attendus (`name`, `execute`, etc.) et tests ciblés.
3. Quand le Hot Command Updater est installé et opérationnel : publier la commande comme candidate, la valider, puis l'activer atomiquement sans redémarrer Render.
4. Si la candidate échoue : la rejeter et conserver l'ancienne version active.
5. Ne jamais couper une session WhatsApp ou un pairing pour activer une modification HOT.

### CORE

Exemples :
- `index.js` ;
- `handler.js` lorsque le changement touche le moteur global ;
- `utils/sessionManager.js` ;
- Baileys ;
- Mongo/authentification/pairing central ;
- serveur HTTP/API ;
- architecture des sessions ;
- dépendances ou `package.json` qui imposent un redémarrage.

Règles :
1. Travailler sur une version **candidate**, jamais directement comme si elle était déjà stable.
2. Simuler le build complet avant tout déploiement Render.
3. La version stable doit continuer à fonctionner tant que la candidate n'est pas validée.
4. Une candidate qui échoue ne doit jamais remplacer la stable.
5. Pour les futures migrations multi-instance, une seule instance doit posséder une session WhatsApp donnée à la fois afin d'éviter `connectionReplaced`.

## Simulation de build obligatoire avant Render

Avant de déclarer une mise à jour CORE prête :

1. reproduire autant que possible le build Render (`npm install` + `postinstall`) ;
2. exécuter les `node --check` ;
3. exécuter les tests et audits du dépôt ;
4. si possible, démarrer temporairement l'application candidate ;
5. vérifier `/health` ;
6. arrêter proprement le processus de test.

Si une étape échoue : corriger la candidate et recommencer jusqu'à succès. Ne pas déclencher volontairement le déploiement de production avec une candidate connue comme cassée.

## Gestion des erreurs de build

- Un build candidate en erreur ne signifie pas qu'il faut toucher à la version stable.
- Diagnostiquer l'erreur à partir de la sortie de build disponible (simulation locale/CI ou logs Render fournis/accessible via intégration).
- Corriger la candidate, relancer la simulation, puis seulement promouvoir la version validée.
- Ne jamais prétendre avoir consulté directement les logs Render si aucun connecteur/API Render n'est disponible dans la conversation.

## Pairing et disponibilité

- Le pairing doit rester disponible pendant les mises à jour HOT.
- Une session en cours de connexion ne doit pas être détruite juste pour charger une nouvelle commande.
- Les credentials et réglages persistants doivent rester séparés du cycle de vie éphémère du processus Render autant que possible.

## Architecture cible de mise à jour sans coupure

Cible :
- **Gateway/session layer stable** : sockets WhatsApp, pairing, credentials, leases de sessions ;
- **Command Engine hot-reloadable** : commandes et logique isolée ;
- **MongoDB** : état durable, versions validées, coordination/leases ;
- **candidate → validation → promotion** avec rollback automatique.

Pour une mise à jour HOT validée :
`ancienne commande active → candidate testée → nouvelle commande active`

Jamais :
`petite commande → mise à jour du sous-module → redeploy Render → reconnexion de tous les bots`.

## Important : état de mise en œuvre

Cette procédure décrit aussi l'architecture cible. Tant que le Hot Command Updater et le mécanisme de promotion atomique ne sont pas effectivement installés et vérifiés en production :
- ne pas prétendre qu'une commande poussée dans `DIPPER-` est automatiquement active sur les bots ;
- ne pas mettre à jour le sous-module de production par réflexe ;
- préparer/tester la candidate et signaler clairement qu'une activation contrôlée reste nécessaire.

## Règle finale

Toujours suivre :

`classer HOT/CORE → modifier → tester → simuler le build si CORE → corriger jusqu'à ✅ → activer/déployer uniquement par le chemin approprié`

La disponibilité des sessions WhatsApp prime sur la commodité d'un déploiement rapide.
