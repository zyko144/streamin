const { loadImage } = require('@napi-rs/canvas');

const cache = new Map();

/** Charge un logo de marque (slug Simple Icons) en blanc, de facon fiable.
 *
 * cdn.simpleicons.org bloque les requetes venant de Render (403 confirme
 * en diagnostic direct depuis le bot en prod -- ni un User-Agent
 * navigateur ni des essais repetes ne changent rien, c'est un blocage par
 * IP/datacenter, pas un rate-limit ponctuel). jsDelivr sert exactement les
 * memes SVG (c'est la source officielle du paquet simple-icons) et n'est
 * pas bloque, mais ne fournit pas la coloration par URL : on recupere le
 * SVG brut et on l'injecte nous-memes en blanc avant de le donner a canvas.
 */
async function loadSimpleIcon(slug) {
  if (!slug) return null;
  if (cache.has(slug)) return cache.get(slug);
  try {
    const res = await fetch(`https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${slug}.svg`);
    if (!res.ok) return null;
    const svgText = await res.text();
    const whiteSvg = svgText.replace('<svg ', '<svg fill="#ffffff" ');
    const img = await loadImage(Buffer.from(whiteSvg, 'utf-8'));
    cache.set(slug, img);
    return img;
  } catch {
    return null;
  }
}

module.exports = { loadSimpleIcon };
