import type { ReactNode } from 'react';
import { useChrome } from './chrome';
import { MenuIcon } from './icons';

// Circular/plain action button for the right side of the nav bar.
export function NavIconButton({
  onClick,
  label,
  children
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: 40,
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        color: 'var(--ios-blue)'
      }}
    >
      {children}
    </button>
  );
}

// iOS navigation bar: a sticky translucent chrome row (burger + optional right
// action) with a large title that scrolls beneath it.
export function NavBar({
  title,
  subtitle,
  rightAction
}: {
  title: string;
  subtitle?: string;
  rightAction?: ReactNode;
}) {
  const { openMenu } = useChrome();
  return (
    <>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          paddingTop: 'var(--safe-top)',
          background: 'rgba(249,249,251,0.82)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          borderBottom: '0.5px solid var(--separator)'
        }}
      >
        <div
          style={{
            height: 'var(--nav-height)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 8px'
          }}
        >
          <button
            onClick={openMenu}
            aria-label="Menu"
            style={{
              width: 40,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              color: 'var(--ios-blue)'
            }}
          >
            <MenuIcon size={26} />
          </button>
          <div style={{ flex: 1 }} />
          {rightAction}
        </div>
      </div>
      <div style={{ padding: '6px 16px 10px' }}>
        <h1 className="ios-large-title">{title}</h1>
        {subtitle && (
          <div style={{ color: 'var(--label-secondary)', fontSize: 15, marginTop: 2 }}>{subtitle}</div>
        )}
      </div>
    </>
  );
}
