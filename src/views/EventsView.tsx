import { useState } from 'react';
import { useApp } from '../state/AppContext';
import { Modal } from '../components/Modal';
import { NavBar, NavIconButton } from '../components/ui/NavBar';
import { ListSection, Row } from '../components/ui/ListSection';
import { Button } from '../components/ui/Button';
import { PlusIcon, CheckIcon, LockIcon, LockOpenIcon, PencilIcon, TrashIcon } from '../components/ui/icons';
import { uuid } from '../lib/uuid';
import { formatCents } from '../lib/money';
import type { Catalog, EventKind, SaleEvent } from '../types';

const KIND_LABELS: Record<EventKind, string> = {
  tournoi: 'Tournoi',
  'bric-a-brac': 'Bric-à-brac',
  autre: 'Autre'
};

export function EventsView() {
  const { events, catalogs, activeEventId, setActiveEvent, dispatchEvents, activeEvent } = useApp();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<SaleEvent | null>(null);

  return (
    <div>
      <NavBar
        title="Événements"
        rightAction={
          <NavIconButton label="Nouvel événement" onClick={() => setCreating(true)}>
            <PlusIcon size={28} />
          </NavIconButton>
        }
      />

      <div style={{ padding: '0 16px' }}>
        {events.length === 0 && (
          <p style={{ color: 'var(--label-secondary)', marginTop: 8 }}>
            Aucun événement. Créez-en un pour commencer.
          </p>
        )}

        {events.map((e) => {
          const total = e.sales.reduce((acc, s) => acc + s.total, 0);
          const isActive = e.id === activeEventId;
          return (
            <ListSection key={e.id}>
              <Row
                leading={
                  e.locked ? <LockIcon size={20} style={{ color: 'var(--ios-orange)' }} /> : undefined
                }
                title={<span style={{ fontWeight: 600 }}>{e.name}</span>}
                subtitle={`${KIND_LABELS[e.kind]} · ${e.sales.length} vente(s) · ${formatCents(total)}`}
                onClick={() => setActiveEvent(e.id)}
                accessory={
                  isActive ? <CheckIcon size={22} style={{ color: 'var(--ios-blue)' }} /> : <span style={{ width: 22 }} />
                }
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 12px' }}>
                <Button
                  size="sm"
                  variant="gray"
                  leftIcon={e.locked ? <LockOpenIcon size={16} /> : <LockIcon size={16} />}
                  onClick={() => dispatchEvents({ type: 'setLocked', id: e.id, lockedAt: e.locked ? null : Date.now() })}
                >
                  {e.locked ? 'Déverrouiller' : 'Verrouiller'}
                </Button>
                <Button size="sm" variant="gray" leftIcon={<PencilIcon size={16} />} onClick={() => setRenaming(e)}>
                  Renommer
                </Button>
                <Button
                  size="sm"
                  variant="plain"
                  leftIcon={<TrashIcon size={16} />}
                  disabled={e.locked}
                  title={e.locked ? 'Déverrouillez l’événement pour le supprimer' : undefined}
                  style={{ marginLeft: 'auto', color: e.locked ? 'var(--label-tertiary)' : 'var(--ios-red)' }}
                  onClick={() => {
                    if (e.locked) return;
                    if (confirm(`Supprimer "${e.name}" et toutes ses ventes ?`)) {
                      dispatchEvents({ type: 'delete', id: e.id });
                    }
                  }}
                >
                  Suppr.
                </Button>
              </div>
            </ListSection>
          );
        })}
      </div>

      <CreateModal
        key={creating ? 'create-open' : 'create-closed'}
        open={creating}
        onClose={() => setCreating(false)}
        copyFrom={activeEvent}
        catalogs={catalogs}
        onCreate={(name, kind, copy, catalogId) => {
          // Enabled items belong to a catalog: only copy them within the same one.
          const sameCatalog = activeEvent?.catalogId === catalogId;
          dispatchEvents({
            type: 'create',
            id: uuid(),
            catalogId,
            name,
            kind,
            enabledItemIds: copy && sameCatalog && activeEvent ? [...activeEvent.enabledItemIds] : [],
            createdAt: Date.now()
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
  catalogs,
  onCreate
}: {
  open: boolean;
  onClose: () => void;
  copyFrom: SaleEvent | null;
  catalogs: Catalog[];
  onCreate: (name: string, kind: EventKind, copy: boolean, catalogId: string) => void;
}) {
  const [name, setName] = useState('');
  const [catalogId, setCatalogId] = useState(
    () => (catalogs.some((c) => c.id === copyFrom?.catalogId) ? copyFrom!.catalogId : catalogs[0]?.id) ?? ''
  );
  const hasCatalog = catalogs.some((c) => c.id === catalogId);
  const canCreate = hasCatalog && name.trim() !== '';
  const [kind, setKind] = useState<EventKind>('bric-a-brac');
  const [copy, setCopy] = useState(true);

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Nouvel événement">
      {catalogs.length === 0 && (
        <p style={{ color: 'var(--label-secondary)', marginTop: 0, marginBottom: 12 }}>
          Aucun catalogue disponible. Demandez à l’administrateur.
        </p>
      )}
      <label style={{ display: 'block', marginBottom: 12 }}>
        Nom
        <input
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex. Bric-à-brac 14 juin"
          style={{ width: '100%', padding: 11, marginTop: 4 }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 12 }}>
        Type
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as EventKind)}
          style={{ width: '100%', padding: 11, marginTop: 4 }}
        >
          <option value="bric-a-brac">Bric-à-brac</option>
          <option value="tournoi">Tournoi</option>
          <option value="autre">Autre</option>
        </select>
      </label>
      {catalogs.length > 0 && (
        <label style={{ display: 'block', marginBottom: 12 }}>
          Catalogue
          <select
            required
            value={catalogId}
            onChange={(e) => setCatalogId(e.target.value)}
            style={{ width: '100%', padding: 11, marginTop: 4 }}
          >
            {[...catalogs]
              .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {copyFrom && copyFrom.catalogId === catalogId && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
          Copier les articles activés de "{copyFrom.name}"
        </label>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <Button variant="gray" size="lg" onClick={onClose}>
          Annuler
        </Button>
        <Button variant="filled" size="lg" disabled={!canCreate} onClick={() => canCreate && onCreate(name.trim(), kind, copy, catalogId)}>
          Créer
        </Button>
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
        autoComplete="off"
        autoCorrect="off"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ width: '100%', padding: 11 }}
      />
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <Button variant="gray" size="lg" onClick={onClose}>
          Annuler
        </Button>
        <Button variant="filled" size="lg" disabled={name.trim() === ''} onClick={() => name.trim() && onRename(name.trim())}>
          Valider
        </Button>
      </div>
    </Modal>
  );
}
