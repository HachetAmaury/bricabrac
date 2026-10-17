import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './ui/Button';
import { Toggle } from './ui/Toggle';
import { useAuth } from '../state/AuthContext';
import { adminUsers, type AdminUsersRequest } from '../sync/adminApi';
import type { Profile } from '../types';

const inputStyle = { width: '100%', padding: 11, marginTop: 4 };

/**
 * Creates a user, or edits one (name, password, admin flag, disabled).
 * Calls `onDone` after any successful server change; errors stay in the form.
 */
export function UserModal({
  mode,
  user,
  onClose,
  onDone
}: {
  mode: 'create' | 'edit';
  user?: Profile;
  onClose: () => void;
  onDone: () => void;
}) {
  const { profile: me } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState(user?.displayName ?? '');
  const [isAdmin, setIsAdmin] = useState(user?.isAdmin ?? false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editing = mode === 'edit' && user !== undefined;
  // Self-lockout is refused server-side too: don't offer it.
  const isSelf = editing && user.id === me?.id;

  const send = async (body: AdminUsersRequest) => {
    setPending(true);
    setError(null);
    const res = await adminUsers(body);
    setPending(false);
    if (res.ok) onDone();
    else setError(res.error);
  };

  const submit = () => {
    const displayName = name.trim();
    if (!editing) {
      void send({ action: 'create', email: email.trim(), password, displayName, isAdmin });
      return;
    }
    void send({
      action: 'update',
      userId: user.id,
      displayName,
      ...(password ? { password } : {}),
      ...(isSelf ? {} : { isAdmin })
    });
  };

  const valid = name.trim() !== '' && (editing || (email.trim() !== '' && password !== ''));

  const nameField = (
    <label style={{ display: 'block', marginBottom: 12 }}>
      Nom
      <input autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
    </label>
  );
  const passwordField = (
    <label style={{ display: 'block', marginBottom: 12 }}>
      {editing ? 'Nouveau mot de passe' : 'Mot de passe'}
      <input
        type="password"
        autoComplete="new-password"
        value={password}
        placeholder={editing ? 'Laisser vide pour ne pas changer' : undefined}
        onChange={(e) => setPassword(e.target.value)}
        style={inputStyle}
      />
    </label>
  );

  return (
    <Modal open onClose={onClose} title={editing ? 'Modifier l’utilisateur' : 'Nouvel utilisateur'}>
      {!editing && (
        <label style={{ display: 'block', marginBottom: 12 }}>
          Email
          <input
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </label>
      )}
      {editing ? (
        <>
          {nameField}
          {passwordField}
        </>
      ) : (
        <>
          {passwordField}
          {nameField}
        </>
      )}
      {!isSelf && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span>Administrateur</span>
          <Toggle checked={isAdmin} onChange={() => setIsAdmin((v) => !v)} label="Administrateur" />
        </div>
      )}
      {error && <p style={{ color: 'var(--ios-red)', margin: '0 0 12px' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <Button variant="gray" size="lg" onClick={onClose}>
          Annuler
        </Button>
        <Button variant="filled" size="lg" disabled={pending || !valid} onClick={() => valid && !pending && submit()}>
          {editing ? 'Enregistrer' : 'Créer'}
        </Button>
      </div>
      {editing && !isSelf && (
        <Button
          variant="destructive"
          size="lg"
          disabled={pending}
          style={{ marginTop: 10 }}
          onClick={() => void send({ action: 'setDisabled', userId: user.id, disabled: !user.disabled })}
        >
          {user.disabled ? 'Réactiver' : 'Désactiver'}
        </Button>
      )}
    </Modal>
  );
}
