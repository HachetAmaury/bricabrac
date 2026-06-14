import { useState } from 'react';
import { useApp } from '../state/AppContext';
import { Modal } from '../components/Modal';
import { formatCents, parseAmount } from '../lib/money';
import { CATEGORY_COLORS, tint } from '../lib/colors';
import { ITEM_ICONS } from '../lib/icons';
import type { Item, Category } from '../types';

type Editing = { mode: 'create' } | { mode: 'edit'; item: Item } | null;
type CatEditing = { mode: 'create' } | { mode: 'edit'; category: Category } | null;

export function CatalogView() {
  const { catalog, categories, dispatchCatalog, dispatchCategories, activeEvent, dispatchEvents } = useApp();
  const [editing, setEditing] = useState<Editing>(null);
  const [catEditing, setCatEditing] = useState<CatEditing>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = catalog.filter((i) => !i.archived);
  const archived = catalog.filter((i) => i.archived);
  const catById = new Map(categories.map((c) => [c.id, c]));

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

      {/* Categories */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 }}>
        <h2 style={{ fontSize: 14, color: 'var(--color-muted)', margin: 0 }}>Catégories</h2>
        <button onClick={() => setCatEditing({ mode: 'create' })}>+ Catégorie</button>
      </div>
      {categories.length === 0 && (
        <p style={{ color: 'var(--color-muted)', fontSize: 14 }}>Aucune catégorie pour l'instant.</p>
      )}
      <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
        {categories.map((cat) => {
          const count = catalog.filter((i) => i.categoryId === cat.id).length;
          return (
            <li
              key={cat.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 0',
                borderBottom: '1px solid var(--color-border)'
              }}
            >
              <span style={{ width: 16, height: 16, borderRadius: 4, background: cat.color }} />
              <span style={{ flex: 1, fontWeight: 500 }}>{cat.name}</span>
              <span style={{ color: 'var(--color-muted)', fontSize: 13 }}>{count} article(s)</span>
              <button onClick={() => setCatEditing({ mode: 'edit', category: cat })}>Modifier</button>
              <button
                onClick={() => {
                  if (confirm(`Supprimer la catégorie "${cat.name}" ? Les articles ne seront pas supprimés.`)) {
                    dispatchCatalog({ type: 'clearCategory', categoryId: cat.id });
                    dispatchCategories({ type: 'delete', id: cat.id });
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

      <h2 style={{ fontSize: 14, color: 'var(--color-muted)', marginTop: 24 }}>Actifs</h2>
      {active.length === 0 && <p style={{ color: 'var(--color-muted)' }}>Aucun article.</p>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {active.map((item) => {
          const enabled = activeEvent?.enabledItemIds.includes(item.id) ?? false;
          const cat = item.categoryId ? catById.get(item.categoryId) : undefined;
          return (
            <li
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px',
                marginBottom: 4,
                borderRadius: 8,
                borderBottom: '1px solid var(--color-border)',
                background: cat ? tint(cat.color, '18') : 'transparent'
              }}
            >
              <span style={{ fontSize: 22, width: 28, textAlign: 'center' }}>{item.icon ?? '🛒'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{item.name}</div>
                <div style={{ color: 'var(--color-muted)', fontSize: 14 }}>
                  {formatCents(item.price)}
                  {cat && (
                    <>
                      {' · '}
                      <span style={{ color: cat.color, fontWeight: 600 }}>{cat.name}</span>
                    </>
                  )}
                </div>
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
              <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{item.icon ?? '🛒'}</span>
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
      <CategoryModal catEditing={catEditing} onClose={() => setCatEditing(null)} />
    </div>
  );
}

function EditModal({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  if (!editing) return null;
  return <EditModalInner key={editing.mode === 'edit' ? editing.item.id : 'create'} editing={editing} onClose={onClose} />;
}

function EditModalInner({ editing, onClose }: { editing: NonNullable<Editing>; onClose: () => void }) {
  const { dispatchCatalog, categories } = useApp();
  const initialName = editing.mode === 'edit' ? editing.item.name : '';
  const initialPrice = editing.mode === 'edit' ? (editing.item.price / 100).toString().replace('.', ',') : '';
  const [name, setName] = useState(initialName);
  const [priceText, setPriceText] = useState(initialPrice);
  const [icon, setIcon] = useState<string | undefined>(editing.mode === 'edit' ? editing.item.icon : undefined);
  const [categoryId, setCategoryId] = useState<string | null>(
    editing.mode === 'edit' ? editing.item.categoryId ?? null : null
  );
  const [error, setError] = useState<string | null>(null);

  const onSubmit = () => {
    const trimmed = name.trim();
    if (trimmed === '') return setError('Le nom est obligatoire.');
    const cents = parseAmount(priceText);
    if (cents === null || cents < 0) return setError('Le prix est invalide.');
    if (editing.mode === 'create') {
      dispatchCatalog({ type: 'add', name: trimmed, price: cents, icon, categoryId });
    } else {
      dispatchCatalog({ type: 'edit', id: editing.item.id, name: trimmed, price: cents, icon, categoryId });
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

      <label style={{ display: 'block', marginBottom: 8 }}>
        Catégorie
        <select
          value={categoryId ?? ''}
          onChange={(e) => setCategoryId(e.target.value === '' ? null : e.target.value)}
          style={{ width: '100%', padding: 8, marginTop: 4 }}
        >
          <option value="">Aucune</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <div style={{ marginBottom: 8 }}>
        <div style={{ marginBottom: 4 }}>Icône {icon && <span style={{ fontSize: 20 }}>{icon}</span>}</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))',
            gap: 4,
            maxHeight: 160,
            overflowY: 'auto',
            padding: 4,
            border: '1px solid var(--color-border)',
            borderRadius: 8
          }}
        >
          <button
            type="button"
            onClick={() => setIcon(undefined)}
            style={{
              height: 40,
              fontSize: 12,
              borderRadius: 6,
              border: icon === undefined ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
              background: '#fff'
            }}
          >
            Aucune
          </button>
          {ITEM_ICONS.map((emoji) => (
            <button
              type="button"
              key={emoji}
              onClick={() => setIcon(emoji)}
              style={{
                height: 40,
                fontSize: 22,
                borderRadius: 6,
                border: icon === emoji ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                background: icon === emoji ? 'rgba(37, 99, 235, 0.08)' : '#fff'
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

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

function CategoryModal({ catEditing, onClose }: { catEditing: CatEditing; onClose: () => void }) {
  if (!catEditing) return null;
  return (
    <CategoryModalInner
      key={catEditing.mode === 'edit' ? catEditing.category.id : 'create'}
      catEditing={catEditing}
      onClose={onClose}
    />
  );
}

function CategoryModalInner({ catEditing, onClose }: { catEditing: NonNullable<CatEditing>; onClose: () => void }) {
  const { dispatchCategories } = useApp();
  const [name, setName] = useState(catEditing.mode === 'edit' ? catEditing.category.name : '');
  const [color, setColor] = useState(catEditing.mode === 'edit' ? catEditing.category.color : CATEGORY_COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = () => {
    const trimmed = name.trim();
    if (trimmed === '') return setError('Le nom est obligatoire.');
    if (catEditing.mode === 'create') {
      dispatchCategories({ type: 'add', name: trimmed, color });
    } else {
      dispatchCategories({ type: 'edit', id: catEditing.category.id, name: trimmed, color });
    }
    onClose();
  };

  return (
    <Modal open={true} onClose={onClose} title={catEditing.mode === 'create' ? 'Nouvelle catégorie' : 'Modifier la catégorie'}>
      <label style={{ display: 'block', marginBottom: 12 }}>
        Nom
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex. Boissons"
          style={{ width: '100%', padding: 8, marginTop: 4 }}
        />
      </label>
      <div style={{ marginBottom: 8 }}>Couleur</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {CATEGORY_COLORS.map((c) => (
          <button
            type="button"
            key={c}
            aria-label={`Couleur ${c}`}
            onClick={() => setColor(c)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              background: c,
              border: color === c ? '3px solid #111827' : '2px solid #fff',
              boxShadow: '0 0 0 1px var(--color-border)'
            }}
          />
        ))}
      </div>
      {error && <p style={{ color: 'var(--color-danger)', margin: '8px 0 0' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
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
