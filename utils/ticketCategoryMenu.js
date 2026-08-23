const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { TICKET_CATEGORIES } = require('./ticketCategories');

const TICKET_CATEGORY_SELECT_ID = 'ticket_category_select';

function buildTicketCategoryRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(TICKET_CATEGORY_SELECT_ID)
    .setPlaceholder('Choisis la raison de ton ticket')
    .addOptions(
      TICKET_CATEGORIES.map((c) => ({ label: c.label, value: c.id, emoji: c.emoji }))
    );
  return new ActionRowBuilder().addComponents(menu);
}

module.exports = { TICKET_CATEGORY_SELECT_ID, buildTicketCategoryRow };
