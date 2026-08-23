// Detection de phrases dans les tickets pour automatiser les reponses les
// plus courantes du support. Base sur des mots-cles (pas d'IA externe, pas
// de cle API a fournir). Facile a etendre : ajoute une regex a PAYMENT_PATTERNS,
// une entree a PROBLEM_CATEGORIES, ou un intent complet a INTENTS.

const { ChannelType } = require('discord.js');
const { readDatabase, writeDatabase } = require('./db');
const { brandedEmbed, GOLD_BOOST, RED_ALERT } = require('./theme');
const { logAction } = require('./logs');

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // enleve les accents (paye/payé -> paye)
}

function isTicketChannel(channel) {
  return channel?.type === ChannelType.GuildText && channel.topic?.startsWith('ticket-owner:');
}

function getState(channelId) {
  const db = readDatabase();
  return db.ticketAutomation?.[channelId] ?? { awaitingProof: false, proofReceived: false, triggered: {} };
}

function setState(channelId, patch) {
  const db = readDatabase();
  db.ticketAutomation = db.ticketAutomation || {};
  db.ticketAutomation[channelId] = { ...getState(channelId), ...patch };
  writeDatabase(db);
}

function markTriggered(channelId, intentId) {
  const state = getState(channelId);
  setState(channelId, { triggered: { ...state.triggered, [intentId]: true } });
}

async function pingStaff(message, { title, description, color = RED_ALERT }) {
  const staffRole = message.guild.roles.cache.find((r) => r.name === 'Staff');
  await message.channel.send({
    content: staffRole ? `${staffRole}` : undefined,
    embeds: [brandedEmbed({ title, description, color })],
  });
}

// --- "J'ai payé" : ~20 façons de le dire (regex sur texte normalisé : minuscules, sans accents) ---
const PAYMENT_PATTERNS = [
  /\b(j.?ai|jai)\s*(deja\s*)?paye[r]?\b/, // j'ai payé / j'ai déjà payé / j'ai payer (faute courante)
  /\bc.?est\s*paye\b/, // c'est payé
  /\bpaiement\s*(effectue|envoye|fait|ok|recu|termine)\b/, // paiement effectué/envoyé/fait/ok/reçu/terminé
  /^paye\s*[!.]*$/, // "payé" tout seul
  /^(c.?est\s*)?regle\s*[!.]*$/, // "réglé" / "c'est réglé"
  /\bj.?ai\s*regle\b/, // j'ai réglé
  /\b(j.?ai\s*envoye|envoye)\s*l.?argent\b/, // j'ai envoyé l'argent
  /\bargent\s*envoye\b/, // argent envoyé
  /\bj.?ai\s*fait\s*le\s*virement\b/, // j'ai fait le virement
  /\bvirement\s*(effectue|fait)\b/, // virement effectué/fait
  /\bj.?ai\s*transfere\s*l.?argent\b/, // j'ai transféré l'argent
  /\btransfert\s*(effectue|fait)\b/, // transfert effectué
  /\bpaypal\s*(ok|envoye|fait|c.?est\s*bon)\b/, // paypal ok/envoyé/fait
  /\bvoila\s*(c.?est\s*)?(j.?ai\s*)?paye\b/, // voilà c'est payé / voilà j'ai payé
  /\bc.?est\s*bon\s*(j.?ai|c.?est)?\s*paye?\b/, // c'est bon j'ai payé
  /\bj.?ai\s*fini\s*(de\s*)?payer\b/, // j'ai fini de payer
  /\bcommande\s*payee\b/, // commande payée
  /\bj.?ai\s*paye\s*la\s*commande\b/, // j'ai payé la commande
  /\bj.?ai\s*mis\s*l.?argent\b/, // j'ai mis l'argent
  /\b(as[\s-]*tu|avez[\s-]*vous)\s*recu\s*(le\s*)?paiement\b/, // as-tu reçu le paiement
  /\bpaiement\s*recu\s*de\s*mon\s*cote\b/, // paiement reçu de mon côté
  /\bmoney\s*sent\b/, // au cas où en anglais
];

