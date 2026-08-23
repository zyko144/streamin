const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { brandedEmbed, GOLD_BOOST, LOGO_URL } = require('./theme');
const { buildTicketPanelRow } = require('./ticketPanel');
const { buildVerifyRow } = require('./verify');
const { readDatabase, writeDatabase } = require('./db');

function alreadyPosted(guildId, key) {
  const db = readDatabase();
  return Boolean(db.setupPosted?.[guildId]?.[key]);
}
function markPosted(guildId, key) {
  const db = readDatabase();
  db.setupPosted = db.setupPosted || {};
  db.setupPosted[guildId] = db.setupPosted[guildId] || {};
  db.setupPosted[guildId][key] = true;
  writeDatabase(db);
}

async function findOrCreateRole(guild, name, options) {
  const existing = guild.roles.cache.find((r) => r.name === name);
  if (existing) return existing;
  return guild.roles.create({ name, ...options });
}

async function findOrCreateCategory(guild, name) {
  const existing = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === name);
  if (existing) return existing;
  return guild.channels.create({ name, type: ChannelType.GuildCategory });
}

async function findOrCreateChannel(guild, name, { parent, overwrites, presetId } = {}) {
  if (presetId) {
    const preset = guild.channels.cache.get(presetId);
    if (preset) {
      if (parent && preset.parentId !== parent.id) await preset.setParent(parent.id, { lockPermissions: false }).catch(() => {});
      return preset;
    }
  }
  const existing = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === name && (!parent || c.parentId === parent.id));
  if (existing) return existing;
  return guild.channels.create({ name, type: ChannelType.GuildText, parent: parent?.id, permissionOverwrites: overwrites });
}

/**
 * Configuration complete et idempotente du serveur Vercell.
 * Rejouable sans creer de doublons (recherche par nom avant creation,
 * messages-cles postes une seule fois via un flag en base).
 *
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<{ summary: string[], webhookUrl: string|null, staffRole, boosterRole, verifiedRole, channels: object }>}
 */
