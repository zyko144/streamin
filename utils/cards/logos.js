const { loadImage } = require('@napi-rs/canvas');

const SHOP_ORIGIN = 'https://shop-plus-nu.vercel.app';
const LOAD_TIMEOUT_MS = 4000;

const cache = new Map();

/** Reproduit la resolution de logo de ProductCard.tsx (site) : URL absolue
 * telle quelle, chemin "/xxx.png" relatif a la boutique, sinon slug Simple
 * Icons. Quelques categories ont toujours la meme icone quel que soit le
 * produit (comme sur le site). Toujours en blanc pour coller au theme. */
function resolveLogoUrl({ logo, category }) {
  if (category === 'Fortnite') return 'https://cdn.simpleicons.org/fortnite/ffffff';
  if (category === 'V-Bucks') return 'https://cdn.simpleicons.org/epicgames/ffffff';
  if (category === 'Discord') return 'https://cdn.simpleicons.org/discord/ffffff';
  if (!logo) return null;
  if (logo.startsWith('http')) return logo;
  if (logo.startsWith('/')) return `${SHOP_ORIGIN}${logo}`;
  return `https://cdn.simpleicons.org/${logo}/ffffff`;
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

/** Charge (et met en cache pour la duree de vie du process) le logo d'un
 * produit. Ne cache jamais un echec : un slug invalide ou un service
 * momentanement indisponible sera retente au prochain /stock plutot que de
 * rester sans icone pour toujours. Ne fait jamais planter le rendu. */
async function getProductLogo(item) {
  const url = resolveLogoUrl(item);
  if (!url) return null;
  if (cache.has(url)) return cache.get(url);
  const img = await withTimeout(loadImage(url).catch(() => null), LOAD_TIMEOUT_MS);
  if (img) cache.set(url, img);
  return img;
}

module.exports = { getProductLogo, resolveLogoUrl };
