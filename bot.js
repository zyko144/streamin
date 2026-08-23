const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const express = require('express');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { initDatabase } = require('./utils/db');
const { handleTicketManage } = require('./utils/ticketManage');
const { createTicket } = require('./utils/tickets');
const { TICKET_PANEL_BUTTON_ID } = require('./utils/ticketPanel');
const { handleBoostStarted } = require('./utils/boosts');
const { brandedEmbed, RED_ALERT } = require('./utils/theme');
const { ChannelType } = require('discord.js');

if (!process.env.TOKEN) {
  console.error('❌ TOKEN manquant dans .env');
  process.exit(1);
}

// Le process ne doit jamais crasher sur une erreur isolee (webhook Discord
// down, promesse non geree dans un handler...) : on log et on continue.
process.on('unhandledRejection', (err) => console.error('⚠️  unhandledRejection:', err));
process.on('uncaughtException', (err) => console.error('⚠️  uncaughtException:', err));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
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

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Connecté en tant que ${c.user.tag} (${c.guilds.cache.size} serveur(s))`);
});

client.on(Events.Error, (err) => console.error('⚠️  Erreur client Discord:', err));

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const mod = client.commands.get(interaction.commandName);
      if (mod?.execute) await mod.execute(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId === TICKET_PANEL_BUTTON_ID) {
      const supportCat = interaction.guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === '🎫 SUPPORT');
      const staffRole = interaction.guild.roles.cache.find((r) => r.name === 'Staff');
      const logChannel = interaction.guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === 'logs-tickets');

      const result = await createTicket(interaction.guild, interaction.member, {
        category: supportCat || null,
        staffRoleId: staffRole?.id,
        logChannelId: logChannel?.id,
      });

      if (!result) {
        return interaction.reply({ embeds: [brandedEmbed({ title: '⏳ Un instant...', description: 'Création du ticket en cours, réessaie dans quelques secondes.', color: RED_ALERT })], ephemeral: true });
      }
      if (result.existing) {
        return interaction.reply({ embeds: [brandedEmbed({ title: '❌ Ticket déjà ouvert', description: `Tu as déjà un ticket ouvert : ${result.existing}`, color: RED_ALERT })], ephemeral: true });
      }
      return interaction.reply({ embeds: [brandedEmbed({ title: '✅ Ticket créé', description: `Ton ticket a été créé : ${result.channel}` })], ephemeral: true });
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
