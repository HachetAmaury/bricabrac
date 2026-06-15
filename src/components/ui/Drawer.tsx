import { useRef, useState } from 'react';
import { useApp } from '../../state/AppContext';
import { parseBackup } from '../../lib/backup';
import { ListSection, Row } from './ListSection';
import { Button } from './Button';
import { CloseIcon, UserIcon, ExportIcon, ImportIcon, InfoIcon } from './icons';

// Schema version stamped into exported backups (data format, not the build).
const BACKUP_VERSION = '0.2.0';
// Build identifier baked in at compile time, so you can confirm which deploy a
// device is actually running — handy for the stubborn iOS home-screen cache.
const APP_VERSION = __APP_VERSION__;

export function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, setUser, catalog, categories, events, dispatchCatalog, dispatchCategories, dispatchEvents } = useApp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(user);
  const [about, setAbout] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const exportData = () => {
    const payload = { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), catalog, categories, events };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bricabrac-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (file: File) => {
    const text = await file.text();
    const result = parseBackup(text);
    if (!result.ok) {
      alert(`Import impossible : ${result.error}`);
      return;
    }
    const confirmed = window.confirm(
      'Importer cette sauvegarde remplacera toutes les données actuelles (articles, catégories et événements). Continuer ?'
    );
    if (!confirmed) return;
    dispatchCatalog({ type: 'hydrate', items: result.data.catalog });
    dispatchCategories({ type: 'hydrate', categories: result.data.categories });
    dispatchEvents({ type: 'hydrate', events: result.data.events });
    onClose();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = '';
    if (file) await importData(file);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 60,
        animation: 'fade-in 0.2s ease'
      }}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          width: '82%',
          maxWidth: 340,
          background: 'var(--bg-grouped)',
          boxShadow: '2px 0 16px rgba(0,0,0,0.15)',
          padding: 'calc(var(--safe-top) + 12px) 14px calc(var(--safe-bottom) + 16px)',
          overflowY: 'auto',
          animation: 'drawer-in 0.28s cubic-bezier(0.32, 0.72, 0, 1)'
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700 }}>Bric-à-brac</h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              background: 'var(--fill)',
              border: 'none',
              color: 'var(--label-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <CloseIcon size={18} />
          </button>
        </header>

        <ListSection header="Session" footer="Les sessions ouvertes sur cet appareil se synchronisent automatiquement.">
          {editing ? (
            <div style={{ padding: 12, display: 'flex', gap: 8 }}>
              <input
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Nom d'utilisateur / appareil"
                style={{ flex: 1, padding: 10 }}
              />
              <Button
                variant="filled"
                onClick={() => {
                  setUser(draft.trim());
                  setEditing(false);
                }}
              >
                OK
              </Button>
            </div>
          ) : (
            <Row
              leading={<UserIcon size={22} style={{ color: 'var(--ios-blue)' }} />}
              title={user || 'Aucun utilisateur'}
              subtitle={user ? 'Connecté' : 'Appuyez pour vous connecter'}
              onClick={() => {
                setDraft(user);
                setEditing(true);
              }}
            />
          )}
        </ListSection>

        <ListSection header="Données">
          <Row
            leading={<ExportIcon size={22} style={{ color: 'var(--ios-blue)' }} />}
            title="Exporter (sauvegarde JSON)"
            onClick={() => {
              exportData();
              onClose();
            }}
          />
          <Row
            leading={<ImportIcon size={22} style={{ color: 'var(--ios-blue)' }} />}
            title="Importer (restaurer JSON)"
            onClick={() => fileInputRef.current?.click()}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={onFileChange}
            style={{ display: 'none' }}
          />
          <Row
            leading={<InfoIcon size={22} style={{ color: 'var(--ios-blue)' }} />}
            title="À propos"
            subtitle={about ? `Version ${APP_VERSION}` : undefined}
            onClick={() => setAbout((v) => !v)}
          />
        </ListSection>
      </aside>
    </div>
  );
}
