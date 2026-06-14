import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { ValidateModal } from '../components/ValidateModal';
import { RecapModal } from '../components/RecapModal';
import { formatCents, sumLines } from '../lib/money';
import { tint } from '../lib/colors';
import type { Item } from '../types';

type Step = 'idle' | 'recap' | 'pay';

const UNCATEGORIZED = '__none__';

export function SellView() {
  const { catalog, categories, activeEvent, cart, dispatchCart, dispatchEvents } = useApp();
  const [step, setStep] = useState<Step>('idle');

  const locked = activeEvent?.locked ?? false;

  const enabledItems = useMemo(
    () =>
      activeEvent
        ? catalog.filter((i) => !i.archived && activeEvent.enabledItemIds.includes(i.id))
        : [],
    [catalog, activeEvent]
  );

  // Group enabled items by category, in category order, with an uncategorised
  // bucket last. Only non-empty groups are shown.
  const groups = useMemo(() => {
    const byCat = new Map<string, Item[]>();
    for (const item of enabledItems) {
      const key = item.categoryId && categories.some((c) => c.id === item.categoryId)
        ? item.categoryId
        : UNCATEGORIZED;
      const list = byCat.get(key) ?? [];
      list.push(item);
      byCat.set(key, list);
    }
    const ordered: { id: string; name: string; color: string | null; items: Item[] }[] = [];
    for (const cat of categories) {
      const items = byCat.get(cat.id);
      if (items && items.length) ordered.push({ id: cat.id, name: cat.name, color: cat.color, items });
    }
    const none = byCat.get(UNCATEGORIZED);
    if (none && none.length) {
      ordered.push({ id: UNCATEGORIZED, name: 'Sans catégorie', color: null, items: none });
    }
    return ordered;
  }, [enabledItems, categories]);

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

      {locked && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 8,
            background: 'rgba(220, 38, 38, 0.08)',
            border: '1px solid rgba(220, 38, 38, 0.3)',
            color: 'var(--color-danger)',
            fontWeight: 600
          }}
        >
          🔒 Événement verrouillé — aucune vente possible. Déverrouillez-le dans l'onglet Événements.
        </div>
      )}

      {enabledItems.length === 0 && (
        <p style={{ color: 'var(--color-muted)', marginTop: 16 }}>
          Aucun article activé pour cet événement. Activez-en depuis le Catalogue.
        </p>
      )}

      {groups.map((group) => (
        <section key={group.id} style={{ marginTop: 20 }}>
          <h2
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              color: 'var(--color-muted)',
              margin: '0 0 10px'
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: group.color ?? 'var(--color-border)'
              }}
            />
            {group.name}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 10
            }}
          >
            {group.items.map((item) => {
              const qty = cart.find((l) => l.itemId === item.id)?.qty ?? 0;
              const color = group.color;
              return (
                <button
                  key={item.id}
                  aria-label={item.name}
                  disabled={locked}
                  onClick={() => dispatchCart({ type: 'add', itemId: item.id })}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    minHeight: 104,
                    padding: '14px 8px',
                    borderRadius: 14,
                    border: `2px solid ${color ?? 'var(--color-border)'}`,
                    background: color ? tint(color) : '#fff',
                    opacity: locked ? 0.5 : 1,
                    textAlign: 'center'
                  }}
                >
                  {item.icon && <span style={{ fontSize: 30, lineHeight: 1 }}>{item.icon}</span>}
                  <span style={{ fontWeight: 600, fontSize: 16 }}>{item.name}</span>
                  <span style={{ fontWeight: 700, fontSize: 18 }}>{formatCents(item.price)}</span>

                  {qty > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        minWidth: 26,
                        height: 26,
                        borderRadius: 13,
                        background: 'var(--color-accent)',
                        color: '#fff',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 6px'
                      }}
                    >
                      {qty}
                    </span>
                  )}
                  {qty > 0 && !locked && (
                    <span
                      role="button"
                      aria-label={`Retirer ${item.name}`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        dispatchCart({ type: 'remove', itemId: item.id });
                      }}
                      style={{
                        position: 'absolute',
                        top: 6,
                        left: 6,
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        background: '#fff',
                        border: '1px solid var(--color-border)',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      −
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}

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
          disabled={cart.length === 0 || locked}
          onClick={() => setStep('recap')}
          style={{
            background: cart.length === 0 || locked ? 'var(--color-muted)' : 'var(--color-accent)',
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

      <RecapModal
        open={step === 'recap'}
        cart={cart}
        catalog={catalog}
        total={total}
        onBack={() => setStep('idle')}
        onConfirm={() => setStep('pay')}
      />

      <ValidateModal
        key={step === 'pay' ? 'pay-open' : 'pay-closed'}
        open={step === 'pay'}
        total={total}
        onCancel={() => setStep('recap')}
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
          setStep('idle');
        }}
      />
    </div>
  );
}
