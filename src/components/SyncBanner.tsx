import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext';

/** One line about sales still waiting in the outbox; nothing when all are sent. */
export function SyncBanner() {
  const { syncStatus, outbox } = useApp();
  // navigator.onLine is not reactive: re-render when the browser flips it.
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  const waiting = outbox.pending + outbox.held;
  const offline = syncStatus === 'offline' || !online;

  let text: string | null = null;
  let warn = true;
  if (offline && waiting > 0) {
    text = `Hors ligne · ${waiting} vente(s) en attente`;
  } else if (outbox.flushing && waiting > 0) {
    text = 'Synchronisation…';
    warn = false;
  } else if (outbox.held > 0) {
    text = `${outbox.held} vente(s) bloquée(s) : événement verrouillé`;
  }
  if (!text) return null;

  return (
    <div
      role="status"
      style={{
        margin: '0 16px 12px',
        padding: '10px 12px',
        borderRadius: 12,
        fontSize: 15,
        fontWeight: 600,
        background: warn ? 'rgba(255,149,0,0.12)' : 'var(--fill)',
        color: warn ? 'var(--ios-orange)' : 'var(--label-secondary)'
      }}
    >
      {text}
    </div>
  );
}
