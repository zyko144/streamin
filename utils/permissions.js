const { PermissionFlagsBits } = require('discord.js');

/**
 * Verifie que l'appelant a le droit d'utiliser les commandes d'administration
 * du bot : proprietaire du serveur, permission Administrateur, ou role
 * ADMIN_ROLE_ID si defini. Defense en profondeur en plus du
 * setDefaultMemberPermissions() deja pose sur les commandes.
 */
function isBotAdmin(interaction) {
  const { guild, member } = interaction;
  if (!guild || !member) return false;
  if (guild.ownerId === member.id) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const adminRoleId = process.env.ADMIN_ROLE_ID;
  if (adminRoleId && member.roles.cache.has(adminRoleId)) return true;
  return false;
}

module.exports = { isBotAdmin };
