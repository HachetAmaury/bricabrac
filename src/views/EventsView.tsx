import { useState } from 'react';
import { useApp } from '../state/AppContext';
import { Modal } from '../components/Modal';
import { NavBar, NavIconButton } from '../components/ui/NavBar';
import { ListSection, Row } from '../components/ui/ListSection';
import { Button } from '../components/ui/Button';
import { PlusIcon, CheckIcon, LockIcon, LockOpenIcon, PencilIcon, TrashIcon } from '../components/ui/icons';
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
                  onClick={() => dispatchEvents({ type: 'setLocked', id: e.id, locked: !e.locked })}
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
                  style={{ marginLeft: 'auto', color: 'var(--ios-red)' }}
                  onClick={() => {
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
      <label style={{ display: 'block', marginBottom: 12 }}>
        Nom
        <input
          autoFocus
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
      {copyFrom && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
          Copier les articles activés de "{copyFrom.name}"
        </label>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <Button variant="gray" size="lg" onClick={onClose}>
          Annuler
        </Button>
        <Button variant="filled" size="lg" disabled={name.trim() === ''} onClick={() => name.trim() && onCreate(name.trim(), kind, copy)}>
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
