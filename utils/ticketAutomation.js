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

/**
 * Previent le staff en MP (pas dans le salon, pour ne pas polluer le
 * ticket) : un message par membre ayant le role Staff, + toujours le
 * proprietaire actuel du serveur (meme s'il n'a pas/plus le role Staff,
 * ex: transfert de propriete recent) — avec le lien direct vers le salon
 * et le type de probleme detecte.
 */
async function dmStaff(message, { title, description }) {
  await message.guild.members.fetch().catch(() => {});

  const staffRole = message.guild.roles.cache.find((r) => r.name === 'Staff');
  const recipients = new Map();
  for (const member of staffRole?.members.values() ?? []) recipients.set(member.id, member);
  const owner = await message.guild.fetchOwner().catch(() => null);
  if (owner) recipients.set(owner.id, owner);
  recipients.delete(message.author.id); // ne pas se DM soi-meme (proprietaire du ticket qui est aussi staff)

  const ticketUrl = `https://discord.com/channels/${message.guild.id}/${message.channel.id}`;
  const embed = brandedEmbed({
    title,
    description: `${description}\n\n🔗 [Aller au ticket](${ticketUrl})`,
    color: RED_ALERT,
  });

  let successCount = 0;
  for (const member of recipients.values()) {
    try {
      await member.send({ embeds: [embed] });
      successCount++;
    } catch (err) {
      // Cause la plus frequente : le destinataire a desactive "Autoriser les
      // messages prives des membres de ce serveur" dans ses parametres de
      // confidentialite Discord (erreur 50007). On log pour pouvoir
      // diagnostiquer depuis les logs Render.
      console.error(`⚠️  Impossible de DM ${member.user.tag} (${member.id}):`, err.message);
    }
  }

  // Filet de securite : si AUCUN MP n'est parti (tout le monde a les MPs
  // fermes, ou aucun destinataire trouve), on poste quand meme dans le
  // salon de logs staff-only pour ne pas perdre l'alerte.
  if (successCount === 0) {
    const logsChannel = message.guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === '📝・logs');
    if (logsChannel?.isTextBased()) {
      await logsChannel
        .send({ content: '⚠️ Aucun MP n\'a pu être envoyé (MPs fermés ?) — alerte de secours :', embeds: [embed] })
        .catch((err) => console.error('⚠️  Impossible de poster le filet de securite dans #logs:', err.message));
    }
  }
}

/**
 * Salon fixe et fiable en complement du MP (les MP dependent des
 * parametres de confidentialite de chaque membre, ce salon marche
 * toujours). Ping @Staff a chaque preuve de paiement recue.
 */
async function pingVerifChannel(message) {
  const verifChannel = message.guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === '✅・verif-ppl');
  if (!verifChannel?.isTextBased()) return;
  const staffRole = message.guild.roles.cache.find((r) => r.name === 'Staff');
  const ticketUrl = `https://discord.com/channels/${message.guild.id}/${message.channel.id}`;
  await verifChannel
    .send({
      content: staffRole ? `${staffRole}` : undefined,
      embeds: [
        brandedEmbed({
          title: '💳 Preuve de paiement à vérifier',
          description: `${message.author} (${message.author.tag}) a envoyé une preuve de paiement.\n\n🔗 [Aller au ticket](${ticketUrl})`,
          color: GOLD_BOOST,
        }),
      ],
    })
    .catch((err) => console.error('⚠️  Impossible de poster dans #verif-ppl:', err.message));
}

