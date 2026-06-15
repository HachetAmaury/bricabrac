import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { NavBar } from '../components/ui/NavBar';
import { ListSection, Row } from '../components/ui/ListSection';
import { LockIcon } from '../components/ui/icons';
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
      <div>
        <NavBar title="Rapport" />
        <p style={{ padding: '0 16px', color: 'var(--label-secondary)' }}>Aucun événement actif.</p>
      </div>
    );
  }

  const total = activeEvent.sales.reduce((acc, s) => acc + s.total, 0);
  const cashFloat = activeEvent.cashFloat ?? 0;
  const sortedSales = [...activeEvent.sales].sort((a, b) => b.timestamp - a.timestamp);
  const lastSaleId = sortedSales[0]?.id;

  return (
    <div>
      <NavBar
        title="Rapport"
        subtitle={activeEvent.name}
        rightAction={
          activeEvent.locked ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--ios-orange)', fontSize: 14, paddingRight: 8 }}>
              <LockIcon size={16} /> Verrouillé
            </span>
          ) : undefined
        }
      />

      <div style={{ padding: '0 16px' }}>
        <section
          style={{
            marginBottom: 22,
            padding: 18,
            borderRadius: 16,
            background: 'linear-gradient(135deg, #007aff, #0a84ff)',
            color: '#fff',
            boxShadow: '0 6px 16px rgba(0,122,255,0.25)'
          }}
        >
          <div style={{ opacity: 0.85, fontSize: 14 }}>Recette (ventes)</div>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: 0.3 }}>{formatCents(total)}</div>
          <div style={{ opacity: 0.85, fontSize: 14 }}>{activeEvent.sales.length} vente(s)</div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.25)', margin: '14px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ opacity: 0.85 }}>Fond de caisse</span>
            <span style={{ fontWeight: 600 }}>{formatCents(cashFloat)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span>Total en caisse</span>
            <span style={{ fontWeight: 700 }}>{formatCents(cashFloat + total)}</span>
          </div>
        </section>

        <ListSection header="Par article">
          {perItem.length === 0 ? (
            <Row title={<span style={{ color: 'var(--label-secondary)' }}>Aucune vente.</span>} />
          ) : (
            perItem.map((row) => (
              <Row
                key={row.name}
                title={row.name}
                trailing={
                  <span style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                    <span style={{ color: 'var(--label-secondary)' }}>× {row.qty}</span>
                    <span style={{ fontWeight: 600, minWidth: 70, textAlign: 'right' }}>{formatCents(row.subtotal)}</span>
                  </span>
                }
              />
            ))
          )}
        </ListSection>

        <ListSection header="Transactions">
          {sortedSales.length === 0 && (
            <Row title={<span style={{ color: 'var(--label-secondary)' }}>Aucune transaction.</span>} />
          )}
          {sortedSales.map((sale) => {
            const time = new Date(sale.timestamp).toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit'
            });
            const isExpanded = expanded[sale.id];
            const qty = sale.lines.reduce((a, l) => a + l.qty, 0);
            return (
              <div key={sale.id}>
                <Row
                  title={`${time} · ${formatCents(sale.total)}`}
                  subtitle={`${qty} article(s)`}
                  onClick={() => setExpanded((m) => ({ ...m, [sale.id]: !m[sale.id] }))}
                  accessory={
                    sale.id === lastSaleId && !activeEvent.locked ? (
                      <span
                        role="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (confirm('Annuler la dernière vente ?')) {
                            dispatchEvents({ type: 'undoLast', eventId: activeEvent.id });
                          }
                        }}
                        style={{ color: 'var(--ios-red)', fontWeight: 500 }}
                      >
                        Annuler
                      </span>
                    ) : (
                      <span style={{ width: 8 }} />
                    )
                  }
                />
                {isExpanded && (
                  <div style={{ padding: '0 16px 12px', fontSize: 15 }}>
                    {sale.lines.map((l) => (
                      <div key={l.itemId} style={{ display: 'flex', gap: 12, padding: '3px 0' }}>
                        <span style={{ flex: 1 }}>{l.name}</span>
                        <span style={{ color: 'var(--label-secondary)' }}>× {l.qty}</span>
                        <span>{formatCents(l.price * l.qty)}</span>
                      </div>
                    ))}
                    {sale.cashGiven !== undefined && (
                      <div style={{ color: 'var(--label-secondary)', marginTop: 4 }}>
                        Reçu : {formatCents(sale.cashGiven)} · Rendu : {formatCents(sale.change ?? 0)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </ListSection>
      </div>
    </div>
  );
}
