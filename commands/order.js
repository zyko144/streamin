const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { brandedEmbed, RED_ALERT } = require('../utils/theme');
const { isOrderLookupEnabled, findOrders, formatOrdersEmbedFields } = require('../utils/orderLookup');
const { logAction } = require('../utils/logs');

module.exports = [
  new SlashCommandBuilder()
    .setName('order_lookup')
    .setDescription("Affiche l'historique de commande d'un client (staff uniquement)")
    .addStringOption((opt) => opt.setName('email_ou_numero').setDescription("Email du client ou numéro de commande (ex: #a1b2c3d4)").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),
];

module.exports.execute = async (interaction) => {
  if (interaction.commandName !== 'order_lookup') return;

  if (!isOrderLookupEnabled()) {
    return interaction.reply({
      embeds: [brandedEmbed({ title: '⚠️ Fonction non configurée', description: "`SUPABASE_SERVICE_ROLE_KEY` n'est pas définie sur ce bot — ajoute-la dans les variables d'environnement Render (Supabase Dashboard → Project Settings → API → clé `service_role`).", color: RED_ALERT })],
      ephemeral: true,
    });
  }

  await interaction.deferReply();
  const query = interaction.options.getString('email_ou_numero');

  try {
    const orders = await findOrders(query);
    if (orders.length === 0) {
      return interaction.editReply({
        embeds: [brandedEmbed({ title: '❌ Aucune commande trouvée', description: `Rien trouvé pour \`${query}\`. Vérifie l'orthographe de l'email ou le numéro de commande.`, color: RED_ALERT })],
      });
    }

    await interaction.editReply({
      embeds: [
        brandedEmbed({
          title: `📋 Historique — ${query}`,
          description: `${orders.length} commande(s) trouvée(s) :`,
          fields: formatOrdersEmbedFields(orders),
        }),
      ],
    });
    logAction(interaction.guild, 'ORDER_LOOKUP', { Par: `${interaction.user} (${interaction.user.id})`, Recherche: query, Résultats: `${orders.length}` });
  } catch (err) {
    console.error('Erreur /order_lookup:', err);
    await interaction.editReply({
      embeds: [brandedEmbed({ title: '❌ Erreur', description: `\`${err.message}\``, color: RED_ALERT })],
    });
  }
};
