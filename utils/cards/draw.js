function roundRect(ctx, x, y, w, h, r) {
  const radius = typeof r === 'number' ? { tl: r, tr: r, br: r, bl: r } : r;
  ctx.beginPath();
  ctx.moveTo(x + radius.tl, y);
  ctx.lineTo(x + w - radius.tr, y);
  ctx.arcTo(x + w, y, x + w, y + radius.tr, radius.tr);
  ctx.lineTo(x + w, y + h - radius.br);
  ctx.arcTo(x + w, y + h, x + w - radius.br, y + h, radius.br);
  ctx.lineTo(x + radius.bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius.bl, radius.bl);
  ctx.lineTo(x, y + radius.tl);
  ctx.arcTo(x, y, x + radius.tl, y, radius.tl);
  ctx.closePath();
}

/** Fond de carte streamIN : noir -> rouge en degrade diagonal, avec un
 * halo rouge dans un coin pour la profondeur. Dessine un rectangle arrondi
 * rempli, pret a recevoir le reste du contenu par dessus. */
function drawCardBackground(ctx, W, H, radius = 24) {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#050505');
  bg.addColorStop(0.55, '#1a0505');
  bg.addColorStop(0.85, '#4d0d0d');
  bg.addColorStop(1, '#8c1414');
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, W, H, radius);
  ctx.fill();

  const glow = ctx.createRadialGradient(W * 0.85, H * 0.1, 10, W * 0.85, H * 0.1, W * 0.5);
  glow.addColorStop(0, 'rgba(255,45,45,0.35)');
  glow.addColorStop(1, 'rgba(255,45,45,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

function clipCircle(ctx, cx, cy, radius) {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
}

/** Tronque un texte a une largeur max en pixels, ajoute "..." si besoin. */
function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(truncated + '…').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '…';
}

module.exports = { roundRect, drawCardBackground, clipCircle, fitText };
