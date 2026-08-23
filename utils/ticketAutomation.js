// Detection de phrases dans les tickets pour automatiser les reponses les
// plus courantes du support. Base sur des mots-cles (pas d'IA externe, pas
// de cle API a fournir) : suffisant pour les intentions frequentes d'une
// boutique (paiement, delai, remboursement, prix). Facile a etendre : ajoute
// une entree a INTENTS.

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

/**
 * Intentions detectees dans un message de ticket. Chacune ne se declenche
 * qu'une fois par ticket (evite le spam si le client repete le mot-cle).
 */
const INTENTS = [
  {
    id: 'payment_confirmed',
    match: (t) => /\b(j.?ai|jai)\s*(deja\s*)?paye\b/.test(t) || /\bc.?est\s*paye\b/.test(t) || /\bpaiement\s*(effectue|envoye|fait)\b/.test(t) || /^paye[!. ]*$/.test(t.trim()),
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
  {
    id: 'refund_or_problem',
    match: (t) => /rembours/.test(t) || /(ne\s*)?marche\s*pas/.test(t) || /(ne\s*)?fonctionne\s*pas/.test(t) || /compte\s*(invalide|banni|bloque)/.test(t) || /\bprobleme\b/.test(t) || /\barnaque\b/.test(t),
    handle: async (message) => {
      const staffRole = message.guild.roles.cache.find((r) => r.name === 'Staff');
      await message.reply({
        embeds: [
          brandedEmbed({
            title: '⚠️ Signalement pris en compte',
            description: "Le staff a été notifié. Peux-tu préciser : numéro de commande, produit concerné, et si possible une capture d'écran du problème ?",
            color: RED_ALERT,
          }),
        ],
      });
      await message.channel.send({
        content: staffRole ? `${staffRole}` : undefined,
        embeds: [brandedEmbed({ title: '🚨 Problème signalé', description: `${message.author} a signalé un souci dans ce ticket, merci de vérifier.`, color: RED_ALERT })],
      });
      logAction(message.guild, 'TICKET_ISSUE_FLAGGED', { Salon: `${message.channel}`, Client: `${message.author} (${message.author.id})` });
    },
  },
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

  const member = message.member;
  const isStaff = member?.roles.cache.some((r) => r.name === 'Staff') ?? false;
  if (isStaff) return; // n'automatise pas sur les messages du staff lui-meme

  const state = getState(message.channel.id);

  // Phase 2 : en attente d'une preuve de paiement -> une piece jointe image la valide.
  if (state.awaitingProof && !state.proofReceived && message.attachments.size > 0) {
    const hasImage = [...message.attachments.values()].some((a) => (a.contentType || '').startsWith('image/'));
    if (hasImage) {
      setState(message.channel.id, { awaitingProof: false, proofReceived: true });
      await message.react('✅').catch(() => {});
      const staffRole = message.guild.roles.cache.find((r) => r.name === 'Staff');
      await message.channel.send({
        content: staffRole ? `${staffRole}` : undefined,
        embeds: [
          brandedEmbed({
            title: '📨 Preuve de paiement envoyée',
            description: `${message.author} a envoyé une preuve de paiement dans ce ticket. **Merci de vérifier sur PayPal et de valider la commande** (dashboard admin ou marquage manuel).`,
          }),
        ],
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

module.exports = { handleTicketAutomation, INTENTS };
