import { type ReactNode, useEffect } from 'react';

// iOS-style bottom sheet. Keeps the original Modal API ({ open, onClose, title,
// children }) so existing callers slide up from the bottom with a grab handle.
export function Modal({
  open,
  onClose,
  title,
  children
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 50,
        animation: 'fade-in 0.2s ease'
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-grouped)',
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          padding: '8px 16px calc(16px + var(--safe-bottom))',
          width: '100%',
          maxWidth: 520,
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-sheet)',
          animation: 'sheet-up 0.28s cubic-bezier(0.32, 0.72, 0, 1)'
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 36,
            height: 5,
            borderRadius: 3,
            background: 'var(--separator-opaque)',
            margin: '4px auto 12px'
          }}
        />
        <h2 style={{ margin: '0 0 14px', fontSize: 20, fontWeight: 700 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
