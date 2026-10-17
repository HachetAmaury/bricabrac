import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasSupabaseConfig } from './supabase';

describe('hasSupabaseConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is false when env vars are missing', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    expect(hasSupabaseConfig()).toBe(false);
  });

  it('is false when only the url is set', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    expect(hasSupabaseConfig()).toBe(false);
  });

  it('is true when both are set', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    expect(hasSupabaseConfig()).toBe(true);
  });
});
