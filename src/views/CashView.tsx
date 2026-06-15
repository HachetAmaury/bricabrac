import { useMemo, useState, type CSSProperties } from 'react';
import { useApp } from '../state/AppContext';
import { NavBar } from '../components/ui/NavBar';
import { ListSection, Row } from '../components/ui/ListSection';
import { Button } from '../components/ui/Button';
import { formatCents, parseAmount } from '../lib/money';
import { DENOMINATIONS, cashCountTotal } from '../lib/cash';
import { LockIcon } from '../components/ui/icons';
import type { CashCount } from '../types';

function denomLabel(valueCents: number): string {
  return valueCents >= 100 ? `${valueCents / 100} €` : `${valueCents} c`;
}

// Large, touch-friendly stepper button for the cash-count rows.
const stepBtn: CSSProperties = {
  width: 46,
  height: 46,
  flexShrink: 0,
  borderRadius: 12,
  border: '1px solid var(--separator)',
  background: 'var(--bg-elevated)',
  color: 'var(--ios-blue)',
  fontSize: 26,
  fontWeight: 600,
  lineHeight: 1
};

export function CashView() {
  const { activeEvent, dispatchEvents } = useApp();
  const [floatText, setFloatText] = useState(() =>
    activeEvent?.cashFloat ? (activeEvent.cashFloat / 100).toString().replace('.', ',') : ''
  );

  const salesTotal = useMemo(
    () => (activeEvent ? activeEvent.sales.reduce((acc, s) => acc + s.total, 0) : 0),
    [activeEvent]
  );

  if (!activeEvent) {
    return (
      <div>
        <NavBar title="Caisse" />
        <p style={{ padding: '0 16px', color: 'var(--label-secondary)' }}>Aucun événement actif.</p>
      </div>
    );
  }

  const locked = activeEvent.locked ?? false;
  const cashFloat = activeEvent.cashFloat ?? 0;
  const count: CashCount = activeEvent.cashCount ?? {};
  const counted = cashCountTotal(count);
  const countedRevenue = counted - cashFloat;
  const diff = countedRevenue - salesTotal;

  const setCount = (value: number, qty: number) => {
    if (locked) return;
    const next: CashCount = { ...count };
    if (qty <= 0) delete next[String(value)];
    else next[String(value)] = qty;
    dispatchEvents({ type: 'setCashCount', id: activeEvent.id, cashCount: next });
  };

  const commitFloat = () => {
    if (locked) return;
    const cents = parseAmount(floatText);
    dispatchEvents({ type: 'setCashFloat', id: activeEvent.id, cashFloat: cents ?? 0 });
  };

  return (
    <div>
      <NavBar
        title="Caisse"
        subtitle={activeEvent.name}
        rightAction={
          locked ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--ios-orange)', fontSize: 14, paddingRight: 8 }}>
              <LockIcon size={16} /> Verrouillé
            </span>
          ) : undefined
        }
      />

      <div style={{ padding: '0 16px' }}>
        {locked && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              margin: '12px 0',
              padding: 12,
              borderRadius: 12,
              background: 'rgba(255,149,0,0.12)',
              color: 'var(--ios-orange)',
              fontWeight: 600
            }}
          >
            <LockIcon size={18} />
            Événement verrouillé — la caisse ne peut plus être modifiée.
          </div>
        )}
        <ListSection
          header="Fond de caisse"
          footer="Montant présent dans la caisse en début de journée."
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 12 }}>
            <input
              inputMode="decimal"
              value={floatText}
              onChange={(e) => setFloatText(e.target.value)}
              onBlur={commitFloat}
              placeholder="0,00"
              disabled={locked}
              style={{ flex: 1, padding: 12, fontSize: 17, opacity: locked ? 0.5 : 1 }}
            />
            <Button variant="filled" onClick={commitFloat} disabled={locked}>
              Enregistrer
            </Button>
          </div>
        </ListSection>

        <ListSection header="Comptage de caisse" footer={`Total compté : ${formatCents(counted)}`}>
          {DENOMINATIONS.map((d) => {
            const qty = count[String(d.value)] ?? 0;
            const sub = qty * d.value;
            return (
              <Row
                key={d.value}
                title={<span style={{ fontWeight: 700 }}>{denomLabel(d.value)}</span>}
                subtitle={`${d.kind === 'note' ? 'billet' : 'pièce'} · ${formatCents(sub)}`}
                style={{ background: qty > 0 ? 'rgba(0,122,255,0.05)' : 'transparent' }}
                trailing={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      aria-label={`Moins ${denomLabel(d.value)}`}
                      onClick={() => setCount(d.value, Math.max(0, qty - 1))}
                      disabled={locked || qty === 0}
                      style={{ ...stepBtn, opacity: locked || qty === 0 ? 0.4 : 1 }}
                    >
                      −
                    </button>
                    <input
                      inputMode="numeric"
                      aria-label={`Quantité ${denomLabel(d.value)}`}
                      value={qty === 0 ? '' : String(qty)}
                      placeholder="0"
                      disabled={locked}
                      onChange={(e) => {
                        const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                        setCount(d.value, Number.isFinite(n) ? n : 0);
                      }}
                      style={{ width: 50, height: 46, padding: 4, textAlign: 'center', fontSize: 20, fontWeight: 600, borderRadius: 10, opacity: locked ? 0.5 : 1 }}
                    />
                    <button
                      aria-label={`Plus ${denomLabel(d.value)}`}
                      onClick={() => setCount(d.value, qty + 1)}
                      disabled={locked}
                      style={{ ...stepBtn, background: 'var(--ios-blue)', color: '#fff', borderColor: 'var(--ios-blue)', opacity: locked ? 0.4 : 1 }}
                    >
                      +
                    </button>
                  </div>
                }
              />
            );
          })}
        </ListSection>

        <ListSection
          header="Bilan"
          footer={
            diff === 0 && counted > 0 ? '✓ Le comptage correspond exactement aux ventes enregistrées.' : undefined
          }
        >
          <SummaryLine label="Total compté" value={formatCents(counted)} />
          <SummaryLine label="− Fond de caisse" value={formatCents(cashFloat)} muted />
          <SummaryLine label="= Recette comptée" value={formatCents(countedRevenue)} strong />
          <SummaryLine label="Recette enregistrée (rapport)" value={formatCents(salesTotal)} muted />
          <SummaryLine
            label="Écart"
            value={`${diff > 0 ? '+' : ''}${formatCents(diff)}`}
            strong
            color={diff === 0 ? 'var(--label-secondary)' : diff > 0 ? 'var(--ios-green)' : 'var(--ios-red)'}
          />
        </ListSection>
      </div>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  muted,
  strong,
  color
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
  color?: string;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 16px' }}>
      <span style={{ color: muted ? 'var(--label-secondary)' : undefined, fontSize: strong ? 16 : 15 }}>{label}</span>
      <span style={{ fontWeight: strong ? 700 : 500, fontSize: strong ? 18 : 16, color }}>{value}</span>
    </div>
  );
}
