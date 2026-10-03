/**
 * Percent text ↔ basis points for admin forms (1 bp = 0.01%). Pure, shared by
 * the coupon and settings editors.
 */

/** "12.5" (%) → 1250 bps; accepts the Arabic decimal separator; at most two decimals. */
export function percentToBps(value: string): number | undefined {
  const text = value.trim().replace('٫', '.')
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return undefined
  const [whole = '0', fraction = ''] = text.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

/** 1250 bps → "12.5"; 1500 → "15". */
export function bpsToPercent(bps: number): string {
  const whole = Math.floor(bps / 100)
  const fraction = bps % 100
  return fraction === 0
    ? String(whole)
    : `${whole}.${String(fraction).padStart(2, '0').replace(/0$/, '')}`
}
