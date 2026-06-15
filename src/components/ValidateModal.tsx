import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './ui/Button';
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
      <p style={{ fontSize: 22, fontWeight: 700, margin: '0 0 16px' }}>
        Total : {formatCents(total)}
      </p>
      <label style={{ display: 'block', color: 'var(--label-secondary)', fontSize: 15 }}>
        Montant reçu (optionnel)
        <input
          inputMode="decimal"
          value={cashText}
          onChange={(e) => setCashText(e.target.value)}
          placeholder="0,00"
          style={{ width: '100%', padding: 12, marginTop: 6, fontSize: 17 }}
          autoFocus
        />
      </label>
      {change !== null && (
        <p style={{ marginTop: 12, fontSize: 17 }}>
          {change >= 0 ? 'À rendre : ' : 'Reste dû : '}
          <strong>{formatCents(Math.abs(change))}</strong>
        </p>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <Button variant="gray" size="lg" onClick={onCancel}>
          Annuler
        </Button>
        <Button variant="filled" size="lg" onClick={() => onConfirm(parsed ?? undefined)}>
          Confirmer
        </Button>
      </div>
    </Modal>
  );
}
