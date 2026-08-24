const { loadImage } = require('@napi-rs/canvas');
const { loadSimpleIcon } = require('./simpleIcon');

const SHOP_ORIGIN = 'https://shop-plus-nu.vercel.app';
const LOAD_TIMEOUT_MS = 4000;

const cache = new Map();

/** Reproduit la resolution de logo de ProductCard.tsx (site) : URL absolue
 * telle quelle, chemin "/xxx.png" relatif a la boutique, sinon slug Simple
 * Icons (charge via jsDelivr + recoloration, voir simpleIcon.js -- l'URL
 * directe cdn.simpleicons.org est bloquee depuis Render). Quelques
 * categories ont toujours la meme icone quel que soit le produit (comme
 * sur le site). Toujours en blanc pour coller au theme. */
function resolveLogo({ logo, category }) {
  if (category === 'Fortnite') return { type: 'slug', value: 'fortnite' };
  if (category === 'V-Bucks') return { type: 'slug', value: 'epicgames' };
  if (category === 'Discord') return { type: 'slug', value: 'discord' };
  if (!logo) return null;
  if (logo.startsWith('http')) return { type: 'url', value: logo };
  if (logo.startsWith('/')) return { type: 'url', value: `${SHOP_ORIGIN}${logo}` };
  return { type: 'slug', value: logo };
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

/** Charge (et met en cache pour la duree de vie du process) le logo d'un
 * produit. Ne cache jamais un echec : un slug invalide ou un service
 * momentanement indisponible sera retente au prochain /stock plutot que de
 * rester sans icone pour toujours. Ne fait jamais planter le rendu. */
async function getProductLogo(item) {
  const resolved = resolveLogo(item);
  if (!resolved) return null;
  const cacheKey = `${resolved.type}:${resolved.value}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const img =
    resolved.type === 'slug'
      ? await withTimeout(loadSimpleIcon(resolved.value), LOAD_TIMEOUT_MS)
      : await withTimeout(loadImage(resolved.value).catch(() => null), LOAD_TIMEOUT_MS);
  if (img) cache.set(cacheKey, img);
  return img;
}

module.exports = { getProductLogo };
