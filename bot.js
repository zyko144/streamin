const { Client, GatewayIntentBits, Collection, Events, ChannelType } = require('discord.js');
const express = require('express');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { initDatabase } = require('./utils/db');
const { handleTicketManage } = require('./utils/ticketManage');
const { createTicket } = require('./utils/tickets');
const { TICKET_PANEL_BUTTON_ID } = require('./utils/ticketPanel');
const { TICKET_CATEGORY_SELECT_ID, buildTicketCategoryRow } = require('./utils/ticketCategoryMenu');
const { TICKET_CATEGORIES } = require('./utils/ticketCategories');
const { VERIFY_BUTTON_ID } = require('./utils/verify');
const { handleBoostStarted } = require('./utils/boosts');
const { cacheGuildInvites, bumpInviteCache, dropInviteCache, resolveUsedInvite } = require('./utils/invites');
const { handleTicketAutomation } = require('./utils/ticketAutomation');
const { brandedEmbed, RED_ALERT, GREEN_SUCCESS } = require('./utils/theme');
const { logAction } = require('./utils/logs');

if (!process.env.TOKEN) {
  console.error('❌ TOKEN manquant dans .env');
  process.exit(1);
}

// Le process ne doit jamais crasher sur une erreur isolee (webhook Discord
// down, promesse non geree dans un handler...) : on log et on continue.
process.on('unhandledRejection', (err) => console.error('⚠️  unhandledRejection:', err));
process.on('uncaughtException', (err) => console.error('⚠️  uncaughtException:', err));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const mod = require(path.join(commandsPath, file));
  const builders = Array.isArray(mod) ? mod : [];
  for (const builder of builders) {
    client.commands.set(builder.name, mod);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Connecté en tant que ${c.user.tag} (${c.guilds.cache.size} serveur(s))`);
  for (const guild of c.guilds.cache.values()) {
    await cacheGuildInvites(guild);
  }
});

client.on(Events.Error, (err) => console.error('⚠️  Erreur client Discord:', err));
client.on(Events.InviteCreate, bumpInviteCache);
client.on(Events.InviteDelete, dropInviteCache);

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const bienvenue = member.guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === '👋・bienvenue');
    if (!bienvenue?.isTextBased()) return;

    const used = await resolveUsedInvite(member.guild);
    const inviterLine = used?.inviter ? `Invité par **${used.inviter.tag}** (code \`${used.code}\`, ${used.uses} utilisation(s))` : "Invitation non déterminée (lien vanity, widget, ou permission manquante).";

    await bienvenue.send({
      content: `${member}`,
      embeds: [
        brandedEmbed({
          title: `👋 Bienvenue ${member.user.username} !`,
          description: `${member} vient de rejoindre streamIN — membre n°${member.guild.memberCount}.\n\n${inviterLine}`,
          thumbnail: member.user.displayAvatarURL({ size: 256 }),
        }),
      ],
    });
  } catch (err) {
    console.error('Erreur guildMemberAdd (bienvenue/invite):', err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const mod = client.commands.get(interaction.commandName);
      if (mod?.execute) await mod.execute(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId === TICKET_PANEL_BUTTON_ID) {
      // Etape 1 : demander la categorie avant de creer le salon (ephemere,
      // seul le client qui a clique le voit).
      return interaction.reply({
        embeds: [brandedEmbed({ title: '🎫 Nouveau ticket', description: 'Choisis la raison de ton ticket dans le menu ci-dessous.' })],
        components: [buildTicketCategoryRow()],
        ephemeral: true,
      });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === TICKET_CATEGORY_SELECT_ID) {
      const chosen = TICKET_CATEGORIES.find((c) => c.id === interaction.values[0]);
      if (!chosen) return interaction.update({ content: '❌ Catégorie inconnue.', embeds: [], components: [] });

      await interaction.deferUpdate();

      const supportCat = interaction.guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === '🎫 SUPPORT');
      const staffRole = interaction.guild.roles.cache.find((r) => r.name === 'Staff');

      const result = await createTicket(interaction.guild, interaction.member, {
        category: supportCat || null,
        staffRoleId: staffRole?.id,
        namePrefix: chosen.namePrefix,
        dedupKey: 'support',
        title: `${chosen.emoji} ${chosen.label}`,
        description: chosen.welcome(interaction.member),
      });

      if (!result) {
        return interaction.editReply({ embeds: [brandedEmbed({ title: '⏳ Un instant...', description: 'Création du ticket en cours, réessaie dans quelques secondes.', color: RED_ALERT })], components: [] });
      }
      if (result.existing) {
        return interaction.editReply({ embeds: [brandedEmbed({ title: '❌ Ticket déjà ouvert', description: `Tu as déjà un ticket ouvert : ${result.existing}`, color: RED_ALERT })], components: [] });
      }
      return interaction.editReply({ embeds: [brandedEmbed({ title: '✅ Ticket créé', description: `Ton ticket a été créé : ${result.channel}` })], components: [] });
    }

    if (interaction.isButton() && interaction.customId === VERIFY_BUTTON_ID) {
      const verifiedRole = interaction.guild.roles.cache.find((r) => r.name === '✅ Client Vérifié');
      if (!verifiedRole) {
        return interaction.reply({ content: "❌ Rôle de vérification introuvable, relance /setup.", ephemeral: true });
      }
      if (interaction.member.roles.cache.has(verifiedRole.id)) {
        return interaction.reply({ content: '✅ Tu es déjà vérifié !', ephemeral: true });
      }
      await interaction.member.roles.add(verifiedRole);
      return interaction.reply({ embeds: [brandedEmbed({ title: '✅ Vérifié !', description: `Bienvenue, tu as maintenant accès à tout le serveur.`, color: GREEN_SUCCESS })], ephemeral: true });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_manage') {
      return handleTicketManage(interaction);
    }
  } catch (err) {
    console.error('Erreur interaction:', err);
    const payload = { content: "❌ Une erreur est survenue.", ephemeral: true };
    if (interaction.deferred || interaction.replied) interaction.followUp(payload).catch(() => {});
    else interaction.reply(payload).catch(() => {});
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    await handleTicketAutomation(message);
  } catch (err) {
    console.error('Erreur automatisation ticket:', err);
  }
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  try {
    if (!oldMember.premiumSince && newMember.premiumSince) {
      await handleBoostStarted(oldMember, newMember);
    }
  } catch (err) {
    console.error('Erreur handleBoostStarted:', err);
  }
});

// --- Serveur Express minimal (keep-alive Render + healthcheck) ---
const app = express();
app.get('/', (_req, res) => res.send('streamIN bot en ligne ✅'));
app.get('/health', (_req, res) => res.json({ status: 'ok', guilds: client.guilds.cache.size, uptime: process.uptime() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌍 Serveur web (healthcheck) lancé sur le port ${PORT}`));

(async () => {
  await initDatabase();
  await client.login(process.env.TOKEN);
})();
