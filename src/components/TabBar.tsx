export type TabId = 'events' | 'sell' | 'report' | 'catalog';

const tabs: { id: TabId; label: string }[] = [
  { id: 'events', label: 'Événements' },
  { id: 'sell', label: 'Vente' },
  { id: 'report', label: 'Rapport' },
  { id: 'catalog', label: 'Catalogue' }
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
        height: 'var(--tab-height)',
        display: 'grid',
        gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
        background: '#ffffff',
        borderTop: '1px solid var(--color-border)',
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          style={{
            background: 'transparent',
            border: 'none',
            color: active === t.id ? 'var(--color-accent)' : 'var(--color-muted)',
            fontWeight: active === t.id ? 600 : 400
          }}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
