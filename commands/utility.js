const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { brandedEmbed, RED } = require('../utils/theme');
const { renderStockCategoryPage } = require('../utils/cards/stockPageCard');

// Meme ordre que les categories sur le site (GROUP_META dans src/routes/index.tsx),
// pour que /stock se parcoure dans un ordre familier. Une categorie absente
// de cette liste (nouvelle categorie ajoutee cote site) atterrit a la fin,
// triee alphabetiquement, plutot que de disparaitre.
const CATEGORY_ORDER = [
  'Streaming', 'VPN', 'Discord', 'Twitch',
  'Fortnite', 'Fortnite Rare', 'V-Bucks', 'Valorant EU', 'Robux', 'Steam', 'Epic Games',
];
function sortCategories(categories) {
  return [...categories].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

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
    .setDescription('Catalogue complet Vercell, une catégorie par page (navigable).')
    .addStringOption((o) => o.setName('categorie').setDescription('Ouvrir directement sur cette catégorie (ex: Steam, Streaming, Fortnite)')),
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
    const embed = new EmbedBuilder().setColor(0xffffff).setTitle(`🖼️ Avatar de ${target.username}`).setImage(target.displayAvatarURL({ size: 1024 }));
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'stock') {
    if (!supabase) {
      return interaction.reply({ embeds: [brandedEmbed({ title: '⚠️ Stock indisponible', description: "SHOP_SUPABASE_URL/SHOP_SUPABASE_KEY ne sont pas configurés sur le bot (variables Render).", color: RED })], ephemeral: true });
    }
    await interaction.deferReply();
    const categorie = interaction.options.getString('categorie');

    // Tout le catalogue actif, pas de limite : chaque categorie devient sa
    // propre page navigable plutot que de tout entasser sur une seule image.
    const { data: products, error } = await supabase.from('products').select('id, name, category, price, is_active, logo').eq('is_active', true).order('name');
    if (error || !products?.length) {
      return interaction.editReply({ embeds: [brandedEmbed({ title: '📦 Stock', description: 'Aucun produit actif trouvé.', color: RED })] });
    }

    const { data: stocks } = await supabase.from('product_stock').select('product_id, stock, is_unlimited');
    const stockMap = new Map((stocks || []).map((s) => [s.product_id, s]));

    const byCategory = products.reduce((acc, p) => {
      (acc[p.category] ||= []).push({ name: p.name, price: p.price, category: p.category, logo: p.logo, stockInfo: stockMap.get(p.id) ?? null });
      return acc;
    }, {});

    const orderedCategories = sortCategories(Object.keys(byCategory));
    const pages = orderedCategories.map((category) => ({ category, items: byCategory[category] }));

    let index = 0;
    if (categorie) {
      const found = orderedCategories.findIndex((c) => c.toLowerCase().includes(categorie.toLowerCase()));
      if (found !== -1) index = found;
      else {
        return interaction.editReply({ embeds: [brandedEmbed({ title: '📦 Stock', description: `Aucune catégorie ne correspond à "${categorie}".`, color: RED })] });
      }
    }

    const PREV_ID = `stock_prev_${interaction.id}`;
    const NEXT_ID = `stock_next_${interaction.id}`;
    const buildRow = (i, disabled = false) => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(PREV_ID).setLabel('◀ Précédent').setStyle(ButtonStyle.Secondary).setDisabled(disabled || i === 0),
      new ButtonBuilder().setCustomId(NEXT_ID).setLabel('Suivant ▶').setStyle(ButtonStyle.Secondary).setDisabled(disabled || i === pages.length - 1),
    );
    const renderPage = async (i) => {
      const page = pages[i];
      const png = await renderStockCategoryPage({ category: page.category, items: page.items, pageIndex: i, pageCount: pages.length });
      return new AttachmentBuilder(png, { name: 'stock.png' });
    };

    const firstAttachment = await renderPage(index);
    const message = await interaction.editReply({
      files: [firstAttachment],
      components: pages.length > 1 ? [buildRow(index)] : [],
    });

    if (pages.length <= 1) return;

    const collector = message.createMessageComponentCollector({
      filter: (i) => i.customId === PREV_ID || i.customId === NEXT_ID,
      time: 5 * 60 * 1000,
    });

    collector.on('collect', async (i) => {
      index = i.customId === PREV_ID ? Math.max(0, index - 1) : Math.min(pages.length - 1, index + 1);
      const attachment = await renderPage(index);
      await i.update({ files: [attachment], components: [buildRow(index)] });
    });

    collector.on('end', () => {
      interaction.editReply({ components: [buildRow(index, true)] }).catch(() => {});
    });
  }
};
