import { Star } from 'lucide-react'
import { cn } from '@/utils/cn'

/** Five stars filled to the rating (decorative); the label carries the value for assistive tech. */
export function RatingStars({
  rating,
  label,
  className,
}: {
  rating: number
  label: string
  className?: string
}) {
  const percent = Math.max(0, Math.min(100, (rating / 5) * 100))
  return (
    <span role="img" aria-label={label} className={cn('relative inline-flex shrink-0', className)}>
      <span className="flex text-line-strong" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className="size-3.5" strokeWidth={1.5} />
        ))}
      </span>
      <span
        className="absolute inset-y-0 start-0 flex overflow-hidden text-champagne-strong"
        style={{ width: `${percent}%` }}
        aria-hidden="true"
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className="size-3.5 shrink-0 fill-current" strokeWidth={1.5} />
        ))}
      </span>
    </span>
  )
}
