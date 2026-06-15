import type { CSSProperties, ReactNode } from 'react';
import { ChevronRightIcon } from './icons';

export function ListSection({
  header,
  footer,
  children,
  style
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section style={{ margin: '0 0 22px', ...style }}>
      {header && (
        <div
          style={{
            fontSize: 13,
            color: 'var(--label-secondary)',
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            padding: '0 16px 7px'
          }}
        >
          {header}
        </div>
      )}
      <div className="ios-list">{children}</div>
      {footer && (
        <div style={{ fontSize: 13, color: 'var(--label-secondary)', padding: '7px 16px 0' }}>{footer}</div>
      )}
    </section>
  );
}

// A single grouped-list row. Tappable when `onClick` is set (shows a chevron
// unless `accessory` is provided). Kept as a div so rows can host their own
// nested buttons without invalid nested-button markup.
export function Row({
  leading,
  title,
  subtitle,
  trailing,
  accessory,
  onClick,
  danger,
  style
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  accessory?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  style?: CSSProperties;
}) {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick!();
              }
            }
          : undefined
      }
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 48,
        padding: '10px 16px',
        background: 'transparent',
        cursor: interactive ? 'pointer' : 'default',
        ...style
      }}
    >
      {leading}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, color: danger ? 'var(--ios-red)' : 'var(--label)' }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 13, color: 'var(--label-secondary)', marginTop: 1 }}>{subtitle}</div>
        )}
      </div>
      {trailing}
      {interactive && (accessory ?? <ChevronRightIcon size={18} style={{ color: 'var(--label-tertiary)' }} />)}
    </div>
  );
}