// --- "J'ai payé" : de nombreuses façons de le dire (regex sur texte normalisé : minuscules, sans accents) ---
const PAYMENT_PATTERNS = [
  /\b(j.?ai|jai)\s*(deja\s*)?paye[r]?\b/, // j'ai payé / j'ai déjà payé / j'ai payer (faute courante)
  /\bc.?est\s*paye\b/, // c'est payé
  /\bpaiement\s*(effectue|envoye|fait|ok|recu|termine|valide)\b/, // paiement effectué/envoyé/fait/ok/reçu/terminé/validé
  /^paye\s*[!.?]*$/, // "payé" tout seul
  /^(c.?est\s*)?regle\s*[!.?]*$/, // "réglé" / "c'est réglé"
  /\bj.?ai\s*regle\b/, // j'ai réglé
  /\b(j.?ai\s*envoye|envoye)\s*l.?argent\b/, // j'ai envoyé l'argent
  /\bargent\s*envoye\b/, // argent envoyé
  /\bj.?ai\s*fait\s*le\s*virement\b/, // j'ai fait le virement
  /\bvirement\s*(effectue|fait|envoye)\b/, // virement effectué/fait/envoyé
  /\bj.?ai\s*transfere\s*l.?argent\b/, // j'ai transféré l'argent
  /\btransfert\s*(effectue|fait)\b/, // transfert effectué
  /\bpaypal\s*(ok|envoye|fait|c.?est\s*bon|recu)\b/, // paypal ok/envoyé/fait/reçu
  /\bvoila\s*(c.?est\s*)?(j.?ai\s*)?paye\b/, // voilà c'est payé / voilà j'ai payé
  /\bc.?est\s*bon\s*(j.?ai|c.?est)?\s*paye?\b/, // c'est bon j'ai payé
  /\bj.?ai\s*fini\s*(de\s*)?payer\b/, // j'ai fini de payer
  /\bcommande\s*payee\b/, // commande payée
  /\bj.?ai\s*paye\s*la\s*commande\b/, // j'ai payé la commande
  /\bj.?ai\s*mis\s*l.?argent\b/, // j'ai mis l'argent
  /\b(as[\s-]*tu|avez[\s-]*vous)\s*recu\s*(le\s*)?paiement\b/, // as-tu reçu le paiement
  /\bpaiement\s*recu\s*de\s*mon\s*cote\b/, // paiement reçu de mon côté
  /\bmoney\s*sent\b/, // au cas où en anglais
  /\bpayment\s*(sent|done)\b/, // en anglais
  /\bje\s*viens\s*de\s*payer\b/, // je viens de payer
  /\bje\s*viens\s*d.?envoyer\s*(l.?argent|le\s*paiement)\b/, // je viens d'envoyer l'argent/le paiement
  /\bpaiement\s*envoye\s*de\s*mon\s*cote\b/, // paiement envoyé de mon côté
  /\bc.?est\s*envoye\b/, // c'est envoyé
  /\benvoye\s*!*$/, // "envoyé !" tout seul
  /\bpaye\s*avec\s*paypal\b/, // payé avec paypal
  /\d+[,.]?\d*\s*(euro|eur|€).{0,10}envoye/, // montant + envoyé (ex "5€ envoyés")
  /\btu\s*peux\s*(check|verifier|regarder)\s*(le\s*)?paypal\b/, // tu peux vérifier paypal
  /\bregarde\s*(ton\s*)?paypal\b/, // regarde ton paypal
];

