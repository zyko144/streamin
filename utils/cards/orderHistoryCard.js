require('./fonts');
const { createCanvas } = require('@napi-rs/canvas');
const { roundRect, drawCardBackground, fitText } = require('./draw');

const W = 900;
const MARGIN_X = 44;
const HEADER_H = 96;
const ORDER_GAP = 26;
const ORDER_HEADER_H = 40;
const CATEGORY_HEADER_H = 28;
const ITEM_LINE_H = 24;
const ORDER_TOTAL_H = 34;
const FOOTER_H = 46;

const STATUS_STYLE = {
  pending: { label: 'EN ATTENTE', color: '#eab308' },
  completed: { label: 'TERMINÉE', color: '#22c55e' },
  cancelled: { label: 'ANNULÉE', color: '#ef4444' },
};

function groupByCategory(items) {
  const map = new Map();
  for (const item of items) {
    const cat = item.category || 'Autre';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(item);
  }
  return [...map.entries()];
}

function layoutOrder(order) {
  const categories = groupByCategory(order.items);
  let height = ORDER_HEADER_H;
  for (const [, items] of categories) {
    height += CATEGORY_HEADER_H + items.length * ITEM_LINE_H;
  }
  height += ORDER_TOTAL_H;
  return { categories, height };
}

function computeLayout(orders) {
  const laidOut = orders.map((o) => ({ order: o, ...layoutOrder(o) }));
  const ordersHeight = laidOut.reduce((sum, o, i) => sum + o.height + (i > 0 ? ORDER_GAP : 0), 0);
  const H = Math.round(HEADER_H + ordersHeight + FOOTER_H + 30);
  return { laidOut, H };
}

function drawOrderHistory(ctx, { query, laidOut, H }) {
  drawCardBackground(ctx, W, H, 28);

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  roundRect(ctx, 5, 5, W - 10, H - 10, 24);
  ctx.stroke();
  ctx.restore();

  // En-tete
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 32px "Poppins Bold"';
  ctx.fillText('HISTORIQUE DE COMMANDE', MARGIN_X, 48);

  ctx.font = '400 16px "Poppins"';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText(`Recherche : ${fitText(ctx, query, W - MARGIN_X * 2 - 200)} — ${laidOut.length} commande(s) trouvée(s)`, MARGIN_X, 76);

  let y = HEADER_H + 16;

  for (const { order, categories } of laidOut) {
    // En-tete commande
    const date = new Date(order.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    ctx.font = '700 19px "Poppins Bold"';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Commande #${order.id.slice(0, 8)}`, MARGIN_X, y);

    ctx.font = '400 14px "Poppins"';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(date, MARGIN_X, y + 20);

    const status = STATUS_STYLE[order.status] || { label: order.status.toUpperCase(), color: '#94a3b8' };
    ctx.font = '700 12px "Poppins Bold"';
    const badgeText = status.label;
    const badgeW = ctx.measureText(badgeText).width + 24;
    const badgeX = W - MARGIN_X - badgeW;
    ctx.fillStyle = `${status.color}33`;
    roundRect(ctx, badgeX, y - 20, badgeW, 26, 13);
    ctx.fill();
    ctx.strokeStyle = status.color;
    ctx.lineWidth = 1;
    roundRect(ctx, badgeX, y - 20, badgeW, 26, 13);
    ctx.stroke();
    ctx.fillStyle = status.color;
    ctx.textAlign = 'center';
    ctx.fillText(badgeText, badgeX + badgeW / 2, y - 3);
    ctx.textAlign = 'left';

    y += ORDER_HEADER_H;

    // Categories
    for (const [category, items] of categories) {
      ctx.font = '700 13px "Poppins SemiBold"';
      ctx.fillStyle = '#ff6b6b';
      ctx.fillText(category.toUpperCase(), MARGIN_X + 12, y);
      y += CATEGORY_HEADER_H;

      for (const item of items) {
        ctx.font = '400 15px "Poppins"';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        const line = `${item.quantity}x ${item.product_name}`;
        ctx.fillText(fitText(ctx, line, W - MARGIN_X * 2 - 140), MARGIN_X + 28, y);

        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText(`${Number(item.unit_price).toFixed(2)}€`, W - MARGIN_X, y);
        ctx.textAlign = 'left';
        y += ITEM_LINE_H;
      }
    }

    // Total
    ctx.font = '700 17px "Poppins Bold"';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Total', MARGIN_X + 12, y + 10);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ff4d4d';
    ctx.fillText(`${Number(order.total).toFixed(2)}€`, W - MARGIN_X, y + 10);
    ctx.textAlign = 'left';
    y += ORDER_TOTAL_H;

    if (order !== laidOut[laidOut.length - 1].order) {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(MARGIN_X, y + ORDER_GAP / 2);
      ctx.lineTo(W - MARGIN_X, y + ORDER_GAP / 2);
      ctx.stroke();
      y += ORDER_GAP;
    }
  }

  ctx.font = '400 13px "Poppins"';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.textAlign = 'center';
  ctx.fillText('streamIN — généré automatiquement', W / 2, H - 18);
  ctx.textAlign = 'left';
}

async function renderOrderHistoryPng(query, orders) {
  const { laidOut, H } = computeLayout(orders);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawOrderHistory(ctx, { query, laidOut, H });
  return canvas.encode('png');
}

module.exports = { renderOrderHistoryPng };
