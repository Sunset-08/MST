/** UTC calendar day `YYYY-MM-DD`. */
export const utcDay = (d: Date) => d.toISOString().slice(0, 10);

export function daysBetweenUtc(a: Date, b: Date): number {
  const da = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const dbb = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((dbb - da) / 86_400_000);
}

export const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
