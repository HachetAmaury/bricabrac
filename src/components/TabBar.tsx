import type { ReactNode } from 'react';
import { CalendarIcon, CartIcon, ChartIcon, CashIcon, TagIcon } from './ui/icons';

export type TabId = 'events' | 'sell' | 'report' | 'cash' | 'catalog';

const tabs: { id: TabId; label: string; Icon: (p: { size?: number }) => ReactNode }[] = [
  { id: 'events', label: 'Événements', Icon: CalendarIcon },
  { id: 'sell', label: 'Vente', Icon: CartIcon },
  { id: 'report', label: 'Rapport', Icon: ChartIcon },
  { id: 'cash', label: 'Caisse', Icon: CashIcon },
  { id: 'catalog', label: 'Catalogue', Icon: TagIcon }
];

export function TabBar({
  active,
  onSelect
}: {
  active: TabId;
  onSelect: (id: TabId) => void;
}) {
  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'grid',
        gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
        background: 'rgba(249,249,251,0.82)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderTop: '0.5px solid var(--separator)',
        paddingBottom: 'var(--safe-bottom)',
        zIndex: 30
      }}
    >
      {tabs.map((t) => {
        const isActive = active === t.id;
        const color = isActive ? 'var(--ios-blue)' : 'var(--label-secondary)';
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            aria-label={t.label}
            aria-current={isActive ? 'page' : undefined}
            style={{
              height: 'var(--tab-height)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              background: 'transparent',
              border: 'none',
              color
            }}
          >
            <t.Icon size={26} />
            <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 500, color }}>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