// --- Categories de problemes, chacune avec son propre message client + mots-cles ---
const PROBLEM_CATEGORIES = [
  {
    id: 'refund',
    label: '💸 Demande de remboursement',
    reply: "Ta demande de remboursement a été transmise au staff en message privé. Pour accélérer le traitement, prépare le numéro de commande et la raison souhaitée.",
    patterns: [/rembours/, /je\s*veux\s*(etre\s*)?rembourse/, /rendre\s*mon\s*argent/, /recuperer\s*mon\s*argent/, /je\s*veux\s*etre\s*rembourse/],
  },
  {
    id: 'account_not_working',
    label: '🔑 Compte ne fonctionne pas',
    reply: "Le staff a été notifié en message privé et va vérifier ton compte. En attendant, vérifie bien les identifiants (espaces/majuscules) et ta connexion internet.",
    patterns: [/(ne\s*)?marche\s*pas/, /(ne\s*)?fonctionne\s*pas/, /mot\s*de\s*passe\s*incorrect/, /arrive\s*pas\s*a\s*me\s*connecter/, /login\s*(ne\s*)?marche\s*pas/, /identifiants?\s*(invalides?|faux|incorrects?)/, /impossible\s*de\s*me\s*connecter/, /connexion\s*(refusee|impossible)/],
  },
  {
    id: 'account_taken',
    label: '👥 Compte déjà utilisé par quelqu\'un',
    reply: "C'est noté, le staff a été notifié en message privé et va vérifier/sécuriser l'accès à ton compte. Merci de patienter.",
    patterns: [/compte\s*deja\s*pris/, /quelqu.?un\s*d.?autre\s*est\s*connecte/, /compte\s*utilise\s*par\s*quelqu.?un/, /quelqu.?un\s*d.?autre\s*a\s*mon\s*compte/, /partage\s*avec\s*quelqu.?un/],
  },
  {
    id: 'account_banned',
    label: '🚫 Compte banni/suspendu',
    reply: "Le staff a été notifié en message privé et va regarder pourquoi le compte est banni/suspendu, avec une solution (remplacement ou remboursement selon le cas).",
    patterns: [/compte.{0,15}banni/, /compte.{0,15}suspendu/, /compte.{0,15}bloque/, /compte.{0,15}desactive/, /compte.{0,15}ferme\b/],
  },
  {
    id: 'wrong_product',
    label: '📦 Mauvais produit reçu',
    reply: "Merci de préciser le produit commandé vs celui reçu — le staff a été notifié en message privé et va corriger ça rapidement.",
    patterns: [/pas\s*le\s*bon\s*produit/, /erreur\s*de\s*commande/, /c.?est\s*pas\s*ce\s*que\s*j.?ai\s*commande/, /c.?est\s*pas\s*le\s*bon\s*(jeu|compte)/, /vous\s*vous\s*etes\s*trompes/],
  },
  {
    id: 'no_delivery',
    label: '📭 Rien reçu',
    reply: "Le staff a été notifié en message privé et va vérifier l'état de ta commande pour te livrer au plus vite.",
    patterns: [/j.?ai\s*rien\s*recu/, /toujours\s*pas\s*livre/, /pas\s*de\s*compte\s*recu/, /j.?attends\s*toujours/, /aucune\s*livraison/, /je\s*n.?ai\s*pas\s*recu\s*(mon|ma|le|la)/],
  },
  {
    id: 'scam_accusation',
    label: '⚠️ Accusation d\'arnaque',
    reply: "On comprend ta frustration. streamIN livre toutes ses commandes normalement, un membre du staff a été notifié en priorité en message privé pour regarder ton cas.",
    patterns: [/\barnaqu/, /\bscam\b/, /c.?est\s*du\s*vol/, /vous\s*etes\s*des\s*voleurs/, /vous\s*volez\s*(les\s*gens|mon\s*argent)/],
  },
  {
    id: 'no_staff_response',
    label: '⏳ Pas de réponse du staff',
    reply: "Désolé pour l'attente — un membre du staff vient d'être notifié en priorité en message privé et va te répondre rapidement.",
    patterns: [/personne\s*ne\s*repond/, /ca\s*fait\s*longtemps\s*que\s*j.?attends/, /quelqu.?un\s*peut\s*m.?aider/, /y\s*a\s*quelqu.?un/, /vous\s*etes\s*la\s*\?/, /reponse\s*svp/],
  },
  {
    id: 'billing_dispute',
    label: '🧾 Litige de facturation',
    reply: "Le staff a été notifié en message privé et va vérifier le montant prélevé et corriger toute erreur de facturation.",
    patterns: [/facture\s*erronee/, /montant\s*incorrect/, /on\s*m.?a\s*trop\s*pris/, /double\s*paiement/, /paye\s*deux\s*fois/, /preleve\s*deux\s*fois/, /mauvais\s*montant/],
  },
  {
    id: 'password_changed',
    label: '🔒 Mot de passe changé par l\'ancien propriétaire',
    reply: "Le staff a été notifié en message privé et va vérifier ça, avec un compte de remplacement si nécessaire.",
    patterns: [/mot\s*de\s*passe\s*a\s*change/, /ancien\s*proprietaire\s*a\s*repris/, /je\s*n.?ai\s*plus\s*acces/, /mot\s*de\s*passe\s*ne\s*marche\s*plus/],
  },
  {
    id: 'twofa_issue',
    label: '📱 Problème de double authentification',
    reply: "Le staff a été notifié en message privé et va t'aider à gérer la double authentification du compte.",
    patterns: [/\b2fa\b/, /double\s*authentification/, /code\s*de\s*verification/, /authentification\s*a\s*deux\s*facteurs/, /demande\s*un\s*code/],
  },
  {
    id: 'region_lock',
    label: '🌍 Blocage régional',
    reply: "Le staff a été notifié en message privé et va vérifier la compatibilité régionale du compte.",
    patterns: [/region\s*bloquee/, /pas\s*disponible\s*dans\s*mon\s*pays/, /erreur\s*de\s*region/, /region\s*non\s*supportee/],
  },
  {
    id: 'not_as_described',
    label: '📋 Produit différent de la description',
    reply: "Merci de préciser la différence constatée — le staff a été notifié en message privé et va vérifier.",
    patterns: [/pas\s*ce\s*qui\s*etait\s*decrit/, /produit\s*different\s*de\s*l.?annonce/, /correspond\s*pas\s*a\s*la\s*description/],
  },
  {
    id: 'cancel_order',
    label: '❌ Demande d\'annulation',
    reply: "Ta demande d'annulation a été transmise au staff en message privé. Si le paiement a déjà été effectué, un remboursement pourra être étudié.",
    patterns: [/annuler\s*ma\s*commande/, /je\s*veux\s*annuler/, /\bannulation\b/, /finalement\s*je\s*veux\s*pas/],
  },
  {
    id: 'modify_order',
    label: '✏️ Demande de modification de commande',
    reply: "Le staff a été notifié en message privé pour ajuster ta commande, précise le produit voulu à la place.",
    patterns: [/changer\s*ma\s*commande/, /modifier\s*ma\s*commande/, /je\s*veux\s*changer\s*de\s*produit/, /je\s*veux\s*plutot/],
  },
  {
    id: 'website_bug',
    label: '🐛 Bug signalé sur le site',
    reply: "Merci du signalement ! Le staff a été notifié en message privé et va regarder le bug au plus vite.",
    patterns: [/bug\s*sur\s*le\s*site/, /erreur\s*sur\s*le\s*site/, /le\s*site\s*(ne\s*)?marche\s*pas/, /probleme\s*technique/, /le\s*site\s*plante/, /le\s*site\s*bug/],
  },
  {
    id: 'discord_role_missing',
    label: '🎭 Rôle Discord manquant',
    reply: "Le staff a été notifié en message privé et va vérifier/attribuer le bon rôle rapidement.",
    patterns: [/j.?ai\s*pas\s*mon\s*role/, /role\s*premium\s*pas\s*applique/, /je\s*suis\s*pas\s*verifie/, /pas\s*le\s*role\s*booster/],
  },
  {
    id: 'boost_reward_missing',
    label: '💎 Récompense de boost non reçue',
    reply: "Le staff a été notifié en message privé et va vérifier tes boosts cumulés pour te livrer ta récompense (compte Steam ou streaming au choix).",
    patterns: [/pas\s*recu\s*ma\s*recompense/, /recompense\s*boost\s*pas\s*recue/, /j.?ai\s*boost.{0,10}rien\s*recu/],
  },
  {
    id: 'slow_delivery',
    label: '🐌 Livraison trop lente',
    reply: "Désolé pour le délai — le staff a été notifié en priorité en message privé pour accélérer ta livraison.",
    patterns: [/(c.?est|tres)\s*long/, /ca\s*prend\s*du\s*temps/, /toujours\s*pas\s*recu\s*apres/, /(depuis|ca\s*fait)\s*(des\s*)?heures?/],
  },
  {
    id: 'general_complaint',
    label: '😠 Insatisfaction générale',
    reply: "On est désolé que ton expérience ne soit pas à la hauteur. Le staff a été notifié en message privé et va te recontacter pour trouver une solution.",
    patterns: [/pas\s*content/, /insatisfait/, /tres\s*decu/, /mauvaise\s*experience/, /je\s*suis\s*enerve/, /c.?est\s*n.?importe\s*quoi/],
  },
];

