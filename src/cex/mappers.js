const GRADE_PATTERN = /\bgrado\s*([abc])\b|\bgrade\s*([abc])\b|\b([abc])\s*grade\b/i;
const STORAGE_PATTERN = /\b(\d{2,4})\s*gb\b/i;
const UNLOCKED_PATTERN = /\b(unlocked|desbloquead[oa]|libre)\b/i;

export function parseVariantFromTitle(title = '') {
  const gradeMatch = title.match(GRADE_PATTERN);
  const storageMatch = title.match(STORAGE_PATTERN);
  const grade = (gradeMatch?.[1] ?? gradeMatch?.[2] ?? gradeMatch?.[3] ?? '').toUpperCase() || null;
  const storageGb = storageMatch ? Number.parseInt(storageMatch[1], 10) : null;
  const unlocked = UNLOCKED_PATTERN.test(title);

  const parts = [];
  if (storageGb) {
    parts.push(`${storageGb} GB`);
  }
  if (grade) {
    parts.push(`Grado ${grade}`);
  }
  if (unlocked) {
    parts.push('Desbloqueado');
  }

  return {
    grade,
    storageGb,
    unlocked,
    variantLabel: parts.length > 0 ? parts.join(' · ') : null,
  };
}

function pickImageUrl(box) {
  if (typeof box?.imageUrl === 'string') {
    return box.imageUrl;
  }
  if (typeof box?.boxLargeImage === 'string') {
    return box.boxLargeImage;
  }
  if (Array.isArray(box?.imageUrls) && box.imageUrls.length > 0) {
    return box.imageUrls[0];
  }
  if (box?.imageUrls && typeof box.imageUrls === 'object') {
    const values = Object.values(box.imageUrls);
    if (values.length > 0 && typeof values[0] === 'string') {
      return values[0];
    }
  }
  return null;
}

function parsePrice(value) {
  if (value == null || value === '') {
    return null;
  }
  const amount = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(amount) ? amount : null;
}

export function mapAlgoliaHit(hit) {
  const gradeFromFacet = Array.isArray(hit?.Grado) ? hit.Grado[0] : hit?.Grado;
  return mapBox({
    ...hit,
    grade: gradeFromFacet ?? hit?.grade,
    cashPrice: hit?.cashPriceCalculated ?? hit?.cashPrice,
    stockQty: hit?.ecomQuantity ?? hit?.collectionQuantity,
    stockStatus: hit?.outOfStock?.length ? 'in stock' : hit?.availability?.[0] ?? null,
  });
}

export function mapBox(raw) {
  const title = raw?.boxName ?? raw?.boxDescription ?? raw?.title ?? 'Producto CeX';
  const variant = parseVariantFromTitle(title);
  const boxId = String(raw?.boxId ?? raw?.id ?? raw?.objectID ?? '');

  return {
    boxId,
    title,
    sellPrice: parsePrice(raw?.sellPrice ?? raw?.sellprice),
    cashPrice: parsePrice(raw?.cashPrice ?? raw?.cashprice ?? raw?.cashPriceCalculated),
    imageUrl: pickImageUrl(raw),
    grade: raw?.grade ?? variant.grade,
    storageGb: variant.storageGb,
    color: raw?.color ?? null,
    variantLabel: variant.variantLabel,
    stockStatus: raw?.stockStatus ?? raw?.stock_status ?? null,
    stockQuantity: raw?.stockQty ?? raw?.stock_quantity ?? null,
    productUrl: raw?.boxLink ?? raw?.productUrl ?? (boxId ? `https://es.webuy.com/product-detail?id=${boxId}` : null),
  };
}

export function mapBoxesResponse(payload) {
  const data = payload?.response?.data ?? payload?.data ?? payload;
  const boxes = data?.boxes ?? data?.boxList ?? data?.results ?? [];
  if (!Array.isArray(boxes)) {
    return [];
  }
  return boxes.map(mapBox).filter((box) => box.boxId);
}

export function mapStoresFromDetail(payload) {
  const data = payload?.response?.data ?? payload?.data ?? payload;
  const stockDetails = data?.stockDetails;
  if (Array.isArray(stockDetails) && stockDetails.length > 0) {
    return stockDetails.map((store) => {
      const quantity = Number(store?.quantityOnHand ?? store?.collectionQuantity ?? 0);
      return {
        storeId: String(store?.storeId ?? store?.storeName ?? crypto.randomUUID()),
        storeName: store?.storeName ?? 'Tienda CeX',
        inStock: quantity > 0 || store?.isAvailableForCollection === 1,
        quantity: quantity || null,
      };
    });
  }

  const stores =
    data?.stores ??
    data?.storeAvailability ??
    data?.availability ??
    data?.stockByStore ??
    [];

  if (!Array.isArray(stores)) {
    const onlineStock = data?.stockQty ?? data?.stockQuantity ?? data?.webStock;
    if (onlineStock != null) {
      return [
        {
          storeId: 'online',
          storeName: 'CeX online',
          inStock: Number(onlineStock) > 0,
          quantity: Number(onlineStock) || 0,
        },
      ];
    }
    return [];
  }

  return stores.map((store) => ({
    storeId: String(store?.storeId ?? store?.id ?? store?.storeName ?? crypto.randomUUID()),
    storeName: store?.storeName ?? store?.name ?? 'Tienda CeX',
    inStock: Boolean(
      store?.inStock ?? ((Number(store?.stockQty) > 0) || (Number(store?.quantity) > 0)),
    ),
    quantity:
      store?.stockQty != null
        ? Number(store.stockQty)
        : store?.quantity != null
          ? Number(store.quantity)
          : null,
  }));
}

export function mapBoxDetail(payload) {
  const data = payload?.response?.data ?? payload?.data ?? payload;
  const box = data?.boxDetails?.[0] ?? data?.box ?? data?.boxes?.[0] ?? data;
  const mapped = mapBox(box);
  const stores = mapStoresFromDetail(payload);
  return { ...mapped, stores };
}
