import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import { adminUsers, type AdminUsersRequest } from './adminApi';

const createBody: AdminUsersRequest = {
  action: 'create',
  email: 'marie@example.fr',
  password: 'secret123',
  displayName: 'Marie',
  isAdmin: false,
};

beforeEach(() => {
  invoke.mockReset();
});

describe('adminUsers', () => {
  it('forwards the body verbatim to the admin-users function', async () => {
    invoke.mockResolvedValue({ data: { ok: true, userId: 'u9' }, error: null });
    await adminUsers(createBody);
    expect(invoke).toHaveBeenCalledWith('admin-users', { body: createBody });
  });

  it('returns the server { ok:true, userId }', async () => {
    invoke.mockResolvedValue({ data: { ok: true, userId: 'u9' }, error: null });
    await expect(adminUsers(createBody)).resolves.toEqual({ ok: true, userId: 'u9' });
  });

  it('unwraps a FunctionsHttpError body into { ok:false, error }', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { context: { json: async () => ({ ok: false, error: 'Réservé aux administrateurs.' }) } },
    });
    await expect(adminUsers({ action: 'setDisabled', userId: 'u2', disabled: true })).resolves.toEqual({
      ok: false,
      error: 'Réservé aux administrateurs.',
    });
  });

  it('maps a thrown network error to the connection message', async () => {
    invoke.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(adminUsers(createBody)).resolves.toEqual({
      ok: false,
      error: 'Connexion impossible. Vérifiez le réseau.',
    });
  });

  it('maps an error without a readable body to the connection message', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'Failed to send a request', context: {} } });
    await expect(adminUsers(createBody)).resolves.toEqual({
      ok: false,
      error: 'Connexion impossible. Vérifiez le réseau.',
    });
  });
});
