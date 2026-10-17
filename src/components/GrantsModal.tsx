import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Toggle } from './ui/Toggle';
import { useApp } from '../state/AppContext';
import { supabase } from '../lib/supabase';
import { fetchGrants, setGrant } from '../sync/writes';
import type { Profile } from '../types';

const NETWORK_ERROR = 'Modification impossible. Vérifiez le réseau.';

/** Per-event access for one user. Each toggle writes at once, and reverts if the write fails. */
export function GrantsModal({ user, onClose }: { user: Profile; onClose: () => void }) {
  const { events } = useApp();
  const [granted, setGranted] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchGrants(supabase, user.id).then(
      (ids) => alive && setGranted(new Set(ids)),
      () => alive && setError('Chargement impossible. Vérifiez le réseau.')
    );
    return () => {
      alive = false;
    };
  }, [user.id]);

  const flip = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };

  const toggle = async (eventId: string) => {
    if (!granted || busy.has(eventId)) return;
    const on = !granted.has(eventId);
    setError(null);
    setGranted((g) => g && flip(g, eventId, on));
    setBusy((b) => flip(b, eventId, true));
    try {
      await setGrant(supabase, eventId, user.id, on);
    } catch (err) {
      console.error('[admin] grant failed', err);
      setGranted((g) => g && flip(g, eventId, !on));
      setError(NETWORK_ERROR);
    } finally {
      setBusy((b) => flip(b, eventId, false));
    }
  };

  const sorted = [...events].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  return (
    <Modal open onClose={onClose} title={`Accès aux événements · ${user.displayName}`}>
      {granted === null && !error && <p style={{ color: 'var(--label-secondary)' }}>Chargement…</p>}
      {granted !== null && sorted.length === 0 && (
        <p style={{ color: 'var(--label-secondary)' }}>Aucun événement.</p>
      )}
      {granted !== null && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {sorted.map((e) => (
            <li
              key={e.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 0',
                borderBottom: '0.5px solid var(--separator-opaque)'
              }}
            >
              <span style={{ fontSize: 17 }}>{e.name}</span>
              <Toggle
                checked={granted.has(e.id)}
                disabled={busy.has(e.id)}
                onChange={() => void toggle(e.id)}
                label={`Accès à ${e.name}`}
              />
            </li>
          ))}
        </ul>
      )}
      {error && <p style={{ color: 'var(--ios-red)', margin: '12px 0 0' }}>{error}</p>}
    </Modal>
  );
}
