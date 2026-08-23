// Theme visuel partage par tout le bot : rouge/noir streamIN.
const { EmbedBuilder } = require('discord.js');

const RED = 0xff2d2d;
const RED_ALERT = 0xe11d48;
const GREEN_SUCCESS = 0x22c55e;
const GOLD_BOOST = 0xf47521;

// URL publique du logo (servi par le site streamIN, pas par ce bot).
const LOGO_URL = process.env.LOGO_URL || 'https://shop-plus-nu.vercel.app/logo.png';
const FOOTER = { text: 'streamIN', iconURL: LOGO_URL };

/**
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {string} [opts.description]
 * @param {number} [opts.color] defaut : rouge streamIN
 * @param {Array}  [opts.fields]
 * @param {string} [opts.image] URL d'image/GIF pour le corps de l'embed
 * @param {string} [opts.thumbnail] petite image en haut a droite
 * @param {boolean} [opts.footer] defaut true
 */
function brandedEmbed({ title, description, color, fields, image, thumbnail, footer = true } = {}) {
  const embed = new EmbedBuilder().setColor(color ?? RED).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (fields?.length) embed.addFields(fields);
  if (image) embed.setImage(image);
  if (thumbnail !== false) embed.setThumbnail(thumbnail ?? LOGO_URL);
  if (footer) embed.setFooter(FOOTER);
  return embed;
}

module.exports = { RED, RED_ALERT, GREEN_SUCCESS, GOLD_BOOST, LOGO_URL, FOOTER, brandedEmbed };
