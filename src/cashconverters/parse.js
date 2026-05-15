const ENTITY_MAP = {
  '&quot;': '"',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&#39;': "'",
  '&apos;': "'",
  '&oacute;': 'ó',
  '&Oacute;': 'Ó',
  '&aacute;': 'á',
  '&Aacute;': 'Á',
  '&eacute;': 'é',
  '&Eacute;': 'É',
  '&iacute;': 'í',
  '&Iacute;': 'Í',
  '&uacute;': 'ú',
  '&Uacute;': 'Ú',
  '&ntilde;': 'ñ',
  '&Ntilde;': 'Ñ',
};

export function decodeHtmlEntities(value) {
  let text = String(value ?? '');
  for (const [entity, char] of Object.entries(ENTITY_MAP)) {
    text = text.split(entity).join(char);
  }
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

export function parseProductDatalayers(html) {
  const layers = [];
  const pattern = /data-product-datalayer="([^"]+)"/g;
  let match = pattern.exec(html);
  while (match) {
    try {
      layers.push(JSON.parse(decodeHtmlEntities(match[1])));
    } catch {
      // skip malformed blocks
    }
    match = pattern.exec(html);
  }
  return layers;
}

/** @param {string|number|null|undefined} raw */
export function parseSpanishPrice(raw) {
  if (raw == null || raw === '') {
    return null;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  const cleaned = String(raw)
    .replace(/\s*€\s*/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function parseStoreModal(html) {
  const titleMatch = html.match(/class="title-address"[^>]*>([^<]+)/i);
  if (titleMatch?.[1]) {
    return decodeHtmlEntities(titleMatch[1].trim());
  }
  const addressMatch = html.match(/<address>[\s\S]*?<span>([^<]+)<\/span>/i);
  if (addressMatch?.[1]) {
    return decodeHtmlEntities(addressMatch[1].trim());
  }
  return null;
}

export function shopCodeFromPid(pid) {
  const parts = String(pid ?? '').split('_');
  return parts[0] ?? null;
}
