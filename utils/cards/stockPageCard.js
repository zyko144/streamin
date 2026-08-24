require('./fonts');
const { createCanvas } = require('@napi-rs/canvas');
const { roundRect, drawCardBackground, fitText } = require('./draw');
const { getProductLogo } = require('./logos');

const W = 1200;
const MARGIN_X = 40;
const HEADER_H = 130;
const FOOTER_H = 56;
const COLS = 2;
const ITEM_W = 556;
const ITEM_H = 108;
const GAP_X = 24;
const GAP_Y = 18;

function stockLabel(stockInfo) {
  if (!stockInfo || stockInfo.is_unlimited) return { text: 'Illimité', dim: true };
  if (stockInfo.stock <= 0) return { text: 'Rupture', dim: true, muted: true };
  if (stockInfo.stock <= 5) return { text: `Plus que ${stockInfo.stock}`, dim: false };
  return { text: `${stockInfo.stock} en stock`, dim: true };
}

/**
 * Une categorie = une page : grille de produits (logo + nom + statut + prix),
 * navigable via les boutons Precedent/Suivant (voir commands/utility.js).
 * @param {{category: string, items: Array<{name:string, price:number, category:string, logo:string|null, stockInfo: object|null}>, pageIndex: number, pageCount: number}} data
 */
async function renderStockCategoryPage({ category, items, pageIndex, pageCount }) {
  const rows = Math.ceil(items.length / COLS);
  const gridH = rows * ITEM_H + Math.max(0, rows - 1) * GAP_Y;
  const H = HEADER_H + gridH + FOOTER_H + 30;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawCardBackground(ctx, W, H, 28);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  roundRect(ctx, 5, 5, W - 10, H - 10, 24);
  ctx.stroke();
  ctx.restore();

  // Titre categorie
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 34px "Poppins Bold"';
  ctx.fillText(category.toUpperCase(), MARGIN_X, 52);

  ctx.font = '400 16px "Poppins"';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(`${items.length} produit${items.length > 1 ? 's' : ''} · shop-plus-nu.vercel.app`, MARGIN_X, 80);

  // Pastille de pagination en haut a droite
  if (pageCount > 1) {
    const pageLabel = `${pageIndex + 1} / ${pageCount}`;
    ctx.font = '700 16px "Poppins SemiBold"';
    const pw = ctx.measureText(pageLabel).width + 44;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, W - MARGIN_X - pw, 28, pw, 42, 21);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pageLabel, W - MARGIN_X - pw / 2, 49);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN_X, HEADER_H - 10);
  ctx.lineTo(W - MARGIN_X, HEADER_H - 10);
  ctx.stroke();

  const logos = await Promise.all(items.map((item) => getProductLogo(item)));

  items.forEach((item, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = MARGIN_X + col * (ITEM_W + GAP_X);
    const y = HEADER_H + row * (ITEM_H + GAP_Y);

    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    roundRect(ctx, x, y, ITEM_W, ITEM_H, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, ITEM_W, ITEM_H, 18);
    ctx.stroke();

    const logo = logos[i];
    const logoSize = 68;
    const logoX = x + 20;
    const logoY = y + (ITEM_H - logoSize) / 2;
    if (logo) {
      ctx.save();
      ctx.shadowColor = 'rgba(255,255,255,0.4)';
      ctx.shadowBlur = 18;
      const ratio = Math.min(logoSize / logo.width, logoSize / logo.height);
      const dw = logo.width * ratio;
      const dh = logo.height * ratio;
      ctx.drawImage(logo, logoX + (logoSize - dw) / 2, logoY + (logoSize - dh) / 2, dw, dh);
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      roundRect(ctx, logoX, logoY, logoSize, logoSize, 12);
      ctx.fill();
    }

    const textX = logoX + logoSize + 20;
    const priceStr = `${Number(item.price).toFixed(2)}€`;
    ctx.font = '700 19px "Poppins Bold"';
    const priceW = ctx.measureText(priceStr).width;
    const maxTextW = ITEM_W - (textX - x) - 24 - priceW - 16;

    ctx.font = '700 18px "Poppins SemiBold"';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(fitText(ctx, item.name, maxTextW), textX, y + ITEM_H / 2 - 6);

    const status = stockLabel(item.stockInfo);
    ctx.font = '600 13px "Poppins Medium"';
    ctx.fillStyle = status.muted ? 'rgba(255,255,255,0.35)' : status.dim ? 'rgba(255,255,255,0.5)' : '#ffffff';
    ctx.fillText(status.text, textX, y + ITEM_H / 2 + 20);

    ctx.font = '700 19px "Poppins Bold"';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.fillText(priceStr, x + ITEM_W - 20, y + ITEM_H / 2 + 6);
    ctx.textAlign = 'left';
  });

  ctx.font = '400 13px "Poppins"';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.textAlign = 'center';
  ctx.fillText('Vercell — généré automatiquement', W / 2, H - 22);
  ctx.textAlign = 'left';

  return canvas.encode('png');
}

module.exports = { renderStockCategoryPage };
