import { useState } from 'react';
import { useApp } from '../../state/AppContext';
import { useAuth } from '../../state/AuthContext';
import { ListSection, Row } from './ListSection';
import { CloseIcon, UserIcon, ExportIcon, InfoIcon, LockIcon } from './icons';
import { downloadJSON } from '../../lib/download';

// Schema version stamped into exported backups (data format, not the build).
const BACKUP_VERSION = '0.2.0';
// Build identifier baked in at compile time, so you can confirm which deploy a
// device is actually running — handy for the stubborn iOS home-screen cache.
const APP_VERSION = __APP_VERSION__;

export function Drawer({
  open,
  onClose,
  onOpenAdmin
}: {
  open: boolean;
  onClose: () => void;
  onOpenAdmin?: () => void;
}) {
  const { allItems, allCategories, events } = useApp();
  const { profile, signOut } = useAuth();
  const [about, setAbout] = useState(false);

  if (!open) return null;

  const exportData = () => {
    const payload = { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), catalog: allItems, categories: allCategories, events };
    downloadJSON(payload, `bricabrac-${new Date().toISOString().slice(0, 10)}.json`);
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

        <ListSection header="Session">
          <Row
            leading={<UserIcon size={22} style={{ color: 'var(--ios-blue)' }} />}
            title={profile?.displayName ?? '…'}
            subtitle={profile?.isAdmin ? 'Administrateur' : 'Membre'}
          />
          <Row title="Se déconnecter" danger onClick={() => void signOut()} accessory={<span />} />
        </ListSection>

        {profile?.isAdmin && onOpenAdmin && (
          <ListSection header="Administration">
            <Row
              leading={<LockIcon size={22} style={{ color: 'var(--ios-blue)' }} />}
              title="Administration"
              onClick={onOpenAdmin}
            />
          </ListSection>
        )}

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
