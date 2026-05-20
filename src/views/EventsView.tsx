import { useState } from 'react';
import { useApp } from '../state/AppContext';
import { Modal } from '../components/Modal';
import { formatCents } from '../lib/money';
import type { EventKind, SaleEvent } from '../types';

const KIND_LABELS: Record<EventKind, string> = {
  tournoi: 'Tournoi',
  'bric-a-brac': 'Bric-à-brac',
  autre: 'Autre'
};

export function EventsView() {
  const { events, activeEventId, setActiveEvent, dispatchEvents, activeEvent } = useApp();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<SaleEvent | null>(null);

  return (
    <div style={{ padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Événements</h1>
        <button
          onClick={() => setCreating(true)}
          style={{
            background: 'var(--color-accent)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '8px 12px'
          }}
        >
          + Nouvel événement
        </button>
      </header>

      {events.length === 0 && (
        <p style={{ color: 'var(--color-muted)', marginTop: 24 }}>
          Aucun événement. Créez-en un pour commencer.
        </p>
      )}

      <ul style={{ listStyle: 'none', padding: 0, marginTop: 16 }}>
        {events.map((e) => {
          const total = e.sales.reduce((acc, s) => acc + s.total, 0);
          const isActive = e.id === activeEventId;
          return (
            <li
              key={e.id}
              style={{
                padding: 12,
                borderRadius: 8,
                marginBottom: 8,
                background: isActive ? 'rgba(37, 99, 235, 0.08)' : '#fff',
                border: isActive ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <button
                onClick={() => setActiveEvent(e.id)}
                style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none' }}
              >
                <div style={{ fontWeight: 600 }}>{e.name}</div>
                <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                  {KIND_LABELS[e.kind]} · {e.sales.length} vente(s) · {formatCents(total)}
                </div>
              </button>
              <button onClick={() => setRenaming(e)}>Renommer</button>
              <button
                onClick={() => {
                  if (confirm(`Supprimer "${e.name}" et toutes ses ventes ?`)) {
                    dispatchEvents({ type: 'delete', id: e.id });
                  }
                }}
                style={{ color: 'var(--color-danger)' }}
              >
                Suppr.
              </button>
            </li>
          );
        })}
      </ul>

      <CreateModal
        key={creating ? 'create-open' : 'create-closed'}
        open={creating}
        onClose={() => setCreating(false)}
        copyFrom={activeEvent}
        onCreate={(name, kind, copy) => {
          dispatchEvents({
            type: 'create',
            name,
            kind,
            enabledItemIds: copy && activeEvent ? [...activeEvent.enabledItemIds] : []
          });
          setCreating(false);
        }}
      />
      <RenameModal
        key={renaming?.id ?? 'rename-closed'}
        target={renaming}
        onClose={() => setRenaming(null)}
        onRename={(name) => {
          if (renaming) dispatchEvents({ type: 'rename', id: renaming.id, name });
          setRenaming(null);
        }}
      />
    </div>
  );
}

function CreateModal({
  open,
  onClose,
  copyFrom,
  onCreate
}: {
  open: boolean;
  onClose: () => void;
  copyFrom: SaleEvent | null;
  onCreate: (name: string, kind: EventKind, copy: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<EventKind>('bric-a-brac');
  const [copy, setCopy] = useState(true);

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Nouvel événement">
      <label style={{ display: 'block', marginBottom: 8 }}>
        Nom
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex. Bric-à-brac 14 juin"
          style={{ width: '100%', padding: 8, marginTop: 4 }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Type
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as EventKind)}
          style={{ width: '100%', padding: 8, marginTop: 4 }}
        >
          <option value="bric-a-brac">Bric-à-brac</option>
          <option value="tournoi">Tournoi</option>
          <option value="autre">Autre</option>
        </select>
      </label>
      {copyFrom && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
          Copier les articles activés de "{copyFrom.name}"
        </label>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button onClick={onClose}>Annuler</button>
        <button
          onClick={() => name.trim() && onCreate(name.trim(), kind, copy)}
          style={{ background: 'var(--color-accent)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6 }}
        >
          Créer
        </button>
      </div>
    </Modal>
  );
}

function RenameModal({
  target,
  onClose,
  onRename
}: {
  target: SaleEvent | null;
  onClose: () => void;
  onRename: (name: string) => void;
}) {
  const [name, setName] = useState(target?.name ?? '');
  if (!target) return null;
  return (
    <Modal open={true} onClose={onClose} title="Renommer">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ width: '100%', padding: 8 }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button onClick={onClose}>Annuler</button>
        <button
          onClick={() => name.trim() && onRename(name.trim())}
          style={{ background: 'var(--color-accent)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6 }}
        >
          Valider
        </button>
      </div>
    </Modal>
  );
}
