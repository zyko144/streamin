const { REST, Routes } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ TOKEN et CLIENT_ID sont requis dans .env pour déployer les commandes.');
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const mod = require(path.join(commandsPath, file));
  const builders = Array.isArray(mod) ? mod : [];
  for (const builder of builders) commands.push(builder.toJSON());
}

const rest = new REST().setToken(TOKEN);

(async () => {
  try {
    if (GUILD_ID) {
      // Commandes de guilde : disponibles instantanement, ideal en dev/test.
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log(`✅ ${commands.length} commande(s) déployée(s) sur la guilde ${GUILD_ID}.`);
    } else {
      // Commandes globales : visibles sur tous les serveurs, propagation ~1h.
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log(`✅ ${commands.length} commande(s) déployée(s) globalement (propagation jusqu'à 1h).`);
    }
  } catch (err) {
    console.error('❌ Erreur de déploiement des commandes:', err);
    process.exit(1);
  }
})();
