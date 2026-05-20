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
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or serialisation failure — silently skip; AppContext shows a banner.
  }
}

export const KEYS = {
  catalog: 'catalog:items',
  events: 'events:list',
  activeEventId: 'events:activeId'
} as const;
