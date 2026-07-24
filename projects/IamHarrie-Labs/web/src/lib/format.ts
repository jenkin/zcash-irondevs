export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function fmtDecimal(n: number, digits = 1): string {
  return n.toFixed(digits);
}

export function pctBetween(dateIso: string, t0: number, t1: number): number {
  const t = new Date(dateIso).getTime();
  if (t1 === t0) return 0;
  return ((t - t0) / (t1 - t0)) * 100;
}
