// Suivi des invitations : on garde un cache en memoire {code -> uses} par
// serveur, mis a jour a chaque arrivee/depart d'invitation. Quand un membre
// rejoint, on refetch et on compare pour trouver quel code a augmente.

const cache = new Map(); // guildId -> Map<code, uses>

async function cacheGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map(invites.map((inv) => [inv.code, inv.uses ?? 0]));
    cache.set(guild.id, map);
  } catch (err) {
    console.error(`⚠️  Impossible de charger les invitations de ${guild.name}:`, err.message);
    cache.set(guild.id, new Map());
  }
}

function bumpInviteCache(invite) {
  const map = cache.get(invite.guild?.id);
  if (map) map.set(invite.code, invite.uses ?? 0);
}

function dropInviteCache(invite) {
  const map = cache.get(invite.guild?.id);
  if (map) map.delete(invite.code);
}

/**
 * A appeler sur guildMemberAdd. Retourne { inviter, code, uses } de
 * l'invitation utilisee, ou null si non determinable (lien vanity, widget,
 * permission manquante...).
 */
async function resolveUsedInvite(guild) {
  const before = cache.get(guild.id) ?? new Map();
  let after;
  try {
    after = await guild.invites.fetch();
  } catch {
    return null;
  }

  let used = null;
  for (const invite of after.values()) {
    const prevUses = before.get(invite.code) ?? 0;
    if ((invite.uses ?? 0) > prevUses) {
      used = invite;
      break;
    }
  }

  cache.set(guild.id, new Map(after.map((inv) => [inv.code, inv.uses ?? 0])));

  if (!used) return null;
  return { inviter: used.inviter ?? null, code: used.code, uses: used.uses ?? 0 };
}

module.exports = { cacheGuildInvites, bumpInviteCache, dropInviteCache, resolveUsedInvite };
