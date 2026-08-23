const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { brandedEmbed, GREEN_SUCCESS, RED_ALERT } = require('../utils/theme');
const { logAction } = require('../utils/logs');

module.exports = [
  new SlashCommandBuilder()
    .setName('boost_reward_delivered')
    .setDescription("Marque la récompense de boost d'un membre comme livrée (retire le rôle 🎁 Récompense Boost)")
    .addUserOption((opt) => opt.setName('membre').setDescription('Membre dont la récompense vient d\'être livrée').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),
];

module.exports.execute = async (interaction) => {
  if (interaction.commandName !== 'boost_reward_delivered') return;

  const target = interaction.options.getMember('membre');
  const rewardRole = interaction.guild.roles.cache.find((r) => r.name === '🎁 Récompense Boost');

  if (!rewardRole) {
    return interaction.reply({ embeds: [brandedEmbed({ title: '❌ Rôle introuvable', description: 'Relance /setup pour créer le rôle 🎁 Récompense Boost.', color: RED_ALERT })], ephemeral: true });
  }
  if (!target?.roles.cache.has(rewardRole.id)) {
    return interaction.reply({ embeds: [brandedEmbed({ title: '❌ Pas de récompense en attente', description: `${target ?? 'ce membre'} n'a pas le rôle ${rewardRole} — rien à retirer.`, color: RED_ALERT })], ephemeral: true });
  }

  await target.roles.remove(rewardRole);
  logAction(interaction.guild, 'BOOST_REWARD_DELIVERED', { Membre: `${target} (${target.id})`, Par: `${interaction.user} (${interaction.user.id})` });

  return interaction.reply({
    embeds: [brandedEmbed({ title: '✅ Récompense marquée comme livrée', description: `Le rôle ${rewardRole} a été retiré à ${target}.`, color: GREEN_SUCCESS })],
  });
};
