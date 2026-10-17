import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, hasSupabaseConfig } from '../lib/supabase';
import type { Profile } from '../types';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

type AuthValue = {
  status: AuthStatus;
  session: Session | null;
  profile: Profile | null;
  /** Set when a session was rejected after sign-in (e.g. disabled profile). */
  lastError: string | null;
  signIn(email: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

const MSG_BAD_CREDENTIALS = 'Email ou mot de passe incorrect.';
const MSG_DISABLED = 'Compte désactivé.';
const MSG_NETWORK = 'Connexion impossible. Vérifiez le réseau.';

function errorMessage(code: string | undefined): string {
  if (code === 'user_banned') return MSG_DISABLED;
  if (code === 'invalid_credentials') return MSG_BAD_CREDENTIALS;
  return MSG_NETWORK;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = hasSupabaseConfig();
  const [sessionKnown, setSessionKnown] = useState(!configured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  // User id whose profile lookup has settled (success or failure).
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession((prev) => prev ?? data.session);
      setSessionKnown(true);
    }).catch(() => {
      if (active) setSessionKnown(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setSessionKnown(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [configured]);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setResolvedUserId(null);
      return;
    }
    let active = true;
    supabase
      .from('profiles')
      .select()
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) {
          // Unknown profile (e.g. offline): stay signed in, do not sign out.
          setProfile(null);
        } else if (data.disabled) {
          setLastError(MSG_DISABLED);
          void supabase.auth.signOut();
          return;
        } else {
          setProfile({
            id: data.id,
            displayName: data.display_name,
            isAdmin: data.is_admin,
            disabled: data.disabled
          });
        }
        setResolvedUserId(userId);
      }, () => {
        if (!active) return;
        setProfile(null);
        setResolvedUserId(userId);
      });
    return () => {
      active = false;
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

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const status: AuthStatus = !sessionKnown
    ? 'loading'
    : !session
      ? 'signedOut'
      : resolvedUserId === session.user.id
        ? 'signedIn'
        : 'loading';

  const value = useMemo<AuthValue>(
    () => ({ status, session, profile, lastError, signIn, signOut }),
    [status, session, profile, lastError, signIn, signOut]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
