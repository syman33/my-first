import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/utils/cn'

/**
 * KPI tile (dataviz figure contract): label · value (proportional figures) ·
 * signed delta against a named period. The delta's colour follows direction
 * × whether "up" is good, and it always carries an icon and words — never
 * colour alone.
 */
export function StatTile({
  label,
  value,
  delta,
}: {
  label: string
  value: string
  delta: { text: string; direction: 'up' | 'down' | 'flat' | 'none'; good: boolean | null }
}) {
  const Icon =
    delta.direction === 'up' ? TrendingUp : delta.direction === 'down' ? TrendingDown : Minus
  return (
    <div className="border border-line bg-paper p-5">
      <p className="text-xs text-muted">{label}</p>
      <p className="ltr-nums mt-2 text-xl font-semibold text-ink 2xl:text-2xl">{value}</p>
      <p
        className={cn(
          'mt-2 flex items-center gap-1.5 text-xs',
          delta.good === true
            ? 'text-success'
            : delta.good === false
              ? 'text-danger'
              : 'text-muted',
        )}
      >
        {delta.direction === 'none' ? null : (
          <Icon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
        )}
        <span>{delta.text}</span>
      </p>
    </div>
  )
}
