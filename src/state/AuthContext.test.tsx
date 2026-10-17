import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

type Reply = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  keysAtSignOut: null as string[] | null,
  signOut: vi.fn(),
  session: null as unknown,
  refreshSession: vi.fn(),
  emit: null as null | ((event: string, session: unknown) => void),
  profileReply: (): Promise<Reply> => Promise.resolve({ data: null, error: { message: 'Failed to fetch' } }),
}));

vi.mock('../lib/supabase', () => ({
  hasSupabaseConfig: () => true,
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: h.session } }),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        h.emit = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: h.signOut,
      refreshSession: h.refreshSession,
    },
    from: () => ({ select: () => ({ eq: () => ({ single: () => h.profileReply() }) }) }),
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { AuthProvider, LAST_USER_KEY, PROFILE_TIMEOUT_MS, useAuth } from './AuthContext';

let auth: ReturnType<typeof useAuth>;
function Probe() {
  auth = useAuth();
  return null;
}

let container: HTMLDivElement;
let root: Root;
let online = true;

const profileRow = { id: 'u1', display_name: 'Nat', is_admin: true, disabled: false };
const cachedUser = { userId: 'u1', profile: { id: 'u1', displayName: 'Nat', isAdmin: true, disabled: false } };

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });
}

beforeEach(() => {
  localStorage.clear();
  online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  h.session = null;
  h.profileReply = () => Promise.resolve({ data: null, error: { message: 'Failed to fetch' } });
  h.refreshSession.mockReset();
  h.emit = null;
  h.keysAtSignOut = null;
  h.signOut.mockReset().mockImplementation(async () => {
    h.keysAtSignOut = Object.keys(localStorage).sort();
    return { error: null };
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('AuthProvider signOut', () => {
  it('removes the cache keys, active event and last user before signing out, keeping the outbox', async () => {
    await mount();
    localStorage.setItem('cache:events', '[]');
    localStorage.setItem('cache:items', '[]');
    localStorage.setItem('cache:profiles', '[]');
    localStorage.setItem('events:activeId', '"e1"');
    localStorage.setItem('events:list', '[]'); // legacy key, kept for the import
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(cachedUser));
    localStorage.setItem('sync:rejected:u1', '[]');
    await act(() => auth.signOut());
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(h.keysAtSignOut).toEqual(['events:list', 'sync:rejected:u1']);
  });

  it('shows the given reason on the login view afterwards', async () => {
    await mount();
    await act(() => auth.signOut('Compte désactivé.'));
    expect(auth.lastError).toBe('Compte désactivé.');
  });
});

describe('AuthProvider session', () => {
  it('caches the user and profile after a successful profile load', async () => {
    h.session = { user: { id: 'u1' } };
    h.profileReply = () => Promise.resolve({ data: profileRow, error: null });
    await mount();
    expect(auth.status).toBe('signedIn');
    expect(auth.userId).toBe('u1');
    expect(JSON.parse(localStorage.getItem(LAST_USER_KEY)!)).toEqual(cachedUser);
  });

  it('without a session online, shows the login wall even with a cached user', async () => {
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(cachedUser));
    await mount();
    expect(auth.status).toBe('signedOut');
    expect(auth.userId).toBeNull();
  });

  it('offline cold start with a cached user stays signed in with the cached profile', async () => {
    online = false;
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(cachedUser));
    await mount();
    expect(auth.status).toBe('signedIn');
    expect(auth.session).toBeNull();
    expect(auth.userId).toBe('u1');
    expect(auth.profile).toEqual(cachedUser.profile);
  });

  it('back online, a refreshed session replaces the offline user', async () => {
    online = false;
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(cachedUser));
    await mount();
    const session = { user: { id: 'u1' } };
    h.refreshSession.mockResolvedValue({ data: { session }, error: null });
    online = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(h.refreshSession).toHaveBeenCalledTimes(1);
    expect(auth.session).toBe(session);
    expect(auth.status).toBe('signedIn');
  });

  it('back online, a network failure keeps the offline user', async () => {
    online = false;
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(cachedUser));
    await mount();
    h.refreshSession.mockResolvedValue({
      data: { session: null },
      error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 },
    });
    online = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(auth.status).toBe('signedIn');
    expect(localStorage.getItem(LAST_USER_KEY)).not.toBeNull();
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it('back online, a rejected signOut after a revoked token is swallowed', async () => {
    online = false;
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(cachedUser));
    await mount();
    h.signOut.mockRejectedValue(new Error('Failed to fetch'));
    h.refreshSession.mockResolvedValue({
      data: { session: null },
      error: { name: 'AuthApiError', message: 'Invalid Refresh Token: Refresh Token Not Found', status: 400 },
    });
    online = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(auth.status).toBe('signedOut');
    expect(h.signOut).toHaveBeenCalledTimes(1);
  });

  it('back online, a revoked refresh token clears the cache and shows the login wall', async () => {
    online = false;
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(cachedUser));
    localStorage.setItem('cache:events', '[]');
    localStorage.setItem('cache:items', '[]');
    localStorage.setItem('events:activeId', '"e1"');
    localStorage.setItem('sync:outbox:u1', '[]');
    await mount();
    h.refreshSession.mockResolvedValue({
      data: { session: null },
      error: { name: 'AuthApiError', message: 'Invalid Refresh Token: Refresh Token Not Found', status: 400, code: 'refresh_token_not_found' },
    });
    online = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(auth.status).toBe('signedOut');
    expect(auth.lastError).toBe('Session expirée. Reconnectez-vous.');
    expect(localStorage.getItem(LAST_USER_KEY)).toBeNull();
    expect(Object.keys(localStorage).filter((k) => k.startsWith('cache:'))).toEqual([]);
    expect(localStorage.getItem('events:activeId')).toBeNull();
    // Stored tokens go too; the per-account outbox is kept.
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('sync:outbox:u1')).toBe('[]');
  });

  describe('profile fetch timeout', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('a hanging profile fetch falls through to signed in with the cached profile', async () => {
      h.session = { user: { id: 'u1' } };
      h.profileReply = () => new Promise<Reply>(() => {});
      localStorage.setItem(LAST_USER_KEY, JSON.stringify(cachedUser));
      await mount();
      expect(auth.status).toBe('loading');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PROFILE_TIMEOUT_MS);
      });
      expect(auth.status).toBe('signedIn');
      expect(auth.profile).toEqual(cachedUser.profile);
    });

    it('without a cached profile, the timeout signs in with a null profile', async () => {
      h.session = { user: { id: 'u1' } };
      h.profileReply = () => new Promise<Reply>(() => {});
      await mount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PROFILE_TIMEOUT_MS);
      });
      expect(auth.status).toBe('signedIn');
      expect(auth.profile).toBeNull();
    });
  });
});

