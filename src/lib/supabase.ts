import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type { Database };

type Tables = Database['public']['Tables'];
export type ProfileRow = Tables['profiles']['Row'];
export type CatalogRow = Tables['catalogs']['Row'];
export type CategoryRow = Tables['categories']['Row'];
export type ItemRow = Tables['items']['Row'];
export type EventRow = Tables['events']['Row'];
export type EventItemRow = Tables['event_items']['Row'];
export type EventMemberRow = Tables['event_members']['Row'];
export type SaleRow = Tables['sales']['Row'];

/** Read at call time so tests can stub env vars. */
export function hasSupabaseConfig(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
}

// Fallbacks keep imports working (tests, unconfigured builds); check hasSupabaseConfig() before use.
export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL || 'http://localhost',
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'anon',
  { auth: { persistSession: true, autoRefreshToken: true } },
);
