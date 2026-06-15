import { useState } from 'react';
import { useApp } from '../state/AppContext';
import { Modal } from '../components/Modal';
import { NavBar, NavIconButton } from '../components/ui/NavBar';
import { ListSection, Row } from '../components/ui/ListSection';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Toggle';
import { PlusIcon } from '../components/ui/icons';
import { formatCents, parseAmount } from '../lib/money';
import { CATEGORY_COLORS, tint } from '../lib/colors';
import { ITEM_ICONS } from '../lib/icons';
import type { Item, Category } from '../types';

type Editing = { mode: 'create' } | { mode: 'edit'; item: Item } | null;
type CatEditing = { mode: 'create' } | { mode: 'edit'; category: Category } | null;

function IconTile({ icon, color }: { icon?: string; color?: string }) {
  return (
    <span
      style={{
        width: 38,
        height: 38,
        flexShrink: 0,
        borderRadius: 9,
        background: color ? tint(color, '28') : 'var(--fill)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 22
      }}
    >
      {icon ?? '🛒'}
    </span>
  );
}

export function CatalogView() {
  const { catalog, categories, dispatchCatalog, activeEvent, dispatchEvents } = useApp();
  const [editing, setEditing] = useState<Editing>(null);
  const [catEditing, setCatEditing] = useState<CatEditing>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = catalog.filter((i) => !i.archived);
  const archived = catalog.filter((i) => i.archived);
  const catById = new Map(categories.map((c) => [c.id, c]));

  return (
    <div>
      <NavBar
        title="Catalogue"
        rightAction={
          <NavIconButton label="Nouvel article" onClick={() => setEditing({ mode: 'create' })}>
            <PlusIcon size={28} />
          </NavIconButton>
        }
      />

      <div style={{ padding: '0 16px' }}>
        {/* Categories */}
        <ListSection header="Catégories">
          {categories.map((cat) => {
            const count = catalog.filter((i) => i.categoryId === cat.id).length;
            return (
              <Row
                key={cat.id}
                leading={<span style={{ width: 20, height: 20, borderRadius: 5, background: cat.color }} />}
                title={cat.name}
                subtitle={`${count} article(s)`}
                onClick={() => setCatEditing({ mode: 'edit', category: cat })}
              />
            );
          })}
          <Row
            title={<span style={{ color: 'var(--ios-blue)' }}>Nouvelle catégorie</span>}
            leading={<PlusIcon size={20} style={{ color: 'var(--ios-blue)' }} />}
            onClick={() => setCatEditing({ mode: 'create' })}
            accessory={<span style={{ width: 8 }} />}
          />
        </ListSection>

        {/* Active items */}
        <ListSection header="Articles">
          {active.length === 0 && (
            <Row title={<span style={{ color: 'var(--label-secondary)' }}>Aucun article.</span>} />
          )}
          {active.map((item) => {
            const enabled = activeEvent?.enabledItemIds.includes(item.id) ?? false;
            const cat = item.categoryId ? catById.get(item.categoryId) : undefined;
            return (
              <Row
                key={item.id}
                leading={<IconTile icon={item.icon} color={cat?.color} />}
                title={item.name}
                subtitle={
                  <>
                    {formatCents(item.price)}
                    {cat && (
                      <>
                        {' · '}
                        <span style={{ color: cat.color, fontWeight: 600 }}>{cat.name}</span>
                      </>
                    )}
                  </>
                }
                onClick={() => setEditing({ mode: 'edit', item })}
                accessory={
                  activeEvent ? (
                    <Toggle
                      checked={enabled}
                      disabled={activeEvent.locked}
                      label={`Activer ${item.name}`}
                      onChange={() => dispatchEvents({ type: 'toggleItem', eventId: activeEvent.id, itemId: item.id })}
                    />
                  ) : (
                    <span style={{ width: 8 }} />
                  )
                }
              />
            );
          })}
        </ListSection>

        {activeEvent && (
          <p style={{ color: 'var(--label-secondary)', fontSize: 13, margin: '-14px 4px 22px' }}>
            {activeEvent.locked
              ? `« ${activeEvent.name} » est verrouillé : les articles activés ne peuvent plus être modifiés. Déverrouillez-le dans l'onglet Événements.`
              : `Le bouton vert active l'article pour « ${activeEvent.name} » (visible dans l'onglet Vente).`}
          </p>
        )}

        {/* Archived */}
        <ListSection>
          <Row
            title={`Articles archivés (${archived.length})`}
            onClick={() => setShowArchived((v) => !v)}
            accessory={<span style={{ color: 'var(--label-tertiary)' }}>{showArchived ? '▾' : '▸'}</span>}
          />
          {showArchived &&
            archived.map((item) => (
              <Row
                key={item.id}
                leading={<IconTile icon={item.icon} />}
                title={<span style={{ opacity: 0.7 }}>{item.name}</span>}
                subtitle={formatCents(item.price)}
                trailing={
                  <Button size="sm" variant="tinted" onClick={() => dispatchCatalog({ type: 'restore', id: item.id })}>
                    Restaurer
                  </Button>
                }
              />
            ))}
        </ListSection>
      </div>

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

  const fieldStyle = { width: '100%', padding: 12, marginTop: 6, fontSize: 17 } as const;

  return (
    <Modal open={true} onClose={onClose} title={editing.mode === 'create' ? 'Nouvel article' : 'Modifier'}>
      <label style={{ display: 'block', marginBottom: 12, color: 'var(--label-secondary)', fontSize: 15 }}>
        Nom
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} style={fieldStyle} />
      </label>
      <label style={{ display: 'block', marginBottom: 12, color: 'var(--label-secondary)', fontSize: 15 }}>
        Prix (€)
        <input
          inputMode="decimal"
          value={priceText}
          onChange={(e) => setPriceText(e.target.value)}
          placeholder="0,00"
          style={fieldStyle}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 12, color: 'var(--label-secondary)', fontSize: 15 }}>
        Catégorie
        <select
          value={categoryId ?? ''}
          onChange={(e) => setCategoryId(e.target.value === '' ? null : e.target.value)}
          style={fieldStyle}
        >
          <option value="">Aucune</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 6, color: 'var(--label-secondary)', fontSize: 15 }}>
          Icône {icon && <span style={{ fontSize: 20 }}>{icon}</span>}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))',
            gap: 6,
            maxHeight: 168,
            overflowY: 'auto',
            padding: 6,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--separator)',
            borderRadius: 12
          }}
        >
          <button
            type="button"
            onClick={() => setIcon(undefined)}
            style={{
              height: 44,
              fontSize: 12,
              borderRadius: 9,
              border: icon === undefined ? '2px solid var(--ios-blue)' : '1px solid var(--separator)',
              background: 'var(--bg-elevated)'
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
                height: 44,
                fontSize: 24,
                borderRadius: 9,
                border: icon === emoji ? '2px solid var(--ios-blue)' : '1px solid var(--separator)',
                background: icon === emoji ? 'rgba(0,122,255,0.08)' : 'var(--bg-elevated)'
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {error && <p style={{ color: 'var(--ios-red)', margin: '4px 0' }}>{error}</p>}

      {editing.mode === 'edit' && (
        <Button
          variant="tinted"
          size="lg"
          style={{ color: 'var(--ios-red)', background: 'rgba(255,59,48,0.1)', marginBottom: 10 }}
          onClick={() => {
            dispatchCatalog({ type: 'archive', id: editing.item.id });
            onClose();
          }}
        >
          Archiver l'article
        </Button>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <Button variant="gray" size="lg" onClick={onClose}>
          Annuler
        </Button>
        <Button variant="filled" size="lg" onClick={onSubmit}>
          Valider
        </Button>
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
  const { dispatchCategories, dispatchCatalog } = useApp();
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
      <label style={{ display: 'block', marginBottom: 14, color: 'var(--label-secondary)', fontSize: 15 }}>
        Nom
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex. Boissons"
          style={{ width: '100%', padding: 12, marginTop: 6, fontSize: 17 }}
        />
      </label>
      <div style={{ marginBottom: 8, color: 'var(--label-secondary)', fontSize: 15 }}>Couleur</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {CATEGORY_COLORS.map((c) => (
          <button
            type="button"
            key={c}
            aria-label={`Couleur ${c}`}
            onClick={() => setColor(c)}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              background: c,
              border: color === c ? '3px solid var(--label)' : '2px solid #fff',
              boxShadow: '0 0 0 1px var(--separator)'
            }}
          />
        ))}
      </div>
      {error && <p style={{ color: 'var(--ios-red)', margin: '10px 0 0' }}>{error}</p>}

      {catEditing.mode === 'edit' && (
        <Button
          variant="tinted"
          size="lg"
          style={{ color: 'var(--ios-red)', background: 'rgba(255,59,48,0.1)', margin: '16px 0 10px' }}
          onClick={() => {
            if (confirm(`Supprimer la catégorie "${catEditing.category.name}" ? Les articles ne seront pas supprimés.`)) {
              dispatchCatalog({ type: 'clearCategory', categoryId: catEditing.category.id });
              dispatchCategories({ type: 'delete', id: catEditing.category.id });
              onClose();
            }
          }}
        >
          Supprimer la catégorie
        </Button>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: catEditing.mode === 'edit' ? 0 : 18 }}>
        <Button variant="gray" size="lg" onClick={onClose}>
          Annuler
        </Button>
        <Button variant="filled" size="lg" onClick={onSubmit}>
          Valider
        </Button>
      </div>
    </Modal>
  );
}
