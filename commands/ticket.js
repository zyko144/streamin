const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { brandedEmbed, RED_ALERT, GREEN_SUCCESS } = require('../utils/theme');
const { setOpenTicketId } = require('../utils/tickets');

module.exports = [
  new SlashCommandBuilder()
    .setName('ticket_add')
    .setDescription('Ajoute un membre au ticket courant')
    .addUserOption((opt) => opt.setName('membre').setDescription('Membre à ajouter').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('ticket_remove')
    .setDescription('Retire un membre du ticket courant')
    .addUserOption((opt) => opt.setName('membre').setDescription('Membre à retirer').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('ticket_close')
    .setDescription('Ferme et supprime le ticket courant')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),
];

function isTicketChannel(channel) {
  return channel?.topic?.startsWith('ticket-owner:');
}

module.exports.execute = async (interaction) => {
  const { commandName, options, channel, guild } = interaction;

  if (!isTicketChannel(channel)) {
    return interaction.reply({ embeds: [brandedEmbed({ title: '❌ Ce salon n\'est pas un ticket.', color: RED_ALERT })], ephemeral: true });
  }

  if (commandName === 'ticket_add') {
    const target = options.getUser('membre');
    await channel.permissionOverwrites.edit(target.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
    return interaction.reply({ embeds: [brandedEmbed({ title: '✅ Membre ajouté', description: `${target} a été ajouté au ticket.`, color: GREEN_SUCCESS })] });
  }

  if (commandName === 'ticket_remove') {
    const target = options.getUser('membre');
    await channel.permissionOverwrites.edit(target.id, { ViewChannel: false });
    return interaction.reply({ embeds: [brandedEmbed({ title: '❌ Membre retiré', description: `${target} a été retiré du ticket.`, color: RED_ALERT })] });
  }

  if (commandName === 'ticket_close') {
    const ownerId = channel.topic.split(':')[1];
    if (ownerId) setOpenTicketId(guild.id, ownerId, null);
    await interaction.reply({ embeds: [brandedEmbed({ title: '🔒 Fermeture du ticket', description: 'Ce ticket sera fermé dans 5 secondes...', color: RED_ALERT })] });
    setTimeout(() => channel.delete().catch(() => {}), 5000);
  }
};
