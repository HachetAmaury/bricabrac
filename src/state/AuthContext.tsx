import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, hasSupabaseConfig } from '../lib/supabase';
import type { Profile } from '../types';
import { KEYS } from './persistence';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

type AuthValue = {
  status: AuthStatus;
  /** Null while signed in offline from the last-user cache (no usable token yet). */
  session: Session | null;
  /** The signed-in user's id: from the session, or from the last-user cache offline. */
  userId: string | null;
  profile: Profile | null;
  /** Set when a session was rejected after sign-in (e.g. disabled profile). */
  lastError: string | null;
  signIn(email: string, password: string): Promise<string | null>;
  /** `reason` is shown on the login view afterwards. */
  signOut(reason?: string): Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

/** Last signed-in user, so a cold start offline (expired token) can still sell. */
export const LAST_USER_KEY = 'auth:last-user';
/** A profile fetch that hangs longer than this falls through to signed in with the cached profile. */
export const PROFILE_TIMEOUT_MS = 10_000;

type LastUser = { userId: string; profile: Profile | null };

function loadLastUser(): LastUser | null {
  try {
    const raw = localStorage.getItem(LAST_USER_KEY);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof (parsed as LastUser).userId === 'string') {
      const p = parsed as LastUser;
      return { userId: p.userId, profile: p.profile ?? null };
    }
  } catch {
    // Unreadable cache: behave as if there was none.
  }
  return null;
}

function saveLastUser(u: LastUser): void {
  try {
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(u));
  } catch {
    // Storage full or blocked: offline cold start will need the network.
  }
}

function clearLastUser(): void {
  try {
    localStorage.removeItem(LAST_USER_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

/**
 * Drops this account's cached data so the next account on the device starts
 * clean. Outbox and rejected lists (`sync:*:<uid>`) are kept: they are per
 * account and hold sales that never reached the server.
 */
function clearAccountCache(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('cache:') || key === KEYS.activeEventId) localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable: nothing cached to clear.
  }
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** True when a refresh failed for lack of network (retry later), not because the session is dead. */
function isNetworkFailure(error: unknown): boolean {
  if (isOffline()) return true;
  const e = error as { name?: unknown; message?: unknown; status?: unknown } | null | undefined;
  if (!e) return false;
  if (e.name === 'AuthRetryableFetchError' || e.status === 0) return true;
  return typeof e.message === 'string' && /fetch failed|Failed to fetch|NetworkError|Load failed/i.test(e.message);
}

const MSG_BAD_CREDENTIALS = 'Email ou mot de passe incorrect.';
const MSG_DISABLED = 'Compte désactivé.';
const MSG_NETWORK = 'Connexion impossible. Vérifiez le réseau.';
const MSG_EXPIRED = 'Session expirée. Reconnectez-vous.';

function errorMessage(code: string | undefined): string {
  if (code === 'user_banned') return MSG_DISABLED;
  if (code === 'invalid_credentials') return MSG_BAD_CREDENTIALS;
  return MSG_NETWORK;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = hasSupabaseConfig();
  const [sessionKnown, setSessionKnown] = useState(!configured);
  const [session, setSession] = useState<Session | null>(null);
  // Signed in from the last-user cache: no session (refresh failed offline).
  const [offlineUser, setOfflineUser] = useState<LastUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  // User id whose profile lookup has settled (success, failure or timeout).
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    let active = true;
    // auth-js yields no session when the token expired and the refresh failed,
    // which it always does offline: fall back to the last signed-in user.
    const noSession = () => {
      const cached = isOffline() ? loadLastUser() : null;
      if (cached) setOfflineUser((prev) => prev ?? cached);
    };
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession((prev) => prev ?? data.session);
      if (data.session) setOfflineUser(null);
      else noSession();
      setSessionKnown(true);
    }).catch(() => {
      if (!active) return;
      noSession();
      setSessionKnown(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (next) setOfflineUser(null);
      else if (event === 'INITIAL_SESSION') noSession();
      else setOfflineUser(null);
      setSessionKnown(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [configured]);

  // Signed in offline: once the network is back, get a real session or end it.
  const offlineMode = offlineUser !== null && session === null;
  useEffect(() => {
    if (!offlineMode) return;
    let active = true;
    const recover = async () => {
      let result: { data: { session: Session | null }; error: unknown };
      try {
        result = await supabase.auth.refreshSession();
      } catch (err) {
        result = { data: { session: null }, error: err };
      }
      if (!active) return;
      if (result.data.session) {
        setSession(result.data.session);
        setOfflineUser(null);
        return;
      }
      if (isNetworkFailure(result.error)) return; // try again on the next 'online'
      // The session is dead: same cleanup as signOut, stored tokens included.
      clearAccountCache();
      clearLastUser();
      setOfflineUser(null);
      const code = (result.error as { code?: unknown } | null)?.code;
      setLastError(code === 'user_banned' ? MSG_DISABLED : MSG_EXPIRED);
      try {
        await supabase.auth.signOut();
      } catch {
        // Already gone server-side or unreachable: the local state is cleared above.
      }
    };
    const onOnline = () => void recover();
    window.addEventListener('online', onOnline);
    return () => {
      active = false;
      window.removeEventListener('online', onOnline);
    };
  }, [offlineMode]);

  const userId = session?.user.id ?? offlineUser?.userId ?? null;

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setResolvedUserId(null);
      return;
    }
    let active = true;
    // Unknown profile (offline, error, timeout): stay signed in with the cached one.
    const fallBack = () => {
      if (!active) return;
      const cached = loadLastUser();
      setProfile(cached?.userId === userId ? cached.profile : null);
      setResolvedUserId(userId);
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('profile fetch timed out')), PROFILE_TIMEOUT_MS);
    });
    Promise.race([supabase.from('profiles').select().eq('id', userId).single(), timeout])
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) return fallBack();
        const next: Profile = {
          id: data.id,
          displayName: data.display_name,
          isAdmin: data.is_admin,
          disabled: data.disabled
        };
        // A disabled profile is handed to AppProvider: it lists the pending
        // sales as rejected, then signs out.
        if (!next.disabled) saveLastUser({ userId, profile: next });
        setProfile(next);
        setResolvedUserId(userId);
      }, fallBack)
      .finally(() => clearTimeout(timer));
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [userId]);

  const signIn = useCallback(async (email: string, password: string) => {
    setLastError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? errorMessage(error.code) : null;
    } catch {
      return MSG_NETWORK;
    }
  }, []);

  const signOut = useCallback(async (reason?: string) => {
    clearAccountCache();
    clearLastUser();
    setOfflineUser(null);
    if (reason) setLastError(reason);
    await supabase.auth.signOut();
  }, []);

  const status: AuthStatus = !sessionKnown
    ? 'loading'
    : !userId
      ? 'signedOut'
      : resolvedUserId === userId
        ? 'signedIn'
        : 'loading';

  const value = useMemo<AuthValue>(
    () => ({ status, session, userId, profile, lastError, signIn, signOut }),
    [status, session, userId, profile, lastError, signIn, signOut]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
