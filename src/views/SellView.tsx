import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { ValidateModal } from '../components/ValidateModal';
import { formatCents, sumLines } from '../lib/money';

export function SellView() {
  const { catalog, activeEvent, cart, dispatchCart, dispatchEvents } = useApp();
  const [showValidate, setShowValidate] = useState(false);

  const enabledItems = useMemo(
    () =>
      activeEvent
        ? catalog.filter((i) => !i.archived && activeEvent.enabledItemIds.includes(i.id))
        : [],
    [catalog, activeEvent]
  );

  if (!activeEvent) {
    return (
      <div style={{ padding: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Vente</h1>
        <p style={{ marginTop: 16, color: 'var(--color-muted)' }}>
          Aucun événement actif. Créez ou sélectionnez un événement pour commencer.
        </p>
      </div>
    );
  }

  const lineSubtotals = cart.map((c) => {
    const item = catalog.find((i) => i.id === c.itemId);
    return { price: item?.price ?? 0, qty: c.qty };
  });
  const total = sumLines(lineSubtotals);
  const dayTotal = activeEvent.sales.reduce((acc, s) => acc + s.total, 0);

  return (
    <div style={{ padding: 16, paddingBottom: 'calc(var(--tab-height) + 96px)' }}>
      <header>
        <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>{activeEvent.name}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Vente</h1>
          <span style={{ color: 'var(--color-muted)' }}>Journée : {formatCents(dayTotal)}</span>
        </div>
      </header>

      <ul style={{ listStyle: 'none', padding: 0, marginTop: 16 }}>
        {enabledItems.length === 0 && (
          <li style={{ color: 'var(--color-muted)' }}>
            Aucun article activé pour cet événement. Activez-en depuis le Catalogue.
          </li>
        )}
        {enabledItems.map((item) => {
          const line = cart.find((l) => l.itemId === item.id);
          const qty = line?.qty ?? 0;
          return (
            <li
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 0',
                borderBottom: '1px solid var(--color-border)'
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{item.name}</div>
                <div style={{ color: 'var(--color-muted)', fontSize: 14 }}>{formatCents(item.price)}</div>
              </div>
              {qty > 0 && (
                <button
                  onClick={() => dispatchCart({ type: 'remove', itemId: item.id })}
                  style={{ width: 36, height: 36, borderRadius: 18, border: '1px solid var(--color-border)' }}
                >
                  −
                </button>
              )}
              {qty > 0 && <span style={{ minWidth: 24, textAlign: 'center' }}>{qty}</span>}
              <button
                onClick={() => dispatchCart({ type: 'add', itemId: item.id })}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  border: 'none',
                  background: 'var(--color-accent)',
                  color: 'white'
                }}
              >
                +
              </button>
            </li>
          );
        })}
      </ul>

      <footer
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 'var(--tab-height)',
          padding: 12,
          background: '#ffffff',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, flex: 1 }}>{formatCents(total)}</div>
        <button
          disabled={cart.length === 0}
          onClick={() => setShowValidate(true)}
          style={{
            background: cart.length === 0 ? 'var(--color-muted)' : 'var(--color-accent)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '10px 16px',
            fontWeight: 600
          }}
        >
          Valider
        </button>
      </footer>

      <ValidateModal
        key={showValidate ? 'open' : 'closed'}
        open={showValidate}
        total={total}
        onCancel={() => setShowValidate(false)}
        onConfirm={(cashGiven) => {
          dispatchEvents({
            type: 'recordSale',
            eventId: activeEvent.id,
            cart,
            catalog,
            cashGiven,
            now: Date.now()
          });
          dispatchCart({ type: 'clear' });
          setShowValidate(false);
        }}
      />
    </div>
  );
}
