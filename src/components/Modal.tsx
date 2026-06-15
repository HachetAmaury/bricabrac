import { type ReactNode, useEffect, useState } from 'react';

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
  // Height of the on-screen keyboard, in px. iOS does not shrink the layout
  // viewport when the keyboard opens, so a bottom-anchored sheet would sit
  // behind it. We track the visual viewport and lift the sheet by this amount
  // to keep the focused input visible.
  const [kbInset, setKbInset] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!open || !vv) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbInset(inset);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      setKbInset(0);
    };
  }, [open]);

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
        paddingBottom: kbInset,
        transition: 'padding-bottom 0.2s ease',
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
          padding: `8px 16px calc(16px + ${kbInset > 0 ? '0px' : 'var(--safe-bottom)'})`,
          width: '100%',
          maxWidth: 520,
          maxHeight: kbInset > 0 ? `calc(92vh - ${kbInset}px)` : '92vh',
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
