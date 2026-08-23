# streamIN — Bot Discord

Bot du serveur Discord streamIN : configuration automatique du serveur, système de tickets, vérification, récompenses de boost, suivi des invitations, notifications de commandes du site, commandes utilitaires.

## Mise en route

1. **Portail développeur Discord** ([discord.com/developers/applications](https://discord.com/developers/applications)) → application **streamIN** → onglet **Bot** → vérifie que **SERVER MEMBERS INTENT** est activé (obligatoire). Si le token a pu fuiter à un moment, régénère-le.
2. Le bot est déjà membre du serveur **StreamIN** avec les droits nécessaires. Pour un autre serveur, invite-le avec :

   ```
   https://discord.com/oauth2/authorize?client_id=1540887261199999017&permissions=1100317060114&scope=bot%20applications.commands
   ```

3. Enregistre les commandes slash : `npm run deploy` (une fois, ou à chaque ajout de commande).
4. Lance `/setup` sur Discord, **ou** exécute `npm run setup:server` en local/CI (mêmes résultats, sans passer par Discord). Idempotent : rejouable à volonté sans dupliquer quoi que ce soit.

## Structure créée par `/setup`

```
📌 INFOS       → 👋・bienvenue  📢・annonces  📜・règlement (+ bouton vérification)  ❓・faq
🛒 BOUTIQUE    → 🛍️・produits  📦・commandes (staff, webhook de notifs)
💬 COMMUNAUTÉ  → 💬・général
🎫 SUPPORT     → 🎫・ouvrir-un-ticket (panneau bouton)
🚀 BOOST       → 🚀・boost-remerciements (infos épinglées sur la récompense)
🔒 STAFF       → 📝・logs (privé, staff uniquement)
```

Rôles : `Staff`, `✅ Client Vérifié`, `💎 Booster VIP`.

## Fonctionnalités

- **`/setup`** (admin) : configuration complète et idempotente du serveur (voir ci-dessus).
- **Tickets** : bouton "🎫 Ouvrir un ticket" → salon privé (client + Staff), menu Prendre en charge / Fermer. Commandes `/ticket_add`, `/ticket_remove`, `/ticket_close`. La déduplication vérifie l'état réel des salons Discord (pas seulement un fichier local), donc pas de doublon même si `db.json` a été perdu.
- **Vérification** : bouton "✅ Je confirme avoir lu" dans `📜・règlement` → attribue le rôle `✅ Client Vérifié`.
- **Boosts** : à chaque boost, remerciement dans `🚀・boost-remerciements` + rôle 💎 Booster VIP automatique. Tous les 2 boosts cumulés pour un même membre → ticket cadeau auto-ouvert (1 compte Steam ou streaming au choix). Le palier est rappelé en message épinglé dans le salon boost.
- **Invitations** : à l'arrivée d'un membre, `👋・bienvenue` affiche qui a rejoint et par quelle invitation (code + inviteur), en plus du nombre de membres.
- **Notifications de commandes** : le site poste directement sur le webhook Discord créé par `/setup` (repo `shop-plus`, variable `DISCORD_ORDERS_WEBHOOK_URL`) — ce bot n'a pas besoin d'accès à la base de données du site pour ça.
- **Logs staff** : ouverture/fermeture de ticket, récompenses de boost, exécution de `/setup` — tout est loggé dans `📝・logs` (jamais de secret/token/donnée bancaire).
- **Commandes utiles** : `/ping`, `/serverinfo`, `/userinfo [membre]`, `/avatar [membre]`, `/stock [categorie]` (lit le catalogue public du site via Supabase, `SHOP_SUPABASE_URL`/`SHOP_SUPABASE_KEY`).

## Sécurité

- Commandes sensibles (`/setup`, `/ticket_*`) limitées par permission Discord **et** revérifiées côté code (`utils/permissions.js`).
- Aucun secret en dur : tout passe par les variables d'environnement (`.env`, jamais commité).
- Permissions du bot minimales (pas Administrateur dans le lien d'invite ci-dessus).
- Anti-spam sur la création de tickets, vérifié contre l'état réel des salons.
- Le process ne crash pas sur une erreur isolée (`unhandledRejection`/`uncaughtException` interceptés, chaque interaction dans un try/catch).
- **Ne fais jamais tourner deux instances du bot en même temps** (deux `npm start` simultanés, ou un process oublié + un déploiement Render) : chacune reçoit les mêmes interactions Discord et dupliquerait les actions. Un seul process à la fois.

## Déploiement sur Render

- **Type** : Web Service (Node) — pas Static Site.
- **Build command** : `npm install`
- **Start command** : `npm start`
- **Variables d'environnement** : `TOKEN`, `CLIENT_ID`, `GUILD_ID`, `ADMIN_ROLE_ID` (optionnel), `ORDERS_CHANNEL_ID` (optionnel), `LOGO_URL` (optionnel), `SHOP_SUPABASE_URL`/`SHOP_SUPABASE_KEY` (pour `/stock`), `SUPABASE_URL`/`SUPABASE_KEY` (optionnel, persistance avancée).
- Après le premier déploiement (ou en local avant) : `npm run deploy` pour enregistrer les commandes slash.
