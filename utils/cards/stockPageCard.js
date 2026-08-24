require('./fonts');
const { createCanvas } = require('@napi-rs/canvas');
const { roundRect, drawCardBackground, fitText } = require('./draw');
const { getProductLogo } = require('./logos');

const W = 1920;
const MARGIN_X = 56;
const HEADER_H = 180;
const FOOTER_H = 74;
const COLS = 4;
const GAP_X = 32;
const GAP_Y = 32;
const CARD_W = Math.floor((W - MARGIN_X * 2 - GAP_X * (COLS - 1)) / COLS);
const CARD_H = 380;
const LOGO_RING = 152;

function hexToRgba(hex, alpha) {
  const h = String(hex || '#ffffff').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, 'f').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function stockLabel(stockInfo) {
  if (!stockInfo || stockInfo.is_unlimited) return { text: 'Illimité', tone: 'ok' };
  if (stockInfo.stock <= 0) return { text: 'Rupture', tone: 'off' };
  if (stockInfo.stock <= 5) return { text: `Plus que ${stockInfo.stock}`, tone: 'warn' };
  return { text: `${stockInfo.stock} en stock`, tone: 'ok' };
}

const TONE_COLORS = { ok: '#ffffff', warn: '#ffd166', off: '#ff5c5c' };

/**
 * Une categorie = une page : grille de grandes cartes produit (logo colore
 * en vedette, nom, statut de stock, prix), navigable via les boutons
 * Precedent/Suivant (voir commands/utility.js). Chaque produit a sa propre
 * carte verticale (comme sur le site) plutot qu'une simple ligne de texte.
 * @param {{category: string, items: Array<{name:string, price:number, category:string, logo:string|null, color?:string, stockInfo: object|null}>, pageIndex: number, pageCount: number}} data
 */
async function renderStockCategoryPage({ category, items, pageIndex, pageCount }) {
  const rows = Math.ceil(items.length / COLS);
  const gridH = rows * CARD_H + Math.max(0, rows - 1) * GAP_Y;
  const H = HEADER_H + gridH + FOOTER_H;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawCardBackground(ctx, W, H, 32);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  roundRect(ctx, 5, 5, W - 10, H - 10, 28);
  ctx.stroke();
  ctx.restore();

  // Titre categorie
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 58px "Poppins Bold"';
  ctx.fillText(category.toUpperCase(), MARGIN_X, 82);

  ctx.font = '400 24px "Poppins"';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(`${items.length} produit${items.length > 1 ? 's' : ''} · shop-plus-nu.vercel.app`, MARGIN_X, 120);

  // Pastille de pagination en haut a droite
  if (pageCount > 1) {
    const pageLabel = `${pageIndex + 1} / ${pageCount}`;
    ctx.font = '700 24px "Poppins SemiBold"';
    const pw = ctx.measureText(pageLabel).width + 60;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    roundRect(ctx, W - MARGIN_X - pw, 46, pw, 58, 29);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pageLabel, W - MARGIN_X - pw / 2, 75);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN_X, HEADER_H - 24);
  ctx.lineTo(W - MARGIN_X, HEADER_H - 24);
  ctx.stroke();

  const logos = await Promise.all(items.map((item) => getProductLogo(item)));

  items.forEach((item, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = MARGIN_X + col * (CARD_W + GAP_X);
    const y = HEADER_H + row * (CARD_H + GAP_Y);
    const color = item.color || '#ffffff';
    const cx = x + CARD_W / 2;

    // Carte
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    roundRect(ctx, x, y, CARD_W, CARD_H, 28);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, CARD_W, CARD_H, 28);
    ctx.stroke();

    // Halo colore derriere le logo (couleur reelle du produit)
    const ringCy = y + 40 + LOGO_RING / 2;
    const glow = ctx.createRadialGradient(cx, ringCy, 4, cx, ringCy, LOGO_RING * 0.9);
    glow.addColorStop(0, hexToRgba(color, 0.35));
    glow.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, ringCy, LOGO_RING * 0.9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hexToRgba(color, 0.14);
    ctx.beginPath();
    ctx.arc(cx, ringCy, LOGO_RING / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(color, 0.4);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, ringCy, LOGO_RING / 2, 0, Math.PI * 2);
    ctx.stroke();

    const logo = logos[i];
    const logoSize = 92;
    if (logo) {
      ctx.save();
      ctx.shadowColor = hexToRgba(color, 0.7);
      ctx.shadowBlur = 26;
      const ratio = Math.min(logoSize / logo.width, logoSize / logo.height);
      const dw = logo.width * ratio;
      const dh = logo.height * ratio;
      ctx.drawImage(logo, cx - dw / 2, ringCy - dh / 2, dw, dh);
      ctx.restore();
    } else {
      // Pas de logo trouve : initiale du produit dans sa couleur plutot
      // qu'une icone (les emoji ne sont pas supportes par les polices
      // embarquees de la carte, voir fonts.js).
      ctx.font = '700 58px "Poppins Bold"';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((item.name || '?').trim().charAt(0).toUpperCase(), cx, ringCy);
      ctx.textBaseline = 'alphabetic';
    }

    // Nom du produit
    const textY = y + 40 + LOGO_RING + 54;
    ctx.font = '700 27px "Poppins Bold"';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(fitText(ctx, item.name, CARD_W - 48), cx, textY);

    // Statut de stock (pastille)
    const status = stockLabel(item.stockInfo);
    ctx.font = '600 17px "Poppins Medium"';
    const statusColor = TONE_COLORS[status.tone];
    const statusW = ctx.measureText(status.text).width + 38;
    const statusY = textY + 30;
    ctx.fillStyle = status.tone === 'off' ? 'rgba(255,92,92,0.12)' : status.tone === 'warn' ? 'rgba(255,209,102,0.12)' : 'rgba(255,255,255,0.08)';
    roundRect(ctx, cx - statusW / 2, statusY, statusW, 40, 20);
    ctx.fill();
    ctx.fillStyle = statusColor;
    ctx.textBaseline = 'middle';
    ctx.fillText(status.text, cx, statusY + 20);
    ctx.textBaseline = 'alphabetic';

    // Prix, en grand, en bas de carte
    const priceStr = `${Number(item.price).toFixed(2)}€`;
    ctx.font = '700 36px "Poppins Bold"';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(priceStr, cx, y + CARD_H - 34);
    ctx.textAlign = 'left';
  });

  ctx.font = '400 18px "Poppins"';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.textAlign = 'center';
  ctx.fillText('Vercell — généré automatiquement', W / 2, H - 30);
  ctx.textAlign = 'left';

  return canvas.encode('png');
}

module.exports = { renderStockCategoryPage };
