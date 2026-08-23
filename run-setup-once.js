// Script ponctuel : execute la logique de /setup directement (sans passer
// par une interaction Discord, que je ne peux pas simuler depuis ici), puis
// se deconnecte. Pas de process persistant -> aucun risque de dupliquer les
// interactions du vrai bot une fois deploye.
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { runSetup } = require('./utils/setupServer');
const { initDatabase } = require('./utils/db');

(async () => {
  await initDatabase();
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  await client.login(process.env.TOKEN);

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.members.fetch(); // s'assurer que guild.members.me est en cache
  console.log(`Connecté à ${guild.name}, lancement de runSetup()...`);

  const { summary, webhookUrl } = await runSetup(guild);
  console.log('\n=== RESUME ===');
  summary.forEach((line) => console.log(line.replace(/<[@#][!&]?\d+>/g, (m) => m)));
  console.log('\nWebhook commandes:', webhookUrl || '(non créé — permission manquante)');

  await client.destroy();
  process.exit(0);
})().catch((err) => {
  console.error('Erreur run-setup-once:', err);
  process.exit(1);
});
