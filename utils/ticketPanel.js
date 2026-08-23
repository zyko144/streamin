const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const TICKET_PANEL_BUTTON_ID = 'open_ticket';

function buildTicketPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(TICKET_PANEL_BUTTON_ID).setLabel('Ouvrir un ticket').setEmoji('🎫').setStyle(ButtonStyle.Danger)
  );
}

module.exports = { TICKET_PANEL_BUTTON_ID, buildTicketPanelRow };
