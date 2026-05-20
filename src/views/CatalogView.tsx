import { useState } from 'react';
import { useApp } from '../state/AppContext';
import { Modal } from '../components/Modal';
import { formatCents, parseAmount } from '../lib/money';
import type { Item } from '../types';

type Editing = { mode: 'create' } | { mode: 'edit'; item: Item } | null;

export function CatalogView() {
  const { catalog, dispatchCatalog, activeEvent, dispatchEvents } = useApp();
  const [editing, setEditing] = useState<Editing>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = catalog.filter((i) => !i.archived);
  const archived = catalog.filter((i) => i.archived);

  return (
    <div style={{ padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Catalogue</h1>
        <button
          onClick={() => setEditing({ mode: 'create' })}
          style={{
            background: 'var(--color-accent)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '8px 12px'
          }}
        >
          + Nouvel article
        </button>
      </header>

      <h2 style={{ fontSize: 14, color: 'var(--color-muted)', marginTop: 24 }}>Actifs</h2>
      {active.length === 0 && <p style={{ color: 'var(--color-muted)' }}>Aucun article.</p>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {active.map((item) => {
          const enabled = activeEvent?.enabledItemIds.includes(item.id) ?? false;
          return (
            <li
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px solid var(--color-border)'
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{item.name}</div>
                <div style={{ color: 'var(--color-muted)', fontSize: 14 }}>{formatCents(item.price)}</div>
              </div>
              {activeEvent && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() =>
                      dispatchEvents({ type: 'toggleItem', eventId: activeEvent.id, itemId: item.id })
                    }
                  />
                  Actif
                </label>
              )}
              <button onClick={() => setEditing({ mode: 'edit', item })}>Modifier</button>
              <button onClick={() => dispatchCatalog({ type: 'archive', id: item.id })}>Archiver</button>
            </li>
          );
        })}
      </ul>

      <button
        onClick={() => setShowArchived((v) => !v)}
        style={{ marginTop: 16, background: 'transparent', border: 'none', color: 'var(--color-muted)' }}
      >
        {showArchived ? '▾' : '▸'} Archivés ({archived.length})
      </button>
      {showArchived && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {archived.map((item) => (
            <li
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px solid var(--color-border)',
                opacity: 0.6
              }}
            >
              <div style={{ flex: 1 }}>
                <div>{item.name}</div>
                <div style={{ color: 'var(--color-muted)', fontSize: 14 }}>{formatCents(item.price)}</div>
              </div>
              <button onClick={() => dispatchCatalog({ type: 'restore', id: item.id })}>Restaurer</button>
            </li>
          ))}
        </ul>
      )}

      <EditModal editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function EditModal({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  if (!editing) return null;
  return <EditModalInner key={editing.mode === 'edit' ? editing.item.id : 'create'} editing={editing} onClose={onClose} />;
}

function EditModalInner({ editing, onClose }: { editing: NonNullable<Editing>; onClose: () => void }) {
  const { dispatchCatalog } = useApp();
  const initialName = editing.mode === 'edit' ? editing.item.name : '';
  const initialPrice = editing.mode === 'edit' ? (editing.item.price / 100).toString().replace('.', ',') : '';
  const [name, setName] = useState(initialName);
  const [priceText, setPriceText] = useState(initialPrice);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = () => {
    const trimmed = name.trim();
    if (trimmed === '') return setError('Le nom est obligatoire.');
    const cents = parseAmount(priceText);
    if (cents === null || cents < 0) return setError('Le prix est invalide.');
    if (editing.mode === 'create') {
      dispatchCatalog({ type: 'add', name: trimmed, price: cents });
    } else {
      dispatchCatalog({ type: 'edit', id: editing.item.id, name: trimmed, price: cents });
    }
    onClose();
  };

  return (
    <Modal open={true} onClose={onClose} title={editing.mode === 'create' ? 'Nouvel article' : 'Modifier'}>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Nom
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', padding: 8, marginTop: 4 }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Prix (€)
        <input
          inputMode="decimal"
          value={priceText}
          onChange={(e) => setPriceText(e.target.value)}
          placeholder="0,00"
          style={{ width: '100%', padding: 8, marginTop: 4 }}
        />
      </label>
      {error && <p style={{ color: 'var(--color-danger)', margin: '4px 0' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button onClick={onClose}>Annuler</button>
        <button
          onClick={onSubmit}
          style={{ background: 'var(--color-accent)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6 }}
        >
          Valider
        </button>
      </div>
    </Modal>
  );
}
