require('./fonts');
const { createCanvas } = require('@napi-rs/canvas');
const { roundRect, drawCardBackground, fitText } = require('./draw');
const { getProductLogo } = require('./logos');

const W = 900;
const MARGIN_X = 44;
const HEADER_H = 84;
const CATEGORY_HEADER_H = 40;
const ITEM_LINE_H = 34;
const CATEGORY_GAP = 18;
const FOOTER_H = 46;
const ICON_SIZE = 22;
const ROW_X = MARGIN_X - 12;
const ROW_W = W - ROW_X * 2;
const NAME_X = MARGIN_X + 16 + ICON_SIZE + 12;
const STATUS_COL_X = W - MARGIN_X - 150;
const PRICE_COL_X = W - MARGIN_X;

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

/** Precharge tous les logos avant de dessiner : @napi-rs/canvas est
 * synchrone au dessin, donc les images doivent deja etre resolues. */
async function preloadLogos(entries) {
  const items = entries.flatMap(([, items]) => items);
  const logos = await Promise.all(items.map((item) => getProductLogo(item)));
  const map = new Map();
  items.forEach((item, i) => map.set(item, logos[i]));
  return map;
}

function drawStock(ctx, { subtitle, entries, H, logos }) {
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

    const bandH = CATEGORY_HEADER_H - 10;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    roundRect(ctx, ROW_X, y, ROW_W, bandH, 8);
    ctx.fill();

    ctx.font = '700 15px "Poppins SemiBold"';
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${category.toUpperCase()} (${items.length})`, MARGIN_X, y + bandH / 2);
    ctx.textBaseline = 'alphabetic';
    y += CATEGORY_HEADER_H;

    items.forEach((item, i) => {
      if (i % 2 === 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.035)';
        roundRect(ctx, ROW_X, y, ROW_W, ITEM_LINE_H, 6);
        ctx.fill();
      }

      const rowCenterY = y + ITEM_LINE_H / 2;
      const logo = logos.get(item);
      if (logo) {
        ctx.drawImage(logo, MARGIN_X + 16, rowCenterY - ICON_SIZE / 2, ICON_SIZE, ICON_SIZE);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        roundRect(ctx, MARGIN_X + 16, rowCenterY - ICON_SIZE / 2, ICON_SIZE, ICON_SIZE, 6);
        ctx.fill();
      }

      const status = stockLabel(item.stockInfo);
      ctx.font = '600 12px "Poppins Medium"';
      const statusWidth = ctx.measureText(status.text).width;
      const nameMaxWidth = STATUS_COL_X - statusWidth - 24 - NAME_X;

      ctx.textBaseline = 'middle';
      ctx.font = '400 15px "Poppins"';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText(fitText(ctx, item.name, nameMaxWidth), NAME_X, rowCenterY);

      ctx.font = '600 12px "Poppins Medium"';
      ctx.fillStyle = status.muted ? 'rgba(255,255,255,0.35)' : status.dim ? 'rgba(255,255,255,0.5)' : '#ffffff';
      ctx.textAlign = 'right';
      ctx.fillText(status.text, STATUS_COL_X, rowCenterY);

      ctx.font = '700 15px "Poppins Bold"';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${Number(item.price).toFixed(2)}€`, PRICE_COL_X, rowCenterY);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      y += ITEM_LINE_H;
    });
  });

  ctx.font = '400 13px "Poppins"';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.textAlign = 'center';
  ctx.fillText('Vercell — généré automatiquement', W / 2, H - 18);
  ctx.textAlign = 'left';
}

/**
 * @param {string} subtitle sous-titre affiche sous le titre (ex: lien boutique + filtre)
 * @param {Record<string, Array<{name: string, price: number, category: string, logo: string|null, stockInfo: {is_unlimited: boolean, stock: number} | null}>>} byCategory
 */
async function renderStockPng(subtitle, byCategory) {
  const { entries, height } = layoutCategories(byCategory);
  const H = Math.round(HEADER_H + height + FOOTER_H + 30);
  const logos = await preloadLogos(entries);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawStock(ctx, { subtitle, entries, H, logos });
  return canvas.encode('png');
}

module.exports = { renderStockPng };
