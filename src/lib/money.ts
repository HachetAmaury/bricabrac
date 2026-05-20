export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const remainder = abs % 100;
  const decimals = remainder.toString().padStart(2, '0');
  return `${sign}${euros},${decimals} €`;
}

export function parseAmount(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const normalised = trimmed.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalised)) return null;
  const asFloat = Number(normalised);
  if (!Number.isFinite(asFloat)) return null;
  return Math.round(asFloat * 100);
}

export function addCents(a: number, b: number): number {
  return a + b;
}

export function sumLines(lines: { price: number; qty: number }[]): number {
  return lines.reduce((acc, l) => acc + l.price * l.qty, 0);
}
