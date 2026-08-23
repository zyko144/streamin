const { ChannelType } = require('discord.js');
const { brandedEmbed } = require('./theme');

/**
 * Poste une ligne de log operationnelle dans le salon 📝・logs (staff-only).
 * Ne JAMAIS passer de secrets/tokens/donnees bancaires dans `fields`.
 *
 * @param {import('discord.js').Guild} guild
 * @param {string} action ex: "TICKET_OPENED", "BOOST_REWARD", "SETUP_RUN"
 * @param {Record<string,string>} fields
 */
function logAction(guild, action, fields = {}) {
  const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === '📝・logs');
  if (!channel?.isTextBased()) return;
  const time = new Date().toLocaleTimeString('fr-FR');
  const embed = brandedEmbed({
    title: `📝 ${action}`,
    description: Object.entries(fields).map(([k, v]) => `**${k}:** ${v}`).join('\n'),
    footer: false,
  }).setFooter({ text: `Vercell • ${time}` });
  channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = { logAction };
