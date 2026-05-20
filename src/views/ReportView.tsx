import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { formatCents } from '../lib/money';

export function ReportView() {
  const { activeEvent, dispatchEvents } = useApp();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const perItem = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; subtotal: number }>();
    if (!activeEvent) return [];
    for (const sale of activeEvent.sales) {
      for (const line of sale.lines) {
        const existing = map.get(line.itemId) ?? { name: line.name, qty: 0, subtotal: 0 };
        existing.qty += line.qty;
        existing.subtotal += line.price * line.qty;
        existing.name = line.name;
        map.set(line.itemId, existing);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.subtotal - a.subtotal);
  }, [activeEvent]);

  if (!activeEvent) {
    return (
      <div style={{ padding: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Rapport</h1>
        <p style={{ marginTop: 16, color: 'var(--color-muted)' }}>Aucun événement actif.</p>
      </div>
    );
  }

  const total = activeEvent.sales.reduce((acc, s) => acc + s.total, 0);
  const sortedSales = [...activeEvent.sales].sort((a, b) => b.timestamp - a.timestamp);
  const lastSaleId = sortedSales[0]?.id;

  return (
    <div style={{ padding: 16 }}>
      <header>
        <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>{activeEvent.name}</div>
        <h1 style={{ margin: 0, fontSize: 22 }}>Rapport</h1>
      </header>

      <section
        style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 12,
          background: 'rgba(37, 99, 235, 0.08)',
          border: '1px solid rgba(37, 99, 235, 0.2)'
        }}
      >
        <div style={{ color: 'var(--color-muted)', fontSize: 13 }}>Total</div>
        <div style={{ fontSize: 28, fontWeight: 700 }}>{formatCents(total)}</div>
        <div style={{ color: 'var(--color-muted)', fontSize: 13 }}>
          {activeEvent.sales.length} vente(s)
        </div>
      </section>

      <h2 style={{ fontSize: 14, color: 'var(--color-muted)', marginTop: 24 }}>Par article</h2>
      {perItem.length === 0 && <p style={{ color: 'var(--color-muted)' }}>Aucune vente.</p>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {perItem.map((row) => (
          <li
            key={row.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 0',
              borderBottom: '1px solid var(--color-border)'
            }}
          >
            <div style={{ flex: 1 }}>{row.name}</div>
            <div style={{ color: 'var(--color-muted)' }}>× {row.qty}</div>
            <div style={{ fontWeight: 500 }}>{formatCents(row.subtotal)}</div>
          </li>
        ))}
      </ul>

      <h2 style={{ fontSize: 14, color: 'var(--color-muted)', marginTop: 24 }}>Transactions</h2>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {sortedSales.map((sale) => {
          const time = new Date(sale.timestamp).toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit'
          });
          const isExpanded = expanded[sale.id];
          return (
            <li key={sale.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
              <button
                onClick={() => setExpanded((m) => ({ ...m, [sale.id]: !m[sale.id] }))}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12
                }}
              >
                <span style={{ flex: 1, textAlign: 'left' }}>
                  {time} · {formatCents(sale.total)} · {sale.lines.reduce((a, l) => a + l.qty, 0)} article(s)
                </span>
                {sale.id === lastSaleId && (
                  <span
                    role="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (confirm('Annuler la dernière vente ?')) {
                        dispatchEvents({ type: 'undoLast', eventId: activeEvent.id });
                      }
                    }}
                    style={{ color: 'var(--color-danger)', fontWeight: 500 }}
                  >
                    Annuler
                  </span>
                )}
              </button>
              {isExpanded && (
                <div style={{ paddingLeft: 8, marginTop: 4, fontSize: 14 }}>
                  {sale.lines.map((l) => (
                    <div key={l.itemId} style={{ display: 'flex', gap: 12 }}>
                      <span style={{ flex: 1 }}>{l.name}</span>
                      <span style={{ color: 'var(--color-muted)' }}>× {l.qty}</span>
                      <span>{formatCents(l.price * l.qty)}</span>
                    </div>
                  ))}
                  {sale.cashGiven !== undefined && (
                    <div style={{ color: 'var(--color-muted)', marginTop: 4 }}>
                      Reçu : {formatCents(sale.cashGiven)} · Rendu : {formatCents(sale.change ?? 0)}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
