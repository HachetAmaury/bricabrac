// iOS-style switch.
export function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean;
  onChange: () => void;
  label?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      style={{
        width: 51,
        height: 31,
        flexShrink: 0,
        borderRadius: 16,
        border: 'none',
        padding: 2,
        background: checked ? 'var(--ios-green)' : '#e9e9ea',
        display: 'flex',
        justifyContent: checked ? 'flex-end' : 'flex-start',
        transition: 'background 0.2s ease'
      }}
    >
      <span
        style={{
          width: 27,
          height: 27,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
        }}
      />
    </button>
  );
}