const problemHandler = (category) => async (message) => {
  await message.reply({
    embeds: [brandedEmbed({ title: `⚠️ ${category.label}`, description: category.reply, color: RED_ALERT })],
  });
  await dmStaff(message, {
    title: `🚨 ${category.label}`,
    description: `${message.author} (${message.author.tag}) a signalé ce problème dans son ticket.`,
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
              'Dès que la preuve est reçue, le staff est notifié automatiquement en message privé pour vérifier et valider ta commande.',
              '',
              "⚠️ La validation n'est pas instantanée pour l'instant : c'est un membre du staff qui vérifie manuellement, ça peut prendre un peu de temps selon sa disponibilité.",
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
    match: (t) => /combien\s*de\s*temps/.test(t) || /\bdelai\b/.test(t) || /(quand|c.?est\s*quand).*(recevoir|recois|livr)/.test(t) || /c.?est\s*rapide\s*\?/.test(t),
    handle: async (message) => {
      await message.reply({
        embeds: [
          brandedEmbed({
            title: '⏱️ Délai de livraison',
            description: "⚠️ **Les commandes ne sont pas encore instantanées pour l'instant** : chaque commande est vérifiée et livrée manuellement par un membre du staff. En général ça se joue en quelques minutes à quelques heures selon sa disponibilité — merci de ta patience, on s'occupe de toi dès que possible !",
          }),
        ],
      });
    },
  },
  {
    id: 'how_to_pay',
    match: (t) => /comment\s*(je\s*)?(pay|paie)/.test(t) || /quel\s*(est\s*le\s*)?prix/.test(t) || /combien\s*(ca\s*)?coute/.test(t) || /c.?est\s*combien/.test(t),
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
      await message.reply({
        embeds: [
          brandedEmbed({
            title: '✅ Preuve reçue',
            description: "Merci ! On previent le staff pour qu'il vérifie ta commande. Un membre de l'équipe va la valider dès que possible.",
            color: GOLD_BOOST,
          }),
        ],
      });
      await dmStaff(message, {
        title: '📨 Preuve de paiement envoyée',
        description: `${message.author} (${message.author.tag}) a envoyé une preuve de paiement dans son ticket. **Merci de vérifier sur PayPal et de valider la commande** (dashboard admin ou marquage manuel).`,
      });
      await pingVerifChannel(message);
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
