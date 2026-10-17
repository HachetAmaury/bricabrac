import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const h = vi.hoisted(() => ({
  keysAtSignOut: null as string[] | null,
  signOut: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  hasSupabaseConfig: () => true,
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: h.signOut,
    },
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { AuthProvider, useAuth } from './AuthContext';

let auth: ReturnType<typeof useAuth>;
function Probe() {
  auth = useAuth();
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  localStorage.clear();
  h.keysAtSignOut = null;
  h.signOut.mockReset().mockImplementation(async () => {
    h.keysAtSignOut = Object.keys(localStorage).sort();
    return { error: null };
  });
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
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('AuthProvider signOut', () => {
  it('removes the cache keys and active event before signing out', async () => {
    localStorage.setItem('cache:events', '[]');
    localStorage.setItem('cache:items', '[]');
    localStorage.setItem('cache:profiles', '[]');
    localStorage.setItem('events:activeId', '"e1"');
    localStorage.setItem('events:list', '[]'); // legacy key, kept for the import
    await act(() => auth.signOut());
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(h.keysAtSignOut).toEqual(['events:list']);
    expect(Object.keys(localStorage)).toEqual(['events:list']);
  });
});
