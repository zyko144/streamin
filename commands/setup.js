const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { isBotAdmin } = require('../utils/permissions');
const { brandedEmbed, RED } = require('../utils/theme');
const { runSetup } = require('../utils/setupServer');
const { logAction } = require('../utils/logs');

module.exports = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription("Configure (ou reconfigure) le serveur Vercell : roles, salons, permissions, panneau de tickets.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),
];

module.exports.execute = async (interaction) => {
  if (interaction.commandName !== 'setup') return;

  if (!isBotAdmin(interaction)) {
    return interaction.reply({
      embeds: [brandedEmbed({ title: '❌ Accès refusé', description: "Seul le propriétaire du serveur ou un administrateur peut lancer `/setup`.", color: RED })],
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const { summary, webhookUrl } = await runSetup(interaction.guild);

    const webhookLine = webhookUrl
      ? `\n\n🔗 **Webhook commandes** (à mettre dans \`DISCORD_ORDERS_WEBHOOK_URL\` sur le site) :\n||${webhookUrl}||`
      : `\n\n⚠️ Webhook non créé automatiquement (permission "Gérer les webhooks" manquante ?). Crée-le à la main dans le salon commandes → Paramètres → Intégrations → Webhooks.`;

    await interaction.editReply({
      embeds: [brandedEmbed({ title: '✅ Configuration terminée', description: summary.join('\n') + webhookLine })],
    });
    logAction(interaction.guild, 'SETUP_RUN', { Par: `${interaction.user} (${interaction.user.id})` });
  } catch (err) {
    console.error('Erreur /setup:', err);
    await interaction.editReply({
      embeds: [
        brandedEmbed({
          title: '❌ Erreur pendant la configuration',
          description: `\`${err.message}\`\n\nVérifie que le rôle du bot est assez haut dans la hiérarchie et qu'il a bien les permissions Gérer les rôles / salons / webhooks.`,
          color: RED,
        }),
      ],
    });
  }
};