// --- ~20 categories de problemes, chacune avec ses propres mots-cles ---
const PROBLEM_CATEGORIES = [
  { id: 'refund', label: '💸 Demande de remboursement', patterns: [/rembours/, /je\s*veux\s*(etre\s*)?rembourse/] },
  { id: 'account_not_working', label: '🔑 Compte ne fonctionne pas', patterns: [/(ne\s*)?marche\s*pas/, /(ne\s*)?fonctionne\s*pas/, /mot\s*de\s*passe\s*incorrect/, /arrive\s*pas\s*a\s*me\s*connecter/, /login\s*(ne\s*)?marche\s*pas/] },
  { id: 'account_taken', label: '👥 Compte déjà utilisé par quelqu\'un', patterns: [/compte\s*deja\s*pris/, /quelqu.?un\s*d.?autre\s*est\s*connecte/, /compte\s*utilise\s*par\s*quelqu.?un/] },
  { id: 'account_banned', label: '🚫 Compte banni/suspendu', patterns: [/compte.{0,15}banni/, /compte.{0,15}suspendu/, /compte.{0,15}bloque/] },
  { id: 'wrong_product', label: '📦 Mauvais produit reçu', patterns: [/pas\s*le\s*bon\s*produit/, /erreur\s*de\s*commande/, /c.?est\s*pas\s*ce\s*que\s*j.?ai\s*commande/] },
  { id: 'no_delivery', label: '📭 Rien reçu', patterns: [/j.?ai\s*rien\s*recu/, /toujours\s*pas\s*livre/, /pas\s*de\s*compte\s*recu/, /j.?attends\s*toujours/] },
  { id: 'scam_accusation', label: '⚠️ Accusation d\'arnaque', patterns: [/\barnaque\b/, /\bscam\b/, /vous\s*m.?avez\s*arnaque/, /c.?est\s*du\s*vol/] },
  { id: 'no_staff_response', label: '⏳ Pas de réponse du staff', patterns: [/personne\s*ne\s*repond/, /ca\s*fait\s*longtemps\s*que\s*j.?attends/, /quelqu.?un\s*peut\s*m.?aider/] },
  { id: 'billing_dispute', label: '🧾 Litige de facturation', patterns: [/facture\s*erronee/, /montant\s*incorrect/, /on\s*m.?a\s*trop\s*pris/, /double\s*paiement/, /paye\s*deux\s*fois/] },
  { id: 'password_changed', label: '🔒 Mot de passe changé par l\'ancien propriétaire', patterns: [/mot\s*de\s*passe\s*a\s*change/, /ancien\s*proprietaire\s*a\s*repris/, /je\s*n.?ai\s*plus\s*acces/] },
  { id: 'twofa_issue', label: '📱 Problème de double authentification', patterns: [/\b2fa\b/, /double\s*authentification/, /code\s*de\s*verification/, /authentification\s*a\s*deux\s*facteurs/] },
  { id: 'region_lock', label: '🌍 Blocage régional', patterns: [/region\s*bloquee/, /pas\s*disponible\s*dans\s*mon\s*pays/, /erreur\s*de\s*region/] },
  { id: 'not_as_described', label: '📋 Produit différent de la description', patterns: [/pas\s*ce\s*qui\s*etait\s*decrit/, /produit\s*different\s*de\s*l.?annonce/] },
  { id: 'cancel_order', label: '❌ Demande d\'annulation', patterns: [/annuler\s*ma\s*commande/, /je\s*veux\s*annuler/, /\bannulation\b/] },
  { id: 'modify_order', label: '✏️ Demande de modification de commande', patterns: [/changer\s*ma\s*commande/, /modifier\s*ma\s*commande/, /je\s*veux\s*changer\s*de\s*produit/] },
  { id: 'website_bug', label: '🐛 Bug signalé sur le site', patterns: [/bug\s*sur\s*le\s*site/, /erreur\s*sur\s*le\s*site/, /le\s*site\s*(ne\s*)?marche\s*pas/, /probleme\s*technique/] },
  { id: 'discord_role_missing', label: '🎭 Rôle Discord manquant', patterns: [/j.?ai\s*pas\s*mon\s*role/, /role\s*premium\s*pas\s*applique/, /je\s*suis\s*pas\s*verifie/] },
  { id: 'boost_reward_missing', label: '💎 Récompense de boost non reçue', patterns: [/pas\s*recu\s*ma\s*recompense/, /recompense\s*boost\s*pas\s*recue/] },
  { id: 'slow_delivery', label: '🐌 Livraison trop lente', patterns: [/(c.?est|tres)\s*long/, /ca\s*prend\s*du\s*temps/, /toujours\s*pas\s*recu\s*apres/] },
  { id: 'general_complaint', label: '😠 Insatisfaction générale', patterns: [/pas\s*content/, /insatisfait/, /tres\s*decu/, /mauvaise\s*experience/] },
];

const problemHandler = (category) => async (message) => {
  await message.reply({
    embeds: [
      brandedEmbed({
        title: '⚠️ Signalement pris en compte',
        description: "Le staff a été notifié. Peux-tu préciser : numéro de commande, produit concerné, et si possible une capture d'écran du problème ?",
        color: RED_ALERT,
      }),
    ],
  });
  await pingStaff(message, {
    title: `🚨 ${category.label}`,
    description: `${message.author} a signalé ce problème dans ce ticket, merci de vérifier.`,
  });
  logAction(message.guild, 'TICKET_ISSUE_FLAGGED', { Salon: `${message.channel}`, Client: `${message.author} (${message.author.id})`, Type: category.label });
};

