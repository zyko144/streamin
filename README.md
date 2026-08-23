# streamIN — Bot Discord

Bot du serveur Discord streamIN : configuration automatique du serveur, système de tickets, récompenses de boost, notifications de commandes du site.

## Mise en route

1. **Portail développeur Discord** ([discord.com/developers/applications](https://discord.com/developers/applications)) → application **streamIN** → onglet **Bot** → active **SERVER MEMBERS INTENT** (obligatoire, sinon le bot ne démarre pas). Régénère le token si tu penses qu'il a pu fuiter.
2. **Invite le bot** sur ton serveur avec ce lien (permissions minimales nécessaires : rôles, salons, webhooks, messages, modération — pas besoin d'Administrateur) :

   ```
   https://discord.com/oauth2/authorize?client_id=1540887261199999017&permissions=1100317060114&scope=bot%20applications.commands
   ```

3. Une fois invité, monte le rôle du bot **au-dessus** des rôles qu'il devra gérer (Paramètres du serveur → Rôles).
4. Lance `/setup` sur le serveur (toi, propriétaire, ou un admin). Ça crée/retrouve les rôles (Staff, ✅ Client Vérifié, 💎 Booster VIP), les salons (`📢 INFOS`, `🎫 SUPPORT`, `🚀 BOOST`, `🛒 BOUTIQUE`), le panneau de tickets, le message de bienvenue, et un **webhook** pour les notifications de commandes (affiché en réponse, à copier dans `DISCORD_ORDERS_WEBHOOK_URL` sur le déploiement du site). `/setup` est ré-exécutable sans dupliquer ce qui existe déjà.

## Fonctionnalités

- **`/setup`** (admin) : configuration complète du serveur, idempotente.
- **Tickets** : bouton "🎫 Ouvrir un ticket" → salon privé (client + Staff), menu Prendre en charge / Fermer. Commandes `/ticket_add`, `/ticket_remove`, `/ticket_close`. Anti-spam (1 ticket ouvert par membre).
- **Boosts** : à chaque boost, remerciement dans `#boost-remerciements` + rôle 💎 Booster VIP. Tous les 2 boosts cumulés pour un même membre → ticket cadeau auto-ouvert (1 compte Steam ou streaming au choix).
- **Notifications de commandes** : le site poste directement sur le webhook Discord créé par `/setup` (voir repo `shop-plus`, variable `DISCORD_ORDERS_WEBHOOK_URL`) — pas besoin que ce bot ait accès à la base de données du site.

## Sécurité

- Toutes les commandes sensibles (`/setup`, `/ticket_*`) sont limitées par permission Discord **et** revérifiées côté code (`utils/permissions.js`) — double verrou.
- Aucun secret en dur dans le code : tout passe par les variables d'environnement (`.env`, jamais commité).
- Le bot ne demande que les permissions dont il a besoin (pas Administrateur).
- Anti-spam sur la création de tickets (verrou + limite 1 ticket ouvert/membre).
- Le process ne crash pas sur une erreur isolée (`unhandledRejection`/`uncaughtException` interceptés, chaque interaction est dans un try/catch).
- Si le token a été exposé publiquement à un moment, régénère-le dans le portail développeur — un ancien token qui traîne reste valide tant qu'il n'est pas révoqué.

## Déploiement sur Render

- **Type** : Web Service (Node) — pas Static Site.
- **Build command** : `npm install`
- **Start command** : `npm start`
- **Variables d'environnement** : `TOKEN`, `CLIENT_ID`, `GUILD_ID` (optionnel), `ADMIN_ROLE_ID` (optionnel), `ORDERS_CHANNEL_ID` (optionnel), `LOGO_URL` (optionnel).
- Après le premier déploiement (ou en local avant) : `npm run deploy` pour enregistrer les commandes slash.
