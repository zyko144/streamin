require('./fonts');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { loadSimpleIcon } = require('./simpleIcon');

const W = 1200;
const H = 700;

const SIMPLEICONS_URL_RE = /^https:\/\/cdn\.simpleicons\.org\/([a-z0-9-]+)\//i;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Un rate de chargement ponctuel (site, image produit externe...) ne doit
 * pas priver la carte de son image pour de bon : deux nouvelles tentatives
 * avant d'abandonner et de rendre la carte sans logo. Les URLs
 * cdn.simpleicons.org (le site les genere pour les logos de marque) sont
 * bloquees par Render (403 systematique, confirme en diagnostic) : on les
 * redirige vers jsDelivr + recoloration (simpleIcon.js) au lieu d'appeler
 * cette URL directement. */
async function safeLoadImage(url) {
  if (!url) return null;
  const simpleIconMatch = url.match(SIMPLEICONS_URL_RE);
  if (simpleIconMatch) return loadSimpleIcon(simpleIconMatch[1]);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await loadImage(url);
    } catch {
      if (attempt < 2) await delay(300);
    }
  }
  return null;
}

/**
 * Carte d'annonce Vercell (boutique) : meme design que celle utilisee cote
 * site, mais rendue ici sur le bot (process Node classique, sans bundler
 * dans les pattes) plutot que dans la fonction serveur du site -- le site
 * appelle /internal/announcement-card pour la generer.
 * @param {{badge: string, name: string, category?: string, price?: string, stock?: string, imageUrl?: string|null}} data
 */
async function renderAnnouncementCard(data) {
  const logo = await safeLoadImage(data.imageUrl);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#050505');
  bg.addColorStop(0.55, '#151515');
  bg.addColorStop(1, '#333333');
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, W, H, 36);
  ctx.fill();

  const glow = ctx.createRadialGradient(W * 0.82, H * 0.12, 10, W * 0.82, H * 0.12, W * 0.55);
  glow.addColorStop(0, 'rgba(255,255,255,0.18)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 3;
  roundRect(ctx, 6, 6, W - 12, H - 12, 32);
  ctx.stroke();
  ctx.restore();

  // Badge type d'annonce
  ctx.font = '700 30px "Poppins Bold"';
  const badgeW = ctx.measureText(data.badge).width + 56;
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  roundRect(ctx, 48, 44, badgeW, 60, 30);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(data.badge, 48 + 28, 44 + 30);
  ctx.textBaseline = 'alphabetic';

  // Logo produit, grand, centre, avec halo
  const logoSize = 280;
  const logoY = 140;
  const logoCx = W / 2;
  if (logo) {
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.55)';
    ctx.shadowBlur = 60;
    const ratio = Math.min(logoSize / logo.width, logoSize / logo.height);
    const dw = logo.width * ratio;
    const dh = logo.height * ratio;
    ctx.drawImage(logo, logoCx - dw / 2, logoY + (logoSize - dh) / 2, dw, dh);
    ctx.restore();
  }

  // Nom du produit
  ctx.font = '700 52px "Poppins Bold"';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  let displayName = data.name;
  while (ctx.measureText(displayName).width > W - 120 && displayName.length > 4) {
    displayName = displayName.slice(0, -1);
  }
  if (displayName !== data.name) displayName = displayName.trimEnd() + '…';
  ctx.fillText(displayName, logoCx, logoY + logoSize + 70);

  // Pills categorie / prix / stock
  const pills = [
    data.category ? { label: data.category } : null,
    data.price ? { label: data.price } : null,
    data.stock ? { label: data.stock } : null,
  ].filter(Boolean);

  if (pills.length) {
    ctx.font = '600 24px "Poppins SemiBold"';
    const gap = 20;
    const widths = pills.map((p) => ctx.measureText(p.label).width + 48);
    const totalW = widths.reduce((a, b) => a + b, 0) + gap * (pills.length - 1);
    let x = logoCx - totalW / 2;
    const pillY = logoY + logoSize + 110;
    pills.forEach((p, i) => {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      roundRect(ctx, x, pillY, widths[i], 52, 26);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, pillY, widths[i], 52, 26);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.label, x + widths[i] / 2, pillY + 27);
      ctx.textBaseline = 'alphabetic';
      x += widths[i] + gap;
    });
  }

  ctx.font = '400 22px "Poppins"';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.textAlign = 'center';
  ctx.fillText('Vercell — annonce automatique · shop-plus-nu.vercel.app', W / 2, H - 34);

  return canvas.encode('png');
}

module.exports = { renderAnnouncementCard };
