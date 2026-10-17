import { supabase } from '../lib/supabase';

export type AdminUsersRequest =
  | { action: 'create'; email: string; password: string; displayName: string; isAdmin: boolean }
  | { action: 'update'; userId: string; displayName?: string; password?: string; isAdmin?: boolean }
  | { action: 'setDisabled'; userId: string; disabled: boolean };

export type AdminUsersResponse = { ok: true; userId?: string } | { ok: false; error: string };

const NETWORK_ERROR = 'Connexion impossible. Vérifiez le réseau.';

function isResponse(v: unknown): v is AdminUsersResponse {
  if (!v || typeof v !== 'object') return false;
  const r = v as { ok?: unknown; error?: unknown };
  return r.ok === true || (r.ok === false && typeof r.error === 'string');
}

/** Calls the `admin-users` Edge Function. Never throws: every failure becomes `{ ok:false, error }`. */
export async function adminUsers(body: AdminUsersRequest): Promise<AdminUsersResponse> {
  try {
    const { data, error } = await supabase.functions.invoke('admin-users', { body });
    if (error) {
      // FunctionsHttpError: non-2xx, JSON body on error.context (a Response).
      const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
      if (context && typeof context.json === 'function') {
        try {
          const parsed = await context.json();
          if (isResponse(parsed)) return parsed;
        } catch {
          // unreadable body: fall through
        }
      }
      return { ok: false, error: NETWORK_ERROR };
    }
    if (isResponse(data)) return data;
    return { ok: false, error: NETWORK_ERROR };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}
