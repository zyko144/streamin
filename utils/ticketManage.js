const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { readDatabase, writeDatabase } = require('./db');
const { RED_ALERT, FOOTER } = require('./theme');

const CLAIM_FIELD_NAME = '🙋 Pris en charge';

function getClaim(channelId) {
  const db = readDatabase();
  return db.ticketClaims?.[channelId] ?? null;
}

function setClaim(channelId, userId) {
  const db = readDatabase();
  if (!db.ticketClaims) db.ticketClaims = {};
  if (userId) db.ticketClaims[channelId] = userId;
  else delete db.ticketClaims[channelId];
  writeDatabase(db);
}

/** Menu deroulant pour gerer un ticket : prendre en charge / relacher / fermer. */
function buildManageRow(channelId) {
  const claimedBy = getClaim(channelId);
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_manage')
    .setPlaceholder(claimedBy ? '🙋 Ticket pris en charge — Gérer' : '🎫 Gérer ce ticket');

  const options = claimedBy
    ? [{ label: 'Relâcher le ticket', description: 'Retire ta prise en charge', value: 'unclaim', emoji: '↩️' }]
    : [{ label: 'Prendre en charge', description: 'Assigne ce ticket à toi', value: 'claim', emoji: '🙋' }];
  options.push({ label: 'Fermer le ticket', description: 'Supprime ce salon', value: 'close', emoji: '🔒' });

  menu.addOptions(options);
  return new ActionRowBuilder().addComponents(menu);
}

function withoutClaimField(embed) {
  const fields = (embed.fields || []).filter((f) => f.name !== CLAIM_FIELD_NAME);
  return EmbedBuilder.from(embed).setFields(fields);
}

async function handleTicketManage(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.reply({ content: '❌ Seul le staff peut gérer ce ticket.', ephemeral: true });
  }

  const action = interaction.values[0];
  const channelId = interaction.channel.id;
  const sourceEmbed = interaction.message.embeds[0];

  if (action === 'claim') {
    setClaim(channelId, interaction.user.id);
    const embed = withoutClaimField(sourceEmbed).addFields({ name: CLAIM_FIELD_NAME, value: `${interaction.user}`, inline: true });
    return interaction.update({ embeds: [embed], components: [buildManageRow(channelId)] });
  }

  if (action === 'unclaim') {
    setClaim(channelId, null);
    const embed = withoutClaimField(sourceEmbed);
    return interaction.update({ embeds: [embed], components: [buildManageRow(channelId)] });
  }

  if (action === 'close') {
    setClaim(channelId, null);
    const closingEmbed = new EmbedBuilder()
      .setColor(RED_ALERT)
      .setTitle('🔒 Fermeture du ticket')
      .setDescription('Ce salon sera supprimé dans quelques secondes...')
      .setFooter(FOOTER);
    await interaction.update({ embeds: [closingEmbed], components: [] });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
  }
}

module.exports = { getClaim, setClaim, buildManageRow, handleTicketManage };
