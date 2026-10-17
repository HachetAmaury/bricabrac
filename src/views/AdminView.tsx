import { useState, type MouseEvent } from 'react';
import { useApp } from '../state/AppContext';
import { useAuth } from '../state/AuthContext';
import { NavBar, NavIconButton } from '../components/ui/NavBar';
import { ListSection, Row } from '../components/ui/ListSection';
import { Button } from '../components/ui/Button';
import { ChevronRightIcon, PencilIcon, PlusIcon, TrashIcon, UserIcon } from '../components/ui/icons';
import { UserModal } from '../components/UserModal';
import { GrantsModal } from '../components/GrantsModal';
import { uuid } from '../lib/uuid';
import type { Profile } from '../types';

const byName = (a: string, b: string) => a.localeCompare(b, 'fr');

function statusOf(p: Profile): string {
  const parts = [p.isAdmin ? 'Administrateur' : null, p.disabled ? 'Désactivé' : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Membre';
}

/** Runs `fn` without letting the click reach the enclosing tappable row. */
const stop = (fn: () => void) => (e: MouseEvent) => {
  e.stopPropagation();
  fn();
};

type UserForm = { mode: 'create' } | { mode: 'edit'; user: Profile };

/** Admin screens (online-only): users and their event access, and catalogs. */
export function AdminView({ onBack }: { onBack: () => void }) {
  const { profiles, refresh } = useApp();
  const { profile } = useAuth();
  const [form, setForm] = useState<UserForm | null>(null);
  const [grantsFor, setGrantsFor] = useState<Profile | null>(null);

  const back = (
    <button
      onClick={onBack}
      aria-label="Retour"
      style={{
        height: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        background: 'transparent',
        border: 'none',
        color: 'var(--ios-blue)',
        fontSize: 17
      }}
    >
      <ChevronRightIcon size={22} style={{ transform: 'rotate(180deg)' }} />
      Retour
    </button>
  );

  if (!profile?.isAdmin) {
    return (
      <div>
        <NavBar title="Administration" leftAction={back} />
        <p style={{ padding: '0 16px', color: 'var(--label-secondary)' }}>Réservé aux administrateurs.</p>
      </div>
    );
  }

  const users = [...profiles].sort((a, b) => byName(a.displayName, b.displayName));

  return (
    <div>
      <NavBar
        title="Administration"
        leftAction={back}
        rightAction={
          <NavIconButton label="Nouvel utilisateur" onClick={() => setForm({ mode: 'create' })}>
            <PlusIcon size={28} />
          </NavIconButton>
        }
      />
      <div style={{ padding: '0 16px' }}>
        <ListSection header="Utilisateurs" footer="Touchez un utilisateur pour gérer ses accès aux événements.">
          {users.map((p) => (
            <div key={p.id} data-testid="profile-row">
              <Row
                leading={<UserIcon size={22} style={{ color: p.disabled ? 'var(--label-secondary)' : 'var(--ios-blue)' }} />}
                title={p.displayName}
                subtitle={statusOf(p)}
                onClick={() => setGrantsFor(p)}
                trailing={
                  <Button size="sm" variant="gray" onClick={stop(() => setForm({ mode: 'edit', user: p }))}>
                    Modifier
                  </Button>
                }
              />
            </div>
          ))}
        </ListSection>
        <AdminCatalogs />
      </div>

      {form && (
        <UserModal
          mode={form.mode}
          user={form.mode === 'edit' ? form.user : undefined}
          onClose={() => setForm(null)}
          onDone={() => {
            setForm(null);
            void refresh();
          }}
        />
      )}
      {grantsFor && <GrantsModal user={grantsFor} onClose={() => setGrantsFor(null)} />}
    </div>
  );
}

function AdminCatalogs() {
  const { catalogs, dispatchCatalogs } = useApp();
  const [error, setError] = useState<string | null>(null);
  const sorted = [...catalogs].sort((a, b) => byName(a.name, b.name));

  const run = async (a: Parameters<typeof dispatchCatalogs>[0]) => {
    setError(null);
    setError(await dispatchCatalogs(a));
  };

  const add = () => {
    const name = prompt('Nom du catalogue')?.trim();
    if (name) void run({ type: 'add', catalog: { id: uuid(), name } });
  };

  return (
    <ListSection
      header={
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Catalogues
          <NavIconButton label="Nouveau catalogue" onClick={add}>
            <PlusIcon size={22} />
          </NavIconButton>
        </span>
      }
      footer={error ? <span style={{ color: 'var(--ios-red)' }}>{error}</span> : undefined}
    >
      {sorted.length === 0 && <Row title="Aucun catalogue" />}
      {sorted.map((c) => (
        <Row
          key={c.id}
          title={c.name}
          trailing={
            <span style={{ display: 'flex', gap: 6 }}>
              <Button
                size="sm"
                variant="gray"
                aria-label={`Renommer ${c.name}`}
                leftIcon={<PencilIcon size={16} />}
                onClick={() => {
                  const name = prompt('Nom du catalogue', c.name)?.trim();
                  if (name && name !== c.name) void run({ type: 'rename', id: c.id, name });
                }}
              >
                Renommer
              </Button>
              <Button
                size="sm"
                variant="plain"
                aria-label={`Supprimer ${c.name}`}
                leftIcon={<TrashIcon size={16} />}
                style={{ color: 'var(--ios-red)' }}
                onClick={() => {
                  if (confirm(`Supprimer "${c.name}" ?`)) void run({ type: 'delete', id: c.id });
                }}
              >
                Supprimer
              </Button>
            </span>
          }
        />
      ))}
    </ListSection>
  );
}
