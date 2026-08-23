const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { brandedEmbed, RED } = require('../utils/theme');

// Client Supabase dedie a la lecture publique du catalogue (table `products`,
// RLS "public can read active products") -- distinct de SUPABASE_URL/KEY
// utilises par utils/db.js pour la persistance interne du bot, pour ne pas
// activer l'un en configurant l'autre par erreur.
let supabase = null;
if (process.env.SHOP_SUPABASE_URL && process.env.SHOP_SUPABASE_KEY) {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(process.env.SHOP_SUPABASE_URL, process.env.SHOP_SUPABASE_KEY);
}

module.exports = [
  new SlashCommandBuilder().setName('ping').setDescription('Vérifie que le bot répond et sa latence.'),
  new SlashCommandBuilder().setName('serverinfo').setDescription('Infos sur ce serveur.').setDMPermission(false),
  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription("Infos sur un membre.")
    .addUserOption((o) => o.setName('membre').setDescription('Membre (toi par défaut)'))
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Affiche l'avatar d'un membre en grand.")
    .addUserOption((o) => o.setName('membre').setDescription('Membre (toi par défaut)')),
  new SlashCommandBuilder()
    .setName('stock')
    .setDescription('Disponibilité des produits streamIN par catégorie.')
    .addStringOption((o) => o.setName('categorie').setDescription('Filtrer par catégorie (ex: Steam, Streaming, Fortnite)')),
];

module.exports.execute = async (interaction) => {
  const { commandName } = interaction;

  if (commandName === 'ping') {
    const start = Date.now();
    await interaction.reply({ content: '🏓 ...', fetchReply: true }).then((sent) => {
      const rtt = Date.now() - start;
      return interaction.editReply({
        content: null,
        embeds: [brandedEmbed({ title: '🏓 Pong !', description: `Latence message : \`${rtt}ms\`\nLatence API Discord : \`${Math.round(interaction.client.ws.ping)}ms\`` })],
      });
    });
    return;
  }

  if (commandName === 'serverinfo') {
    const { guild } = interaction;
    await guild.fetch();
    const embed = brandedEmbed({
      title: `📊 ${guild.name}`,
      thumbnail: guild.iconURL({ size: 256 }) || undefined,
      fields: [
        { name: '👥 Membres', value: `${guild.memberCount}`, inline: true },
        { name: '💎 Boosts', value: `${guild.premiumSubscriptionCount ?? 0}`, inline: true },
        { name: '📁 Salons', value: `${guild.channels.cache.size}`, inline: true },
        { name: '🎭 Rôles', value: `${guild.roles.cache.size}`, inline: true },
        { name: '👑 Propriétaire', value: `<@${guild.ownerId}>`, inline: true },
        { name: '📅 Créé le', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
      ],
    });
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'userinfo') {
    const target = interaction.options.getMember('membre') || interaction.member;
    const embed = brandedEmbed({
      title: `👤 ${target.user.username}`,
      thumbnail: target.user.displayAvatarURL({ size: 256 }),
      fields: [
        { name: 'Compte créé', value: `<t:${Math.floor(target.user.createdTimestamp / 1000)}:D>`, inline: true },
        { name: 'A rejoint le', value: target.joinedTimestamp ? `<t:${Math.floor(target.joinedTimestamp / 1000)}:D>` : '—', inline: true },
        { name: 'Booste depuis', value: target.premiumSince ? `<t:${Math.floor(target.premiumSince.getTime() / 1000)}:D>` : 'Non', inline: true },
        { name: 'Rôles', value: target.roles.cache.filter((r) => r.id !== interaction.guild.id).map((r) => `${r}`).join(' ') || 'Aucun' },
      ],
    });
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'avatar') {
    const target = interaction.options.getUser('membre') || interaction.user;
    const embed = new EmbedBuilder().setColor(0xff2d2d).setTitle(`🖼️ Avatar de ${target.username}`).setImage(target.displayAvatarURL({ size: 1024 }));
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'stock') {
    if (!supabase) {
      return interaction.reply({ embeds: [brandedEmbed({ title: '⚠️ Stock indisponible', description: "SHOP_SUPABASE_URL/SHOP_SUPABASE_KEY ne sont pas configurés sur le bot (variables Render).", color: RED })], ephemeral: true });
    }
    await interaction.deferReply();
    const categorie = interaction.options.getString('categorie');
    let query = supabase.from('products').select('name, category, price, is_active').eq('is_active', true).order('category');
    if (categorie) query = query.ilike('category', `%${categorie}%`);
    const { data: products, error } = await query.limit(25);
    if (error || !products?.length) {
      return interaction.editReply({ embeds: [brandedEmbed({ title: '📦 Stock', description: categorie ? `Aucun produit actif trouvé pour "${categorie}".` : 'Aucun produit actif trouvé.', color: RED })] });
    }

    const { data: stocks } = await supabase.from('product_stock').select('product_id, stock, is_unlimited');
    const stockMap = new Map((stocks || []).map((s) => [s.product_id, s]));

    const byCategory = products.reduce((acc, p) => {
      (acc[p.category] ||= []).push(p);
      return acc;
    }, {});

    const fields = Object.entries(byCategory)
      .slice(0, 10)
      .map(([cat, items]) => ({
        name: `${cat} (${items.length})`,
        value: items
          .slice(0, 8)
          .map((p) => `• ${p.name} — ${Number(p.price).toFixed(2)}€`)
          .join('\n')
          .slice(0, 1024),
      }));

    return interaction.editReply({ embeds: [brandedEmbed({ title: '📦 Produits disponibles', description: 'Boutique : https://shop-plus-nu.vercel.app/', fields })] });
  }
};
