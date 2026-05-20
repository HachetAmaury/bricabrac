export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for very old runtimes; tests run in jsdom where randomUUID exists.
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
