/** Genera consultas alternativas cuando la búsqueda exacta devuelve pocos resultados. */
export function buildAlternateQueries(query) {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (normalized.length < 2) {
    return [];
  }

  const variants = new Set();
  const withoutStorage = normalized.replace(/\b\d+\s*(gb|tb)\b/gi, '').replace(/\s+/g, ' ').trim();
  if (withoutStorage && withoutStorage !== normalized) {
    variants.add(withoutStorage);
  }

  const withoutTrailingVersion = normalized.replace(/\s+\d+\s*$/i, '').trim();
  if (withoutTrailingVersion && withoutTrailingVersion !== normalized) {
    variants.add(withoutTrailingVersion);
  }

  if (normalized.includes('galaxy')) {
    variants.add(normalized.replace(/\bsamsung\s+/g, ''));
    if (!normalized.includes('samsung')) {
      variants.add(`samsung ${normalized}`);
    }
  }

  if (/fold/i.test(normalized)) {
    const zFold = normalized.match(/z\s*fold\s*(\d+)?/i);
    const fold = normalized.match(/fold\s*(\d+)?/i);
    const version = zFold?.[1] ?? fold?.[1];
    variants.add(`z fold ${version ?? ''}`.trim());
    variants.add('samsung fold');
    if (version) {
      variants.add(`fold ${version}`);
    }
  }

  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.length > 3) {
    variants.add(tokens.slice(1).join(' '));
  }

  return [...variants].filter((value) => value.length >= 2 && value !== normalized).slice(0, 4);
}
