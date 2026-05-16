import { normalizeGift, saveGifts } from './storage.js';

export function cexProductUrl(cexBoxId) {
  if (!cexBoxId) {
    return '';
  }
  return `https://es.webuy.com/product-detail?id=${encodeURIComponent(cexBoxId)}`;
}

export function findWishForWatch(gifts, watch) {
  if (!watch) {
    return null;
  }
  return (
    gifts.find((gift) => gift.cexWatchId === watch.id) ??
    gifts.find((gift) => gift.cexBoxId && gift.cexBoxId === watch.cexBoxId) ??
    null
  );
}

export function isWatchInWishlist(gifts, watch) {
  return Boolean(findWishForWatch(gifts, watch));
}

export function createWishFromWatch(watch) {
  return normalizeGift({
    id: crypto.randomUUID(),
    name: watch.title,
    url: cexProductUrl(watch.cexBoxId),
    price: '',
    isFavorite: false,
    cexWatchId: watch.id,
    cexBoxId: watch.cexBoxId,
    imageUrl: watch.imageUrl,
    addedAt: new Date().toISOString(),
  });
}

export function toggleWishFromWatch(gifts, watch) {
  const existing = findWishForWatch(gifts, watch);
  if (existing) {
    return gifts.filter((gift) => gift.id !== existing.id);
  }
  if (gifts.some((gift) => gift.cexWatchId === watch.id || gift.cexBoxId === watch.cexBoxId)) {
    return gifts;
  }
  return [...gifts, createWishFromWatch(watch)];
}

export function persistGifts(gifts) {
  const normalized = gifts.map(normalizeGift);
  saveGifts(normalized);
  return normalized;
}

export function buildWatchMap(watches) {
  const map = new Map();
  for (const watch of watches ?? []) {
    map.set(watch.id, watch);
  }
  return map;
}

export function resolveWishDisplay(wish, watchById) {
  const linkedWatch = wish.cexWatchId ? watchById.get(wish.cexWatchId) : null;
  const livePrice = linkedWatch?.latestPrice?.sellPrice;

  if (linkedWatch && livePrice != null && !Number.isNaN(livePrice)) {
    return {
      price: livePrice,
      priceLabel: null,
      linked: true,
      orphaned: false,
      watch: linkedWatch,
    };
  }

  if (wish.cexWatchId && !linkedWatch) {
    const manual = parseManualPrice(wish.price);
    return {
      price: manual,
      priceLabel: manual != null ? null : wish.price || null,
      linked: true,
      orphaned: true,
      watch: null,
    };
  }

  const manual = parseManualPrice(wish.price);
  return {
    price: manual,
    priceLabel: wish.price || null,
    linked: false,
    orphaned: false,
    watch: null,
  };
}

export function parseManualPrice(value) {
  if (value == null || value === '') {
    return null;
  }
  const normalized = String(value).replace(',', '.').replace(/[^\d.]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
