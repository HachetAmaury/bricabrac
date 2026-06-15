import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { ValidateModal } from '../components/ValidateModal';
import { RecapModal } from '../components/RecapModal';
import { NavBar } from '../components/ui/NavBar';
import { Button } from '../components/ui/Button';
import { LockIcon } from '../components/ui/icons';
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
      <div>
        <NavBar title="Vente" />
        <p style={{ padding: '0 16px', color: 'var(--label-secondary)' }}>
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
    <div style={{ paddingBottom: 'calc(var(--tab-height) + var(--safe-bottom) + 80px)' }}>
      <NavBar
        title="Vente"
        subtitle={activeEvent.name}
        rightAction={
          <span style={{ color: 'var(--label-secondary)', fontSize: 15, paddingRight: 8 }}>
            Journée {formatCents(dayTotal)}
          </span>
        }
      />

      <div style={{ padding: '0 16px' }}>
        {locked && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
              padding: 12,
              borderRadius: 12,
              background: 'rgba(255,149,0,0.12)',
              color: 'var(--ios-orange)',
              fontWeight: 600
            }}
          >
            <LockIcon size={18} />
            Événement verrouillé — déverrouillez-le dans l'onglet Événements.
          </div>
        )}

        {enabledItems.length === 0 && (
          <p style={{ color: 'var(--label-secondary)' }}>
            Aucun article activé pour cet événement. Activez-en depuis le Catalogue.
          </p>
        )}

        {groups.map((group) => (
          <section key={group.id} style={{ marginBottom: 22 }}>
            <h2
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                textTransform: 'uppercase',
                letterSpacing: 0.4,
                color: 'var(--label-secondary)',
                margin: '0 0 10px',
                paddingLeft: 4
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: group.color ?? 'var(--separator-opaque)'
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
                      minHeight: 108,
                      padding: '14px 8px',
                      borderRadius: 16,
                      border: color ? `1.5px solid ${color}` : '1px solid var(--separator)',
                      background: color ? tint(color) : 'var(--bg-elevated)',
                      color: 'var(--label)',
                      boxShadow: 'var(--shadow-card)',
                      opacity: locked ? 0.5 : 1,
                      textAlign: 'center'
                    }}
                  >
                    {item.icon && <span style={{ fontSize: 32, lineHeight: 1 }}>{item.icon}</span>}
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
                          background: 'var(--ios-blue)',
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
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--separator)',
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
      </div>

      <footer
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 'calc(var(--tab-height) + var(--safe-bottom))',
          padding: 12,
          background: 'rgba(249,249,251,0.92)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          borderTop: '0.5px solid var(--separator)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          zIndex: 25
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 700, flex: 1 }}>{formatCents(total)}</div>
        <Button
          variant="filled"
          size="lg"
          style={{ width: 'auto', minWidth: 130 }}
          disabled={cart.length === 0 || locked}
          onClick={() => setStep('recap')}
        >
          Valider
        </Button>
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
