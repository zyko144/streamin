const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { readDatabase, writeDatabase } = require('./db');
const { buildManageRow } = require('./ticketManage');
const { brandedEmbed } = require('./theme');

const activeTicketCreations = new Set(); // anti double-clic / spam

function sanitizeName(input) {
  return (input || 'membre')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 20) || 'membre';
}

function getOpenTicketId(guildId, userId) {
  const db = readDatabase();
  return db.openTickets?.[guildId]?.[userId] ?? null;
}

function setOpenTicketId(guildId, userId, channelId) {
  const db = readDatabase();
  db.openTickets = db.openTickets || {};
  db.openTickets[guildId] = db.openTickets[guildId] || {};
  if (channelId) db.openTickets[guildId][userId] = channelId;
  else delete db.openTickets[guildId][userId];
  writeDatabase(db);
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
 * @param {string} [opts.logChannelId] salon ou logger l'ouverture
 */
async function createTicket(guild, member, opts = {}) {
  const {
    category = null,
    namePrefix = 'ticket',
    staffRoleId = null,
    title = '🎫 Nouveau ticket',
    description = `Bienvenue ${member} ! Explique ta demande, le staff prendra le relais rapidement.`,
    logChannelId = null,
  } = opts;

  const lockKey = `${guild.id}:${member.id}`;
  if (activeTicketCreations.has(lockKey)) return null;

  const existingId = getOpenTicketId(guild.id, member.id);
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
      topic: `ticket-owner:${member.id}`,
      permissionOverwrites: overwrites,
    });

    setOpenTicketId(guild.id, member.id, channel.id);

    const embed = brandedEmbed({ title, description });
    const pingContent = staffRoleId ? `<@&${staffRoleId}>` : undefined;
    await channel.send({ content: pingContent, embeds: [embed], components: [buildManageRow(channel.id)] });

    if (logChannelId) {
      const logChannel = guild.channels.cache.get(logChannelId);
      if (logChannel?.isTextBased()) {
        logChannel.send({ embeds: [brandedEmbed({ title: '📂 Ticket ouvert', description: `${member} → ${channel}`, footer: true })] }).catch(() => {});
      }
    }

    return { channel };
  } finally {
    activeTicketCreations.delete(lockKey);
  }
}

module.exports = { createTicket, getOpenTicketId, setOpenTicketId, sanitizeName };
