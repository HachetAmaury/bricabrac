import { useMemo, useState, type CSSProperties } from 'react';
import { useApp } from '../state/AppContext';
import { formatCents, parseAmount } from '../lib/money';
import { DENOMINATIONS, cashCountTotal } from '../lib/cash';
import type { CashCount } from '../types';

function denomLabel(valueCents: number): string {
  return valueCents >= 100 ? `${valueCents / 100} €` : `${valueCents} c`;
}

// Large, touch-friendly stepper button for the cash-count rows.
const stepBtn: CSSProperties = {
  width: 56,
  height: 56,
  flexShrink: 0,
  borderRadius: 12,
  border: '1px solid var(--color-border)',
  background: '#fff',
  fontSize: 28,
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
      <div style={{ padding: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Caisse</h1>
        <p style={{ marginTop: 16, color: 'var(--color-muted)' }}>Aucun événement actif.</p>
      </div>
    );
  }

  const cashFloat = activeEvent.cashFloat ?? 0;
  const count: CashCount = activeEvent.cashCount ?? {};
  const counted = cashCountTotal(count);
  const countedRevenue = counted - cashFloat; // recette comptée = total compté − fond de caisse
  const diff = countedRevenue - salesTotal; // écart entre comptage et ventes enregistrées

  const setCount = (value: number, qty: number) => {
    const next: CashCount = { ...count };
    if (qty <= 0) delete next[String(value)];
    else next[String(value)] = qty;
    dispatchEvents({ type: 'setCashCount', id: activeEvent.id, cashCount: next });
  };

  const commitFloat = () => {
    const cents = parseAmount(floatText);
    dispatchEvents({ type: 'setCashFloat', id: activeEvent.id, cashFloat: cents ?? 0 });
  };

  return (
    <div style={{ padding: 16 }}>
      <header>
        <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>{activeEvent.name}</div>
        <h1 style={{ margin: 0, fontSize: 22 }}>Caisse</h1>
      </header>

      {/* Fond de caisse */}
      <section
        style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 12,
          background: '#fff',
          border: '1px solid var(--color-border)'
        }}
      >
        <h2 style={{ fontSize: 14, color: 'var(--color-muted)', margin: '0 0 8px' }}>Fond de caisse</h2>
        <p style={{ margin: '0 0 8px', color: 'var(--color-muted)', fontSize: 13 }}>
          Montant présent dans la caisse en début de journée.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            inputMode="decimal"
            value={floatText}
            onChange={(e) => setFloatText(e.target.value)}
            onBlur={commitFloat}
            placeholder="0,00"
            style={{ flex: 1, padding: 10, fontSize: 16 }}
          />
          <button
            onClick={commitFloat}
            style={{ background: 'var(--color-accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px' }}
          >
            Enregistrer
          </button>
        </div>
        <div style={{ marginTop: 8, color: 'var(--color-muted)', fontSize: 13 }}>
          Actuel : <strong>{formatCents(cashFloat)}</strong>
        </div>
      </section>

      {/* Comptage */}
      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 14, color: 'var(--color-muted)', margin: '0 0 8px' }}>Comptage de caisse</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {DENOMINATIONS.map((d) => {
            const qty = count[String(d.value)] ?? 0;
            const sub = qty * d.value;
            return (
              <li
                key={d.value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  marginBottom: 8,
                  borderRadius: 12,
                  border: '1px solid var(--color-border)',
                  background: qty > 0 ? 'rgba(37, 99, 235, 0.06)' : '#fff'
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{denomLabel(d.value)}</div>
                  <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                    {d.kind === 'note' ? 'billet' : 'pièce'} · {formatCents(sub)}
                  </div>
                </div>
                <button
                  aria-label={`Moins ${denomLabel(d.value)}`}
                  onClick={() => setCount(d.value, Math.max(0, qty - 1))}
                  disabled={qty === 0}
                  style={{
                    ...stepBtn,
                    opacity: qty === 0 ? 0.4 : 1
                  }}
                >
                  −
                </button>
                <input
                  inputMode="numeric"
                  aria-label={`Quantité ${denomLabel(d.value)}`}
                  value={qty === 0 ? '' : String(qty)}
                  placeholder="0"
                  onChange={(e) => {
                    const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                    setCount(d.value, Number.isFinite(n) ? n : 0);
                  }}
                  style={{ width: 64, height: 56, padding: 6, textAlign: 'center', fontSize: 22, fontWeight: 600, borderRadius: 10, border: '1px solid var(--color-border)' }}
                />
                <button
                  aria-label={`Plus ${denomLabel(d.value)}`}
                  onClick={() => setCount(d.value, qty + 1)}
                  style={{ ...stepBtn, background: 'var(--color-accent)', color: '#fff', borderColor: 'var(--color-accent)' }}
                >
                  +
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Réconciliation */}
      <section
        style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 12,
          background: 'rgba(37, 99, 235, 0.06)',
          border: '1px solid rgba(37, 99, 235, 0.2)'
        }}
      >
        <Row label="Total compté" value={formatCents(counted)} />
        <Row label="− Fond de caisse" value={formatCents(cashFloat)} muted />
        <Row label="= Recette comptée" value={formatCents(countedRevenue)} strong />
        <div style={{ height: 1, background: 'var(--color-border)', margin: '10px 0' }} />
        <Row label="Recette enregistrée (rapport)" value={formatCents(salesTotal)} muted />
        <Row
          label="Écart"
          value={`${diff > 0 ? '+' : ''}${formatCents(diff)}`}
          strong
          color={diff === 0 ? 'var(--color-muted)' : diff > 0 ? '#15803d' : 'var(--color-danger)'}
        />
        {diff === 0 && counted > 0 && (
          <p style={{ margin: '8px 0 0', color: '#15803d', fontSize: 13 }}>
            ✓ Le comptage correspond exactement aux ventes enregistrées.
          </p>
        )}
      </section>
    </div>
  );
}

function Row({
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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0' }}>
      <span style={{ color: muted ? 'var(--color-muted)' : undefined, fontSize: strong ? 16 : 14 }}>{label}</span>
      <span
        style={{
          fontWeight: strong ? 700 : 500,
          fontSize: strong ? 18 : 15,
          color: color
        }}
      >
        {value}
      </span>
    </div>
  );
}
