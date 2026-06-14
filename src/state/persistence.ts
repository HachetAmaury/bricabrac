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
    // Skip no-op writes so cross-session sync (storage events) can't ping-pong.
    if (localStorage.getItem(key) === next) return;
    localStorage.setItem(key, next);
  } catch {
    // Quota or serialisation failure — silently skip; AppContext shows a banner.
  }
}

export const KEYS = {
  catalog: 'catalog:items',
  categories: 'catalog:categories',
  events: 'events:list',
  activeEventId: 'events:activeId',
  user: 'app:user'
} as const;
