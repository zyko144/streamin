const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { isBotAdmin } = require('../utils/permissions');
const { brandedEmbed, RED, GOLD_BOOST, LOGO_URL } = require('../utils/theme');
const { buildTicketPanelRow } = require('../utils/ticketPanel');
const { readDatabase, writeDatabase } = require('../utils/db');

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

module.exports = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription("Configure (ou reconfigure) le serveur streamIN : roles, salons, permissions, panneau de tickets.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),
];

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

module.exports.execute = async (interaction) => {
  if (interaction.commandName !== 'setup') return;

  if (!isBotAdmin(interaction)) {
    return interaction.reply({
      embeds: [brandedEmbed({ title: '❌ Accès refusé', description: "Seul le propriétaire du serveur ou un administrateur peut lancer `/setup`.", color: RED })],
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });
  const { guild } = interaction;
  const everyone = guild.roles.everyone.id;
  const me = guild.members.me.id;
  const summary = [];

  try {
    // --- Roles ---
    const staffRole = await findOrCreateRole(guild, 'Staff', {
      color: 0x3b82f6,
      hoist: true,
      permissions: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.KickMembers],
    });
    summary.push(`✅ Rôle ${staffRole}`);

    const clientRole = await findOrCreateRole(guild, '✅ Client Vérifié', { color: 0x22c55e, hoist: false, permissions: [] });
    summary.push(`✅ Rôle ${clientRole}`);

    const boosterRole = await findOrCreateRole(guild, '💎 Booster VIP', { color: GOLD_BOOST, hoist: true, permissions: [] });
    summary.push(`✅ Rôle ${boosterRole}`);

    // --- Categorie INFOS (lecture seule pour tout le monde) ---
    const infosCat = await findOrCreateCategory(guild, '📢 INFOS');
    const readOnlyOverwrites = [
      { id: everyone, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
      { id: staffRole.id, allow: [PermissionFlagsBits.SendMessages] },
      { id: me, allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageWebhooks] },
    ];
    const reglement = await findOrCreateChannel(guild, 'règlement', { parent: infosCat, overwrites: readOnlyOverwrites });
    const annonces = await findOrCreateChannel(guild, 'annonces', { parent: infosCat, overwrites: readOnlyOverwrites });
    const bienvenue = await findOrCreateChannel(guild, 'bienvenue', { parent: infosCat, overwrites: readOnlyOverwrites });
    summary.push(`✅ Catégorie ${infosCat} (${reglement}, ${annonces}, ${bienvenue})`);

    // --- Categorie SUPPORT (tickets) ---
    const supportCat = await findOrCreateCategory(guild, '🎫 SUPPORT');
    const ouvrirTicket = await findOrCreateChannel(guild, 'ouvrir-un-ticket', { parent: supportCat, overwrites: readOnlyOverwrites });
    const ticketLogs = await findOrCreateChannel(guild, 'logs-tickets', {
      parent: supportCat,
      overwrites: [
        { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
        { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
        { id: me, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ],
    });
    summary.push(`✅ Catégorie ${supportCat} (${ouvrirTicket}, ${ticketLogs})`);

    if (!alreadyPosted(guild.id, 'ticketPanel')) {
      await ouvrirTicket.send({
        embeds: [
          brandedEmbed({
            title: '🎫 Support streamIN',
            description: "Besoin d'aide, d'une livraison de commande ou d'une question ? Clique sur le bouton ci-dessous pour ouvrir un ticket privé avec le staff.",
            image: LOGO_URL,
          }),
        ],
        components: [buildTicketPanelRow()],
      });
      markPosted(guild.id, 'ticketPanel');
    }

    // --- Categorie BOOST ---
    const boostCat = await findOrCreateCategory(guild, '🚀 BOOST');
    const boostChannel = await findOrCreateChannel(guild, 'boost-remerciements', {
      parent: boostCat,
      overwrites: [
        { id: everyone, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
        { id: me, allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
      ],
    });
    summary.push(`✅ Catégorie ${boostCat} (${boostChannel})`);

    // --- Categorie BOUTIQUE (notifications de commandes) ---
    const shopCat = await findOrCreateCategory(guild, '🛒 BOUTIQUE');
    const ordersChannel = await findOrCreateChannel(guild, 'commandes', {
      parent: shopCat,
      presetId: process.env.ORDERS_CHANNEL_ID || undefined,
      overwrites: [
        { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
        { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
        { id: me, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageWebhooks] },
      ],
    });
    summary.push(`✅ Catégorie ${shopCat} (${ordersChannel})`);

    // Webhook pour que le SITE puisse poster les notifications de commandes directement.
    let webhookLine = '';
    try {
      const existingWebhooks = await ordersChannel.fetchWebhooks();
      let webhook = existingWebhooks.find((w) => w.name === 'streamIN Commandes');
      if (!webhook) {
        webhook = await ordersChannel.createWebhook({ name: 'streamIN Commandes' });
      }
      webhookLine = `\n\n🔗 **Webhook commandes** (à mettre dans \`DISCORD_ORDERS_WEBHOOK_URL\` sur Vercel) :\n||${webhook.url}||`;
    } catch (e) {
      webhookLine = `\n\n⚠️ Impossible de créer le webhook automatiquement (permission "Gérer les webhooks" manquante ?). Crée-le à la main dans ${ordersChannel} → Paramètres → Intégrations → Webhooks.`;
    }

    // --- Message de bienvenue ---
    if (!alreadyPosted(guild.id, 'welcome')) {
      await bienvenue.send({
        embeds: [
          brandedEmbed({
            title: 'Bienvenue sur streamIN 🎬',
            description: `Comptes streaming, gaming et VPN premium, livraison instantanée.\n\n🛒 Boutique : https://shop-plus-nu.vercel.app/\n🎫 Support : ${ouvrirTicket}\n🚀 Deviens ${boosterRole} en boostant le serveur pour des récompenses exclusives !`,
            image: LOGO_URL,
          }),
        ],
      });
      markPosted(guild.id, 'welcome');
    }

    const doneEmbed = brandedEmbed({
      title: '✅ Configuration terminée',
      description: summary.join('\n') + webhookLine,
    });
    await interaction.editReply({ embeds: [doneEmbed] });
  } catch (err) {
    console.error('Erreur /setup:', err);
    await interaction.editReply({
      embeds: [brandedEmbed({ title: '❌ Erreur pendant la configuration', description: `\`${err.message}\`\n\nVérifie que le rôle du bot est assez haut dans la hiérarchie et qu'il a la permission Administrateur.`, color: RED })],
    });
  }
};
