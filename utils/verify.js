const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const VERIFY_BUTTON_ID = 'verify_member';

function buildVerifyRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(VERIFY_BUTTON_ID).setLabel('Je confirme avoir lu').setEmoji('✅').setStyle(ButtonStyle.Success)
  );
}

module.exports = { VERIFY_BUTTON_ID, buildVerifyRow };
