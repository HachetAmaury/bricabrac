export function formatCents(cents: number): string {
  if (!Number.isFinite(cents)) return '—';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  const euros = Math.floor(abs / 100);
  const remainder = abs % 100;
  const decimals = remainder.toString().padStart(2, '0');
  return `${sign}${euros},${decimals} €`;
}

export function parseAmount(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const normalised = trimmed.replace(',', '.');
  // Non-negative only: integer with optional fractional part. Reject leading '-'.
  const match = normalised.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const eurosPart = match[1];
  const fracRaw = match[2] ?? '';
  // Truncate (not round) to 2 decimals to match documented behaviour.
  const fracTruncated = fracRaw.slice(0, 2).padEnd(2, '0');
  const euros = Number.parseInt(eurosPart, 10);
  const cents = Number.parseInt(fracTruncated, 10);
  if (!Number.isFinite(euros) || !Number.isFinite(cents)) return null;
  return euros * 100 + cents;
}

export function addCents(a: number, b: number): number {
  return a + b;
}

export function sumLines(lines: { price: number; qty: number }[]): number {
  return lines.reduce((acc, l) => acc + l.price * l.qty, 0);
}
