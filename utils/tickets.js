const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { readDatabase, writeDatabase } = require('./db');
const { buildManageRow } = require('./ticketManage');
const { brandedEmbed } = require('./theme');
const { logAction } = require('./logs');

const activeTicketCreations = new Set(); // anti double-clic / spam

function sanitizeName(input) {
  return (input || 'membre')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 20) || 'membre';
}

function topicKey(userId, dedupKey) {
  return `ticket-owner:${userId}:${dedupKey}`;
}

function getOpenTicketId(guildId, userId, dedupKey = 'ticket') {
  const db = readDatabase();
  return db.openTickets?.[guildId]?.[`${userId}:${dedupKey}`] ?? null;
}

function setOpenTicketId(guildId, userId, channelId, dedupKey = 'ticket') {
  const db = readDatabase();
  db.openTickets = db.openTickets || {};
  db.openTickets[guildId] = db.openTickets[guildId] || {};
  const key = `${userId}:${dedupKey}`;
  if (channelId) db.openTickets[guildId][key] = channelId;
  else delete db.openTickets[guildId][key];
  writeDatabase(db);
}

/**
 * Source de verite: le topic du salon Discord lui-meme, plutot que db.json
 * (par processus, non partage). Se remet a jour tout seul meme si db.json
 * a ete perdu (redeploiement) ou si un deploiement en double a laisse un
 * salon orphelin.
 */
function findExistingTicketChannel(guild, userId, dedupKey = 'ticket') {
  const marker = topicKey(userId, dedupKey);
  return guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.topic === marker) ?? null;
}

/**
 * Cree un salon de ticket prive pour `member`, sous `category` si fournie.
 * Retourne le salon cree, ou null si un ticket est deja ouvert / creation en cours.
 *
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').GuildMember} member
 * @param {object} opts
 * @param {import('discord.js').CategoryChannel|null} [opts.category]
 * @param {string} [opts.namePrefix] prefixe du NOM du salon (defaut "ticket")
 * @param {string} [opts.dedupKey] cle utilisee pour la deduplication "1 ticket ouvert max"
 *   (defaut : meme valeur que namePrefix). Deux appels avec le meme dedupKey
 *   pour le meme membre ne creeront jamais 2 salons simultanement, meme si
 *   namePrefix differe (utile pour regrouper plusieurs categories de ticket
 *   client sous une seule limite "1 ticket support ouvert a la fois").
 * @param {string} [opts.staffRoleId] role staff a inviter dans le ticket
 * @param {string} [opts.title]
 * @param {string} [opts.description]
 */
async function createTicket(guild, member, opts = {}) {
  const {
    category = null,
    namePrefix = 'ticket',
    dedupKey = namePrefix,
    staffRoleId = null,
    title = '🎫 Nouveau ticket',
    description = `Bienvenue ${member} ! Explique ta demande, le staff prendra le relais rapidement.`,
  } = opts;

  const lockKey = `${guild.id}:${member.id}:${dedupKey}`;
  if (activeTicketCreations.has(lockKey)) return null;

  // Verite terrain d'abord (fonctionne meme si deux process tournent en meme
  // temps ou si db.json a ete perdu), puis repli sur le cache local.
  const liveExisting = findExistingTicketChannel(guild, member.id, dedupKey);
  if (liveExisting) {
    setOpenTicketId(guild.id, member.id, liveExisting.id, dedupKey);
    return { existing: liveExisting };
  }
  const existingId = getOpenTicketId(guild.id, member.id, dedupKey);
  if (existingId && guild.channels.cache.has(existingId)) {
    return { existing: guild.channels.cache.get(existingId) };
  }

  activeTicketCreations.add(lockKey);
  try {
    const overwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: member.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
      },
      {
        id: guild.members.me.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles],
      },
    ];
    if (staffRoleId) {
      overwrites.push({
        id: staffRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      });
    }

    const channel = await guild.channels.create({
      name: `${namePrefix}-${sanitizeName(member.user.username)}`,
      type: ChannelType.GuildText,
      parent: category?.id,
      topic: topicKey(member.id, dedupKey),
      permissionOverwrites: overwrites,
    });

    setOpenTicketId(guild.id, member.id, channel.id, dedupKey);

    const embed = brandedEmbed({ title, description });
    const pingContent = staffRoleId ? `<@&${staffRoleId}>` : undefined;
    await channel.send({ content: pingContent, embeds: [embed], components: [buildManageRow(channel.id)] });

    logAction(guild, 'TICKET_OPENED', { Membre: `${member} (${member.id})`, Salon: `${channel}`, Type: namePrefix });

    return { channel };
  } finally {
    activeTicketCreations.delete(lockKey);
  }
}

module.exports = { createTicket, getOpenTicketId, setOpenTicketId, sanitizeName };
