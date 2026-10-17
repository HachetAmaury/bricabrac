export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON<T>(key: string, value: T): void {
  try {
    const next = JSON.stringify(value);
    // Skip redundant writes: the cache is re-saved on every state change, often unchanged.
    if (localStorage.getItem(key) === next) return;
    localStorage.setItem(key, next);
  } catch {
    // Quota or serialisation failure — silently skip; AppContext shows a banner.
  }
}

export const KEYS = {
  catalogs: 'cache:catalogs',
  items: 'cache:items',
  categories: 'cache:categories',
  events: 'cache:events',
  profiles: 'cache:profiles',
  activeEventId: 'events:activeId'
} as const;

/** Pre-Supabase localStorage keys, read once by the legacy import (Task 10). */
export const LEGACY_KEYS = {
  catalog: 'catalog:items',
  categories: 'catalog:categories',
  events: 'events:list',
  user: 'app:user'
} as const;
