import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

type Variant = 'filled' | 'tinted' | 'gray' | 'plain' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

const base: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  border: 'none',
  fontWeight: 600,
  lineHeight: 1,
  whiteSpace: 'nowrap'
};

const sizes: Record<Size, CSSProperties> = {
  sm: { minHeight: 32, padding: '0 12px', fontSize: 15, borderRadius: 8 },
  md: { minHeight: 44, padding: '0 16px', fontSize: 16, borderRadius: 12 },
  lg: { minHeight: 50, padding: '0 20px', fontSize: 17, borderRadius: 14, width: '100%' }
};

function variantStyle(variant: Variant, disabled: boolean): CSSProperties {
  if (disabled && (variant === 'filled' || variant === 'destructive')) {
    return { background: 'var(--fill)', color: 'var(--label-tertiary)' };
  }
  switch (variant) {
    case 'filled':
      return { background: 'var(--ios-blue)', color: '#fff' };
    case 'destructive':
      return { background: 'var(--ios-red)', color: '#fff' };
    case 'tinted':
      return { background: 'rgba(0,122,255,0.12)', color: 'var(--ios-blue)' };
    case 'gray':
      return { background: 'var(--fill)', color: 'var(--label)' };
    case 'plain':
      return { background: 'transparent', color: 'var(--ios-blue)' };
  }
}

export function Button({
  variant = 'gray',
  size = 'md',
  leftIcon,
  style,
  children,
  disabled,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  leftIcon?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      disabled={disabled}
      style={{
        ...base,
        ...sizes[size],
        ...variantStyle(variant, !!disabled),
        ...style
      }}
      {...rest}
    >
      {leftIcon}
      {children}
    </button>
  );
}