async function runSetup(guild) {
  const everyone = guild.roles.everyone.id;
  const me = guild.members.me.id;
  const summary = [];

  // --- Roles ---
  const staffRole = await findOrCreateRole(guild, 'Staff', {
    color: 0xffffff,
    hoist: true,
    permissions: [
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.KickMembers,
    ],
  });
  summary.push(`✅ Rôle ${staffRole}`);

  const verifiedRole = await findOrCreateRole(guild, '✅ Client Vérifié', { color: 0xd4d4d4, hoist: false, permissions: [] });
  summary.push(`✅ Rôle ${verifiedRole}`);

  const boosterRole = await findOrCreateRole(guild, '💎 Booster VIP', { color: GOLD_BOOST, hoist: true, permissions: [] });
  summary.push(`✅ Rôle ${boosterRole}`);

  const rewardRole = await findOrCreateRole(guild, '🎁 Récompense Boost', { color: 0x8a8a8a, hoist: true, permissions: [] });
  summary.push(`✅ Rôle ${rewardRole}`);

  const readOnly = (extra = []) => [
    { id: everyone, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
    { id: staffRole.id, allow: [PermissionFlagsBits.SendMessages] },
    { id: me, allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageWebhooks] },
    ...extra,
  ];
  const staffOnly = () => [
    { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
    { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
    { id: me, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageWebhooks] },
  ];

  // --- 📌 INFOS ---
  const infosCat = await findOrCreateCategory(guild, '📌 INFOS');
  const bienvenue = await findOrCreateChannel(guild, '👋・bienvenue', { parent: infosCat, overwrites: readOnly() });
  const annonces = await findOrCreateChannel(guild, '📢・annonces', { parent: infosCat, overwrites: readOnly() });
  const reglement = await findOrCreateChannel(guild, '📜・règlement', { parent: infosCat, overwrites: readOnly() });
  const faq = await findOrCreateChannel(guild, '❓・faq', { parent: infosCat, overwrites: readOnly() });
  summary.push(`✅ Catégorie ${infosCat} (${bienvenue}, ${annonces}, ${reglement}, ${faq})`);

  // --- 🛒 BOUTIQUE ---
  const shopCat = await findOrCreateCategory(guild, '🛒 BOUTIQUE');
  const produits = await findOrCreateChannel(guild, '🛍️・produits', { parent: shopCat, overwrites: readOnly() });
  const ordersChannel = await findOrCreateChannel(guild, '📦・commandes', {
    parent: shopCat,
    presetId: process.env.ORDERS_CHANNEL_ID || undefined,
    overwrites: staffOnly(),
  });
  const avisChannel = await findOrCreateChannel(guild, '⭐・avis', {
    parent: shopCat,
    overwrites: readOnly(),
  });
  summary.push(`✅ Catégorie ${shopCat} (${produits}, ${ordersChannel}, ${avisChannel})`);

  // --- 💬 COMMUNAUTÉ ---
  const communityCat = await findOrCreateCategory(guild, '💬 COMMUNAUTÉ');
  const general = await findOrCreateChannel(guild, '💬・général', {
    parent: communityCat,
    overwrites: [
      { id: everyone, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: me, allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
    ],
  });
  summary.push(`✅ Catégorie ${communityCat} (${general})`);

  // --- 🎫 SUPPORT ---
  const supportCat = await findOrCreateCategory(guild, '🎫 SUPPORT');
  const ouvrirTicket = await findOrCreateChannel(guild, '🎫・ouvrir-un-ticket', { parent: supportCat, overwrites: readOnly() });
  summary.push(`✅ Catégorie ${supportCat} (${ouvrirTicket})`);

  if (!alreadyPosted(guild.id, 'ticketPanel')) {
    await ouvrirTicket.send({
      embeds: [
        brandedEmbed({
          title: '🎫 Support Vercell',
          description: "Besoin d'aide, d'une livraison de commande ou d'une question ? Clique sur le bouton pour ouvrir un ticket privé avec le staff.",
          image: LOGO_URL,
        }),
      ],
      components: [buildTicketPanelRow()],
    });
    markPosted(guild.id, 'ticketPanel');
  }

  // --- 🚀 BOOST ---
  const boostCat = await findOrCreateCategory(guild, '🚀 BOOST');
  const boostChannel = await findOrCreateChannel(guild, '🚀・boost-remerciements', {
    parent: boostCat,
    overwrites: [
      { id: everyone, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
      { id: me, allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
    ],
  });
  summary.push(`✅ Catégorie ${boostCat} (${boostChannel})`);

  if (!alreadyPosted(guild.id, 'boostInfo')) {
    const infoMsg = await boostChannel.send({
      embeds: [
        brandedEmbed({
          title: '🚀 Récompenses de boost',
          description: `Merci de soutenir Vercell ! Boost ce serveur pour débloquer ${boosterRole} et des avantages exclusifs.\n\n🎁 **2 boosts cumulés = 1 compte Steam au choix OU 1 compte streaming au choix, gratuit !**\n\nDès que tu atteins le palier, un ticket cadeau s'ouvre automatiquement pour que tu choisisses ton compte.`,
          color: GOLD_BOOST,
          image: LOGO_URL,
        }),
      ],
    });
    infoMsg.pin().catch(() => {});
    markPosted(guild.id, 'boostInfo');
  }

  // --- 🔒 STAFF ---
  const staffCat = await findOrCreateCategory(guild, '🔒 STAFF');
  await staffCat.permissionOverwrites.set(staffOnly()).catch(() => {});
  const logsChannel = await findOrCreateChannel(guild, '📝・logs', { parent: staffCat, overwrites: staffOnly() });
  const verifChannel = await findOrCreateChannel(guild, '✅・verif-ppl', { parent: staffCat, overwrites: staffOnly() });
  summary.push(`✅ Catégorie ${staffCat} (${logsChannel}, ${verifChannel})`);

  // --- Règlement + verification ---
  if (!alreadyPosted(guild.id, 'reglement')) {
    await reglement.send({
      embeds: [
        brandedEmbed({
          title: '📜 Règlement Vercell',
          description: [
            '**1.** Respecte les autres membres, pas de propos haineux, discriminatoires ou NSFW.',
            "**2.** Pas de spam, pas de pub non autorisée, pas de scam.",
            '**3.** Les demandes de commande/support se font uniquement via un ticket (🎫・ouvrir-un-ticket).',
            "**4.** Le staff a le dernier mot sur les litiges de commande.",
            '**5.** Toute triche sur le système de boost entraîne un retrait du rôle et une exclusion.',
            '',
            'Clique sur ✅ **Je confirme avoir lu** pour débloquer le reste du serveur.',
          ].join('\n'),
        }),
      ],
      components: [buildVerifyRow()],
    });
    markPosted(guild.id, 'reglement');
  }

  if (!alreadyPosted(guild.id, 'faq')) {
    await faq.send({
      embeds: [
        brandedEmbed({
          title: '❓ FAQ',
          description: [
            '**Comment commander ?** Sur le site, ajoute au panier puis paye via PayPal.',
            '**Comment récupérer ma commande ?** Ouvre un ticket dans 🎫・ouvrir-un-ticket avec ta preuve de paiement.',
            "**Combien de temps pour la livraison ?** Généralement quelques minutes après confirmation du paiement.",
            '**Un problème avec ma commande ?** Ouvre un ticket, le staff te répond rapidement.',
          ].join('\n'),
        }),
      ],
    });
    markPosted(guild.id, 'faq');
  }

  if (!alreadyPosted(guild.id, 'produits')) {
    await produits.send({
      embeds: [
        brandedEmbed({
          title: '🛍️ Nos produits',
          description: 'Comptes streaming, gaming, VPN et Steam premium — livraison instantanée.\n\n🔗 Boutique complète : https://shop-plus-nu.vercel.app/',
          image: LOGO_URL,
        }),
      ],
    });
    markPosted(guild.id, 'produits');
  }

  // --- Webhooks (pour que le site poste directement, sans repasser par le bot) ---
  async function getOrCreateWebhook(channel, name) {
    try {
      const existing = await channel.fetchWebhooks();
      let webhook = existing.find((w) => w.name === name);
      if (!webhook) webhook = await channel.createWebhook({ name });
      return webhook.url;
    } catch {
      // Permission "Gerer les webhooks" manquante, laisse null : le setup indique la marche a suivre manuelle.
      return null;
    }
  }
  const ordersWebhookUrl = await getOrCreateWebhook(ordersChannel, 'Vercell Commandes');
  const avisWebhookUrl = await getOrCreateWebhook(avisChannel, 'Vercell Avis');
  const annoncesWebhookUrl = await getOrCreateWebhook(annonces, 'Vercell Annonces');

  // --- Message de bienvenue générique (le message d'arrivée par membre est gere par events/guildMemberAdd) ---
  if (!alreadyPosted(guild.id, 'welcome')) {
    await bienvenue.send({
      embeds: [
        brandedEmbed({
          title: 'Bienvenue sur Vercell 🎬',
          description: `Comptes streaming, gaming et VPN premium, livraison instantanée.\n\n🛒 Boutique : https://shop-plus-nu.vercel.app/\n🎫 Support : ${ouvrirTicket}\n🚀 Deviens ${boosterRole} en boostant le serveur pour des récompenses exclusives !\n\nChaque nouvel arrivant sera annoncé ici automatiquement 👋`,
          image: LOGO_URL,
        }),
      ],
    });
    markPosted(guild.id, 'welcome');
  }

  return {
    summary,
    ordersWebhookUrl,
    avisWebhookUrl,
    annoncesWebhookUrl,
    staffRole,
    boosterRole,
    verifiedRole,
    channels: { bienvenue, annonces, reglement, faq, produits, ordersChannel, avisChannel, general, ouvrirTicket, boostChannel, logsChannel },
  };
}

module.exports = { runSetup };
