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

function topicKey(userId, namePrefix) {
  return `ticket-owner:${userId}:${namePrefix}`;
}

function getOpenTicketId(guildId, userId, namePrefix = 'ticket') {
  const db = readDatabase();
  return db.openTickets?.[guildId]?.[`${userId}:${namePrefix}`] ?? null;
}

function setOpenTicketId(guildId, userId, channelId, namePrefix = 'ticket') {
  const db = readDatabase();
  db.openTickets = db.openTickets || {};
  db.openTickets[guildId] = db.openTickets[guildId] || {};
  const key = `${userId}:${namePrefix}`;
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
function findExistingTicketChannel(guild, userId, namePrefix = 'ticket') {
  const marker = topicKey(userId, namePrefix);
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
 * @param {string} [opts.namePrefix] prefixe du salon (defaut "ticket")
 * @param {string} [opts.staffRoleId] role staff a inviter dans le ticket
 * @param {string} [opts.title]
 * @param {string} [opts.description]
 */
async function createTicket(guild, member, opts = {}) {
  const {
    category = null,
    namePrefix = 'ticket',
    staffRoleId = null,
    title = '🎫 Nouveau ticket',
    description = `Bienvenue ${member} ! Explique ta demande, le staff prendra le relais rapidement.`,
  } = opts;

  const lockKey = `${guild.id}:${member.id}:${namePrefix}`;
  if (activeTicketCreations.has(lockKey)) return null;

  // Verite terrain d'abord (fonctionne meme si deux process tournent en meme
  // temps ou si db.json a ete perdu), puis repli sur le cache local.
  const liveExisting = findExistingTicketChannel(guild, member.id, namePrefix);
  if (liveExisting) {
    setOpenTicketId(guild.id, member.id, liveExisting.id, namePrefix);
    return { existing: liveExisting };
  }
  const existingId = getOpenTicketId(guild.id, member.id, namePrefix);
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
      topic: topicKey(member.id, namePrefix),
      permissionOverwrites: overwrites,
    });

    setOpenTicketId(guild.id, member.id, channel.id, namePrefix);

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
