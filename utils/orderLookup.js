// Recherche de commande par email ou numero de commande, pour la commande
// /order_lookup (reservee au staff, voir commands/order.js).
//
// Necessite un acces "service role" a Supabase car ça doit pouvoir lire
// N'IMPORTE QUELLE commande (pas seulement celle du client connecte) — la
// cle publishable normale est bloquee par les policies RLS pour ça. Le bot
// n'ecrit JAMAIS dans la base avec cette cle, seulement des lectures, et
// SEUL le staff peut declencher cette recherche (voir commands/order.js) :
// jamais automatiquement sur un message de client, pour eviter qu'un client
// puisse consulter l'historique d'un AUTRE client en tapant son email.
//
// Variable a definir sur Render : SUPABASE_SERVICE_ROLE_KEY
// (Supabase Dashboard -> Project Settings -> API -> "service_role" secret).
// Ne JAMAIS coller cette cle dans le code ou dans un chat : ajoute-la
// directement dans les variables d'environnement de Render.

let supabaseAdmin = null;
if (process.env.SHOP_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const { createClient } = require('@supabase/supabase-js');
  supabaseAdmin = createClient(process.env.SHOP_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

function isOrderLookupEnabled() {
  return Boolean(supabaseAdmin);
}

/**
 * Cherche les commandes correspondantes (par email du client ou par
 * reference de commande, complete ou tronquee a 8 caracteres). Reserve au
 * staff (voir commands/order.js) : cette fonction ne verifie pas
 * l'identite, l'appelant doit deja etre autorise.
 * @param {string} query email ou reference de commande
 * @returns {Promise<Array<{ id: string, created_at: string, status: string, total: number, items: Array<{ product_name: string, quantity: number, unit_price: number }> }>>}
 */
async function findOrders(query) {
  if (!supabaseAdmin) throw new Error('SUPABASE_SERVICE_ROLE_KEY non configurée sur ce bot.');

  const trimmed = query.trim();
  let orderIds = [];

  if (EMAIL_RE.test(trimmed)) {
    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('email', trimmed).maybeSingle();
    if (!profile) return [];
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(5);
    orderIds = (orders || []).map((o) => o.id);
  } else {
    const ref = trimmed.replace(/^#/, '');
    const { data: orders } = await supabaseAdmin.from('orders').select('id').ilike('id', `${ref}%`).limit(5);
    orderIds = (orders || []).map((o) => o.id);
  }

  if (orderIds.length === 0) return [];

  const { data: fullOrders } = await supabaseAdmin
    .from('orders')
    .select('id, created_at, status, total, order_items(product_name, category, quantity, unit_price)')
    .in('id', orderIds)
    .order('created_at', { ascending: false });

  return (fullOrders || []).map((o) => ({
    id: o.id,
    created_at: o.created_at,
    status: o.status,
    total: o.total,
    items: o.order_items || [],
  }));
}

module.exports = { isOrderLookupEnabled, findOrders };
