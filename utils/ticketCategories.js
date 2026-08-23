// Categories proposees au client quand il clique "Ouvrir un ticket" (menu
// deroulant). Chaque categorie a son propre message de bienvenue detaille,
// pour que le client sache immediatement a quoi s'attendre.

const NOT_INSTANT_NOTICE = "⚠️ **Important : les commandes ne sont pas encore livrées instantanément pour l'instant.** Un membre du staff doit vérifier et valider chaque commande manuellement, ça peut prendre un peu de temps selon sa disponibilité — merci de ta patience, on s'occupe de toi dès que possible !";

const TICKET_CATEGORIES = [
  {
    id: 'purchase',
    label: 'Achat / Nouvelle commande',
    emoji: '🛒',
    namePrefix: 'commande',
    welcome: (member) =>
      [
        `Bienvenue ${member} ! Tu viens de passer (ou veux passer) une commande sur streamIN.`,
        '',
        "**Merci de préciser :**",
        '• Le(s) produit(s) commandé(s)',
        "• L'email utilisé sur le site (pour qu'on retrouve ta commande)",
        '',
        NOT_INSTANT_NOTICE,
        '',
        'Si tu as déjà payé, écris **"j\'ai payé"** ici : on te demandera une capture d\'écran de la confirmation PayPal.',
      ].join('\n'),
  },
  {
    id: 'payment',
    label: 'Paiement',
    emoji: '💳',
    namePrefix: 'paiement',
    welcome: (member) =>
      [
        `Bienvenue ${member} ! Le paiement se fait uniquement via **PayPal en "Amis et Famille"** — c'est obligatoire, sinon la commande ne peut pas être validée ni remboursée.`,
        '',
        'Si tu as déjà payé, écris **"j\'ai payé"** ici et on te demandera une capture d\'écran de la confirmation.',
        '',
        NOT_INSTANT_NOTICE,
      ].join('\n'),
  },
  {
    id: 'order_status',
    label: 'Suivi de commande',
    emoji: '📦',
    namePrefix: 'suivi',
    welcome: (member) =>
      [
        `Bienvenue ${member} ! Pour qu'on retrouve ta commande, donne-nous :`,
        '• Ton numéro de commande (si tu l\'as), sinon le produit acheté + la date approximative',
        '• L\'email utilisé sur le site',
        '',
        NOT_INSTANT_NOTICE,
      ].join('\n'),
  },
  {
    id: 'technical',
    label: 'Problème technique / compte',
    emoji: '🔧',
    namePrefix: 'probleme',
    welcome: (member) =>
      [
        `Bienvenue ${member} ! Décris ton problème le plus précisément possible :`,
        '• Quel produit/compte est concerné',
        "• Le message d'erreur exact si tu en as un",
        '• Une capture d\'écran si possible',
        '',
        'Plus tu donnes de détails, plus vite le staff pourra t\'aider.',
      ].join('\n'),
  },
  {
    id: 'boost_reward',
    label: 'Récompense Boost',
    emoji: '🎁',
    namePrefix: 'boost',
    welcome: (member) =>
      [
        `Bienvenue ${member} ! Tu as atteint le palier de boosts nécessaire (2 boosts cumulés sur le serveur) et tu veux récupérer ta récompense ?`,
        '',
        'Précise ici ce que tu veux : **1 compte Steam** ou **1 compte streaming au choix** — et si possible lequel précisément (jeu ou service). Le staff te le livre dès que possible.',
      ].join('\n'),
  },
  {
    id: 'other',
    label: 'Autre question',
    emoji: '❓',
    namePrefix: 'question',
    welcome: (member) => `Bienvenue ${member} ! Pose ta question, un membre du staff te répond dès que possible.`,
  },
];

module.exports = { TICKET_CATEGORIES, NOT_INSTANT_NOTICE };
