const { loadImage } = require('@napi-rs/canvas');

const cache = new Map();

// Taille de rasterisation forcee du SVG (pixels). Simple Icons a un viewBox
// 24x24 : sans cette contrainte, @napi-rs/canvas rasterise l'image a 24x24
// puis canvas l'agrandit en pixelisant a mort quand on la dessine en grand
// sur la carte (280px). En forcant width/height eleves sur le SVG avant de
// le charger, il est rasterise nativement en haute resolution -- net a
// n'importe quelle taille d'affichage raisonnable.
const RENDER_SIZE = 512;

function normalizeColor(color) {
  const hex = String(color || 'ffffff').replace('#', '');
  return /^[0-9a-f]{3,8}$/i.test(hex) ? hex : 'ffffff';
}

/** Charge un logo de marque (slug Simple Icons), net, dans sa vraie couleur,
 * de facon fiable.
 *
 * cdn.simpleicons.org bloque les requetes venant de Render (403 confirme
 * en diagnostic direct depuis le bot en prod -- ni un User-Agent
 * navigateur ni des essais repetes ne changent rien, c'est un blocage par
 * IP/datacenter, pas un rate-limit ponctuel). jsDelivr sert exactement les
 * memes SVG (c'est la source officielle du paquet simple-icons) et n'est
 * pas bloque, mais ne fournit pas la coloration par URL : on recupere le
 * SVG brut et on l'injecte nous-memes avant de le donner a canvas.
 */
async function loadSimpleIcon(slug, color) {
  if (!slug) return null;
  const hex = normalizeColor(color);
  const cacheKey = `${slug}:${hex}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  try {
    const res = await fetch(`https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${slug}.svg`);
    if (!res.ok) return null;
    const svgText = await res.text();
    const coloredSvg = svgText.replace('<svg ', `<svg width="${RENDER_SIZE}" height="${RENDER_SIZE}" fill="#${hex}" `);
    const img = await loadImage(Buffer.from(coloredSvg, 'utf-8'));
    cache.set(cacheKey, img);
    return img;
  } catch {
    return null;
  }
}

module.exports = { loadSimpleIcon };