const pendingSale = (id: string, total: number) => ({
  id: `op-${id}`,
  version: 1,
  kind: 'insertSale',
  eventId: 'e1',
  sale: { id, sellerId: 'u1', timestamp: 1000, lines: [], total },
  status: 'pending',
  attempts: 0,
});

function seedAccountCache() {
  localStorage.setItem('cache:events', '[]');
  localStorage.setItem('cache:items', '[]');
  localStorage.setItem('events:activeId', '"e1"');
}

const cacheKeys = () =>
  Object.keys(localStorage).filter((k) => k.startsWith('cache:') || k === 'events:activeId' || k === LAST_USER_KEY);

describe('AuthProvider SIGNED_OUT from auth-js', () => {
  it('runs the full sign-out cleanup without signing out again', async () => {
    h.session = { user: { id: 'u1' } };
    h.profileReply = () => Promise.resolve({ data: profileRow, error: null });
    await mount();
    seedAccountCache();
    expect(localStorage.getItem(LAST_USER_KEY)).not.toBeNull();
    await act(async () => h.emit!('SIGNED_OUT', null));
    expect(cacheKeys()).toEqual([]);
    expect(auth.status).toBe('signedOut');
    expect(h.signOut).not.toHaveBeenCalled();
    expect(auth.lastError).toBe('Session expirée. Reconnectez-vous.');
  });

  it('keeps the pending sales of the dead session listed, and the outbox stored', async () => {
    h.session = { user: { id: 'u1' } };
    h.profileReply = () => Promise.resolve({ data: profileRow, error: null });
    const outbox = JSON.stringify([pendingSale('s1', 750)]);
    localStorage.setItem('sync:outbox:u1', outbox);
    await mount();
    await act(async () => h.emit!('SIGNED_OUT', null));
    expect(auth.strandedSales.map((r) => [r.sale.id, r.reason])).toEqual([['s1', 'disabled']]);
    expect(localStorage.getItem('sync:outbox:u1')).toBe(outbox);
    act(() => auth.dismissStranded());
    expect(auth.strandedSales).toEqual([]);
  });

  it('a sign-out the user asked for lists nothing', async () => {
    h.session = { user: { id: 'u1' } };
    h.profileReply = () => Promise.resolve({ data: profileRow, error: null });
    localStorage.setItem('sync:outbox:u1', JSON.stringify([pendingSale('s1', 750)]));
    h.signOut.mockImplementation(async () => {
      h.emit!('SIGNED_OUT', null);
      return { error: null };
    });
    await mount();
    await act(() => auth.signOut());
    expect(auth.status).toBe('signedOut');
    expect(auth.strandedSales).toEqual([]);
    expect(auth.lastError).toBeNull();
  });
});

describe('AuthProvider last-user marker', () => {
  it('a session for another user replaces the marker even when its profile fetch fails', async () => {
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(cachedUser));
    h.session = { user: { id: 'u2' } };
    h.profileReply = () => Promise.reject(new Error('Failed to fetch'));
    await mount();
    expect(auth.userId).toBe('u2');
    const marker = localStorage.getItem(LAST_USER_KEY);
    expect(marker === null ? null : JSON.parse(marker).userId).not.toBe('u1');
  });
});

describe('AuthProvider revoked offline session', () => {
  it('lists the pending sales of that account, keeps its outbox, clears the cache', async () => {
    online = false;
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(cachedUser));
    seedAccountCache();
    const outbox = JSON.stringify([pendingSale('s1', 750), pendingSale('s2', 200)]);
    localStorage.setItem('sync:outbox:u1', outbox);
    await mount();
    h.refreshSession.mockResolvedValue({
      data: { session: null },
      error: { name: 'AuthApiError', message: 'User is banned', status: 400, code: 'user_banned' },
    });
    online = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(auth.status).toBe('signedOut');
    expect(auth.strandedSales.map((r) => [r.sale.total, r.reason])).toEqual([
      [750, 'disabled'],
      [200, 'disabled'],
    ]);
    expect(localStorage.getItem('sync:outbox:u1')).toBe(outbox);
    expect(cacheKeys()).toEqual([]);
  });
});
