import type { Item, Category, SaleEvent } from '../types';

// The shape produced by the "Exporter" action in the drawer. Importing accepts
// exactly this payload back so a backup round-trips cleanly.
export type Backup = {
  catalog: Item[];
  categories: Category[];
  events: SaleEvent[];
};

export type ParseResult =
  | { ok: true; data: Backup }
  | { ok: false; error: string };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isItem(v: unknown): v is Item {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.price === 'number'
  );
}

function isCategory(v: unknown): v is Category {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.color === 'string'
  );
}

function isEvent(v: unknown): v is SaleEvent {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    Array.isArray(v.enabledItemIds) &&
    Array.isArray(v.sales)
  );
}

const FORMAT_ERROR = 'Format de sauvegarde non reconnu.';

// Parse and validate a backup file's text. Validation stays lightweight but
// rejects anything that isn't a recognisable bric-à-brac export so a bad file
// can never silently wipe the user's real data.
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Fichier illisible (JSON invalide).' };
  }

  if (!isObject(raw)) return { ok: false, error: FORMAT_ERROR };
  const { catalog, categories, events } = raw;

  if (!Array.isArray(catalog) || !Array.isArray(categories) || !Array.isArray(events)) {
    return { ok: false, error: FORMAT_ERROR };
  }
  if (!catalog.every(isItem) || !categories.every(isCategory) || !events.every(isEvent)) {
    return { ok: false, error: FORMAT_ERROR };
  }

  return { ok: true, data: { catalog, categories, events } };
}
