import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './ui/Button';

export function ImportLocalModal({
  open,
  onImport,
  onIgnore,
}: {
  open: boolean;
  onImport: () => Promise<void>;
  onIgnore: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onImport();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  // Not dismissable by the backdrop: the choice (import or erase) must be explicit.
  return (
    <Modal open={open} onClose={() => {}} title="Données locales trouvées">
      <p style={{ margin: '0 0 16px', fontSize: 16 }}>Importer les données de ce téléphone dans le compte ?</p>
      {busy && <p style={{ margin: '0 0 16px', fontSize: 16 }}>Import en cours…</p>}
      {failed && (
        <p role="alert" style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--red, #d00)' }}>
          Import impossible. Vérifiez le réseau et réessayez.
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button variant="filled" size="lg" onClick={run} disabled={busy}>
          Importer
        </Button>
        <Button variant="gray" size="lg" onClick={onIgnore} disabled={busy}>
          Ignorer
        </Button>
      </div>
    </Modal>
  );
}
