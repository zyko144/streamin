// Recompense de boost : 2 "evenements de boost" cumules (un membre qui se
// met a booster) = le droit a 1 compte Steam ou streaming au choix.
// Discord n'expose pas de façon fiable un compteur "nombre de boosts actifs
// par membre" via le gateway ; on compte donc les transitions non-booster ->
// booster de ce membre dans le temps, ce qui est le proxy le plus honnete et
// implementable sans API non documentee.

const { ChannelType } = require('discord.js');
const { readDatabase, writeDatabase } = require('./db');
const { brandedEmbed, GOLD_BOOST, LOGO_URL } = require('./theme');
const { createTicket } = require('./tickets');
const { logAction } = require('./logs');

const REWARD_EVERY = 2;

function incrementBoostCount(guildId, userId) {
  const db = readDatabase();
  db.boostCounts = db.boostCounts || {};
  db.boostCounts[guildId] = db.boostCounts[guildId] || {};
  const count = (db.boostCounts[guildId][userId] || 0) + 1;
  db.boostCounts[guildId][userId] = count;
  writeDatabase(db);
  return count;
}

/**
 * A appeler sur guildMemberUpdate quand un membre commence a booster.
 * Poste un remerciement dans le salon boost, et ouvre un ticket de
 * recompense tous les REWARD_EVERY boosts cumules.
 */
async function handleBoostStarted(oldMember, newMember) {
  const guild = newMember.guild;
  const count = incrementBoostCount(guild.id, newMember.id);

  const boostChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === '🚀・boost-remerciements');
  const boosterRole = guild.roles.cache.find((r) => r.name === '💎 Booster VIP');
  const rewardRole = guild.roles.cache.find((r) => r.name === '🎁 Récompense Boost');
  const isRewardMilestone = count % REWARD_EVERY === 0;

  if (boosterRole && !newMember.roles.cache.has(boosterRole.id)) {
    await newMember.roles.add(boosterRole).catch(() => {});
  }
  if (isRewardMilestone && rewardRole && !newMember.roles.cache.has(rewardRole.id)) {
    await newMember.roles.add(rewardRole).catch(() => {});
  }

  if (boostChannel?.isTextBased()) {
    boostChannel
      .send({
        content: `${newMember}`,
        embeds: [
          brandedEmbed({
            title: isRewardMilestone ? '🎁 Récompense débloquée !' : '🚀 Merci pour le boost !',
            description: isRewardMilestone
              ? `${newMember} vient de booster le serveur streamIN (boost n°${count} pour ce membre) et **débloque le droit à 1 compte Steam ou 1 compte streaming au choix, gratuit** ! Le rôle ${rewardRole ?? '🎁 Récompense Boost'} lui a été attribué — c'est ce rôle qui indique qui a une récompense à réclamer. Un ticket a été ouvert automatiquement pour la livraison. Merci pour le soutien ! 💖`
              : `${newMember} vient de booster le serveur streamIN (boost n°${count} pour ce membre). Merci pour le soutien ! 💖 (encore ${REWARD_EVERY - (count % REWARD_EVERY)} boost avant la prochaine récompense)`,
            image: LOGO_URL,
            color: GOLD_BOOST,
          }),
        ],
      })
      .catch(() => {});
  }

  logAction(guild, 'BOOST_STARTED', { Membre: `${newMember} (${newMember.id})`, 'Compteur cumulé': `${count}` });

  if (isRewardMilestone) {
    const staffRole = guild.roles.cache.find((r) => r.name === 'Staff');
    const boostCat = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === '🚀 BOOST');
    const result = await createTicket(guild, newMember, {
      category: boostCat || null,
      namePrefix: 'boost-cadeau',
      staffRoleId: staffRole?.id,
      title: '🎁 Récompense de boost débloquée !',
      description: `${newMember}, merci pour tes ${count} boosts cumulés sur streamIN ! Tu débloques **1 compte Steam ou 1 compte streaming au choix**, gratuit. Précise ici lequel tu veux, le staff te le livre.`,
    }).catch(() => null);
    logAction(guild, 'BOOST_REWARD_GRANTED', { Membre: `${newMember} (${newMember.id})`, Palier: `${count}` });
    return result;
  }
  return null;
}

module.exports = { handleBoostStarted, incrementBoostCount, REWARD_EVERY };
