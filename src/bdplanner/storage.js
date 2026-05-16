export const STORAGE_KEYS = {
  birthDate: 'bd_planner_birthdate',
  gifts: 'bd_planner_gifts',
};

export function normalizeGift(raw) {
  if (typeof raw === 'string') {
    return {
      id: crypto.randomUUID(),
      name: raw,
      price: '',
      url: '',
      isFavorite: false,
      addedAt: new Date().toISOString(),
    };
  }
  return {
    id: raw.id ?? crypto.randomUUID(),
    name: raw.name ?? '',
    price: raw.price ?? '',
    url: raw.url ?? '',
    isFavorite: Boolean(raw.isFavorite),
    cexWatchId: raw.cexWatchId || undefined,
    cexBoxId: raw.cexBoxId || undefined,
    imageUrl: raw.imageUrl || undefined,
    addedAt: raw.addedAt ?? new Date().toISOString(),
  };
}

export function loadGifts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.gifts) || '[]');
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeGift);
  } catch {
    return [];
  }
}

export function saveGifts(gifts) {
  localStorage.setItem(STORAGE_KEYS.gifts, JSON.stringify(gifts));
}

export function loadBirthDate() {
  return localStorage.getItem(STORAGE_KEYS.birthDate) || '';
}

export function saveBirthDate(value) {
  if (value) {
    localStorage.setItem(STORAGE_KEYS.birthDate, value);
  } else {
    localStorage.removeItem(STORAGE_KEYS.birthDate);
  }
}

export function exportBackup() {
  return {
    birthDate: loadBirthDate(),
    gifts: loadGifts(),
  };
}

export function importBackup(data) {
  if (data.birthDate) {
    saveBirthDate(data.birthDate);
  }
  if (Array.isArray(data.gifts)) {
    saveGifts(data.gifts.map(normalizeGift));
  }
}
