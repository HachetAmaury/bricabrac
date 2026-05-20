import { useState } from 'react';
import { Modal } from './Modal';
import { formatCents, parseAmount } from '../lib/money';

export function ValidateModal({
  open,
  total,
  onCancel,
  onConfirm
}: {
  open: boolean;
  total: number;
  onCancel: () => void;
  onConfirm: (cashGiven?: number) => void;
}) {
  const [cashText, setCashText] = useState('');
  const parsed = parseAmount(cashText);
  const change = parsed !== null ? parsed - total : null;

  return (
    <Modal open={open} onClose={onCancel} title="Encaisser">
      <p style={{ fontSize: 22, fontWeight: 600, margin: '8px 0 16px' }}>
        Total : {formatCents(total)}
      </p>
      <label style={{ display: 'block' }}>
        Montant reçu (optionnel)
        <input
          inputMode="decimal"
          value={cashText}
          onChange={(e) => setCashText(e.target.value)}
          placeholder="0,00"
          style={{ width: '100%', padding: 8, marginTop: 4 }}
          autoFocus
        />
      </label>
      {change !== null && (
        <p style={{ marginTop: 8 }}>
          {change >= 0 ? 'À rendre : ' : 'Reste dû : '}
          <strong>{formatCents(Math.abs(change))}</strong>
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={onCancel}>Annuler</button>
        <button
          onClick={() => onConfirm(parsed ?? undefined)}
          style={{ background: 'var(--color-accent)', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 6 }}
        >
          Confirmer
        </button>
      </div>
    </Modal>
  );
}