/**
 * Intentions detectees dans un message de ticket. Chacune ne se declenche
 * qu'une fois par ticket (evite le spam si le client repete le mot-cle).
 */
const INTENTS = [
  {
    id: 'payment_confirmed',
    match: (t) => PAYMENT_PATTERNS.some((re) => re.test(t)),
    handle: async (message) => {
      setState(message.channel.id, { awaitingProof: true });
      await message.reply({
        embeds: [
          brandedEmbed({
            title: '💳 Preuve de paiement requise',
            description: [
              '**Merci de nous envoyer une capture d\'écran de la confirmation PayPal directement dans ce salon** (photo/capture, pas juste du texte).',
              '',
              'Dès que la preuve est reçue, le staff est notifié automatiquement pour vérifier et valider ta commande.',
            ].join('\n'),
            color: GOLD_BOOST,
          }),
        ],
      });
    },
  },
  ...PROBLEM_CATEGORIES.map((category) => ({
    id: `problem_${category.id}`,
    match: (t) => category.patterns.some((re) => re.test(t)),
    handle: problemHandler(category),
  })),
  {
    id: 'delivery_time',
    match: (t) => /combien\s*de\s*temps/.test(t) || /\bdelai\b/.test(t) || /(quand|c.?est\s*quand).*(recevoir|recois|livr)/.test(t),
    handle: async (message) => {
      await message.reply({
        embeds: [
          brandedEmbed({
            title: '⏱️ Délai de livraison',
            description: "Généralement quelques minutes après confirmation du paiement (dès qu'un membre du staff est disponible). Merci de patienter, on s'occupe de toi rapidement !",
          }),
        ],
      });
    },
  },
  {
    id: 'how_to_pay',
    match: (t) => /comment\s*(je\s*)?(pay|paie)/.test(t) || /quel\s*(est\s*le\s*)?prix/.test(t) || /combien\s*(ca\s*)?coute/.test(t),
    handle: async (message) => {
      await message.reply({
        embeds: [
          brandedEmbed({
            title: '💳 Comment payer',
            description: 'Ajoute tes produits au panier sur https://shop-plus-nu.vercel.app/, puis paye via PayPal en **Amis et Famille** (obligatoire, sinon la commande ne peut pas être validée). Reviens ensuite ici avec ta preuve de paiement.',
          }),
        ],
      });
    },
  },
];

async function handleTicketAutomation(message) {
  if (message.author.bot) return;
  if (!isTicketChannel(message.channel)) return;

  // Le proprietaire du ticket declenche toujours l'automatisation, meme s'il
  // a aussi le role Staff (ex: le patron qui teste, ou un membre du staff
  // qui achete pour lui-meme). On ne filtre que les AUTRES membres du staff
  // qui repondent dans le ticket de quelqu'un d'autre (discussion interne).
  const ticketOwnerId = message.channel.topic?.split(':')[1];
  const isTicketOwner = message.author.id === ticketOwnerId;
  const member = message.member;
  const isStaff = member?.roles.cache.some((r) => r.name === 'Staff') ?? false;
  if (isStaff && !isTicketOwner) return;

  const state = getState(message.channel.id);

  // Phase 2 : en attente d'une preuve de paiement -> une piece jointe image la valide.
  if (state.awaitingProof && !state.proofReceived && message.attachments.size > 0) {
    const hasImage = [...message.attachments.values()].some((a) => (a.contentType || '').startsWith('image/'));
    if (hasImage) {
      setState(message.channel.id, { awaitingProof: false, proofReceived: true });
      await message.react('✅').catch(() => {});
      await pingStaff(message, {
        title: '📨 Preuve de paiement envoyée',
        description: `${message.author} a envoyé une preuve de paiement dans ce ticket. **Merci de vérifier sur PayPal et de valider la commande** (dashboard admin ou marquage manuel).`,
        color: GOLD_BOOST,
      });
      logAction(message.guild, 'PAYMENT_PROOF_SUBMITTED', { Salon: `${message.channel}`, Client: `${message.author} (${message.author.id})` });
      return;
    }
  }

  // Phase 1 : detection de mots-cles (une seule fois par intention et par ticket).
  const normalized = normalize(message.content);
  if (!normalized) return;

  for (const intent of INTENTS) {
    if (state.triggered?.[intent.id]) continue;
    if (intent.match(normalized)) {
      markTriggered(message.channel.id, intent.id);
      await intent.handle(message).catch((err) => console.error(`Erreur intent ${intent.id}:`, err));
      break; // un seul intent declenche par message, evite le flood de reponses
    }
  }
}

module.exports = { handleTicketAutomation, INTENTS, PAYMENT_PATTERNS, PROBLEM_CATEGORIES };
