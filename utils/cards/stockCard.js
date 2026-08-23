require('./fonts');
const { createCanvas } = require('@napi-rs/canvas');
const { roundRect, drawCardBackground, fitText } = require('./draw');

const W = 900;
const MARGIN_X = 44;
const HEADER_H = 84;
const CATEGORY_HEADER_H = 34;
const ITEM_LINE_H = 26;
const CATEGORY_GAP = 18;
const FOOTER_H = 46;

function layoutCategories(byCategory) {
  let height = 0;
  const entries = Object.entries(byCategory);
  entries.forEach(([, items], i) => {
    height += CATEGORY_HEADER_H + items.length * ITEM_LINE_H + (i > 0 ? CATEGORY_GAP : 0);
  });
  return { entries, height };
}

function stockLabel(stockInfo) {
  if (!stockInfo || stockInfo.is_unlimited) return { text: 'Illimité', dim: true };
  if (stockInfo.stock <= 0) return { text: 'Rupture', dim: true, muted: true };
  if (stockInfo.stock <= 5) return { text: `Plus que ${stockInfo.stock}`, dim: false };
  return { text: `${stockInfo.stock} en stock`, dim: true };
}

function drawStock(ctx, { subtitle, entries, H }) {
  drawCardBackground(ctx, W, H, 28);

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  roundRect(ctx, 5, 5, W - 10, H - 10, 24);
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 32px "Poppins Bold"';
  ctx.fillText('STOCK DISPONIBLE', MARGIN_X, 48);

  ctx.font = '400 16px "Poppins"';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText(fitText(ctx, subtitle, W - MARGIN_X * 2), MARGIN_X, 76);

  let y = HEADER_H + 16;

  entries.forEach(([category, items], catIndex) => {
    if (catIndex > 0) y += CATEGORY_GAP;

    ctx.font = '700 15px "Poppins SemiBold"';
    ctx.fillStyle = '#e5e5e5';
    ctx.fillText(`${category.toUpperCase()} (${items.length})`, MARGIN_X, y);
    y += CATEGORY_HEADER_H;

    for (const item of items) {
      ctx.font = '400 15px "Poppins"';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(fitText(ctx, item.name, W - MARGIN_X * 2 - 220), MARGIN_X + 16, y);

      const status = stockLabel(item.stockInfo);
      ctx.font = '600 12px "Poppins Medium"';
      ctx.fillStyle = status.muted ? 'rgba(255,255,255,0.35)' : status.dim ? 'rgba(255,255,255,0.5)' : '#ffffff';
      ctx.textAlign = 'right';
      const priceX = W - MARGIN_X;
      ctx.fillText(status.text, priceX - 90, y);

      ctx.font = '700 15px "Poppins Bold"';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${Number(item.price).toFixed(2)}€`, priceX, y);
      ctx.textAlign = 'left';

      y += ITEM_LINE_H;
    }
  });

  ctx.font = '400 13px "Poppins"';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.textAlign = 'center';
  ctx.fillText('Vercell — généré automatiquement', W / 2, H - 18);
  ctx.textAlign = 'left';
}

/**
 * @param {string} subtitle sous-titre affiche sous le titre (ex: lien boutique + filtre)
 * @param {Record<string, Array<{name: string, price: number, stockInfo: {is_unlimited: boolean, stock: number} | null}>>} byCategory
 */
async function renderStockPng(subtitle, byCategory) {
  const { entries, height } = layoutCategories(byCategory);
  const H = Math.round(HEADER_H + height + FOOTER_H + 30);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawStock(ctx, { subtitle, entries, H });
  return canvas.encode('png');
}

module.exports = { renderStockPng };
