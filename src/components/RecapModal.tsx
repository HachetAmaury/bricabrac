import { Modal } from './Modal';
import { Button } from './ui/Button';
import { formatCents } from '../lib/money';
import type { Item, CartLine } from '../types';

// Step shown to the customer before payment: a clear recap of everything in the
// cart so it can be checked together before encaissement.
export function RecapModal({
  open,
  cart,
  catalog,
  total,
  onBack,
  onConfirm
}: {
  open: boolean;
  cart: CartLine[];
  catalog: Item[];
  total: number;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const lines = cart.map((c) => {
    const item = catalog.find((i) => i.id === c.itemId);
    return {
      itemId: c.itemId,
      icon: item?.icon,
      name: item?.name ?? '—',
      price: item?.price ?? 0,
      qty: c.qty
    };
  });
  const itemCount = cart.reduce((a, l) => a + l.qty, 0);

  return (
    <Modal open={open} onClose={onBack} title="Récapitulatif">
      <p style={{ color: 'var(--color-muted)', margin: '0 0 12px' }}>
        Vérifiez la commande avec le client avant d'encaisser.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {lines.map((l) => (
          <li
            key={l.itemId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 0',
              borderBottom: '1px solid var(--color-border)'
            }}
          >
            <span style={{ fontSize: 22, width: 28, textAlign: 'center' }}>{l.icon ?? '🛒'}</span>
            <span style={{ flex: 1, fontWeight: 500, fontSize: 17 }}>{l.name}</span>
            <span style={{ color: 'var(--color-muted)', minWidth: 64, textAlign: 'right' }}>
              {l.qty} × {formatCents(l.price)}
            </span>
            <span style={{ fontWeight: 600, minWidth: 72, textAlign: 'right' }}>
              {formatCents(l.price * l.qty)}
            </span>
          </li>
        ))}
      </ul>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginTop: 16
        }}
      >
        <span style={{ color: 'var(--color-muted)' }}>{itemCount} article(s)</span>
        <span style={{ fontSize: 26, fontWeight: 700 }}>{formatCents(total)}</span>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <Button variant="gray" size="lg" onClick={onBack}>
          Retour
        </Button>
        <Button variant="filled" size="lg" onClick={onConfirm}>
          Encaisser
        </Button>
      </div>
    </Modal>
  );
}
