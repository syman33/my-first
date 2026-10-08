'use client'

import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { labelIndexes, xPercent } from '@/lib/admin/chart'
import { cn } from '@/utils/cn'

export interface SalesChartPoint {
  /** Full period label for the tooltip and table, e.g. "Sun, 28 Sep". */
  label: string
  /** Compact axis label, e.g. "28 Sep" or "14". */
  axisLabel: string
  value: number
  valueLabel: string
  ordersLabel: string
}

interface SalesChartProps {
  /** Direction of the interface language, for date and text labels (the plot itself runs left to right). */
  dir: 'rtl' | 'ltr'
  title: string
  description?: string
  points: SalesChartPoint[]
  /** Tick values (halalas) with their labels, from 0 up to the axis top. */
  ticks: { value: number; label: string }[]
  emptyNote: string | null
  labels: {
    showTable: string
    hideTable: string
    period: string
    sales: string
    orders: string
    hint: string
  }
}

const PLOT = 1000

/**
 * Single-series sales line (dataviz spec: 2px line, ~10% area wash, hairline
 * solid grid, end dot with a surface ring, crosshair + tooltip on hover and
 * keyboard focus, and a table view carrying every value).
 *
 * The plot runs left to right in both languages (dates and amounts are
 * written left to right); labels and tooltip text are localised.
 */
export function SalesChart({
  dir,
  title,
  description,
  points,
  ticks,
  emptyNote,
  labels,
}: SalesChartProps) {
  const id = useId()
  const [active, setActive] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)
  const count = points.length
  const top = ticks[ticks.length - 1]?.value || 1
  const y = (value: number) => PLOT - (value / top) * PLOT
  const x = (index: number) => (xPercent(index, count) / 100) * PLOT

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ')
  const area = count > 1 ? `${line} L${x(count - 1)},${PLOT} L${x(0)},${PLOT} Z` : ''
  const last = count - 1
  const shown = active ?? null
  const activePoint = shown !== null ? points[shown] : undefined
  const activeX = shown !== null ? xPercent(shown, count) : 0

  function indexAt(event: PointerEvent<HTMLDivElement>): number {
    const rect = event.currentTarget.getBoundingClientRect()
    const fraction = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
    return count <= 1 ? 0 : Math.round(fraction * (count - 1))
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (count === 0) return
    const current = active ?? last
    let next: number | null = current
    if (event.key === 'ArrowLeft') next = Math.max(0, current - 1)
    else if (event.key === 'ArrowRight') next = Math.min(last, current + 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    else if (event.key === 'Escape') next = null
    else return
    event.preventDefault()
    setActive(next)
  }

  return (
    <figure className="border border-line bg-paper p-5" aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <figcaption>
          <h2 id={`${id}-title`} className="text-sm font-medium text-ink">
            {title}
          </h2>
          {description ? <p className="mt-1 text-xs text-muted">{description}</p> : null}
        </figcaption>
        <button
          type="button"
          className="text-xs text-muted underline underline-offset-4 hover:text-ink"
          aria-expanded={showTable}
          aria-controls={`${id}-table`}
          onClick={() => setShowTable((value) => !value)}
        >
          {showTable ? labels.hideTable : labels.showTable}
        </button>
      </div>

      <div className="mt-6 flex gap-3" dir="ltr">
        {/* Y axis: tick labels aligned with the gridlines. */}
        <div
          className="w-20 shrink-0 text-end text-[11px] text-muted tabular-nums"
          aria-hidden="true"
        >
          {/* Same height as the plot, so every label sits on its gridline. */}
          <div className="relative h-56">
            {ticks.map((tick) => (
              <span
                key={tick.value}
                className="absolute end-0 -translate-y-1/2 whitespace-nowrap"
                style={{ top: `${(y(tick.value) / PLOT) * 100}%` }}
              >
                {tick.label}
              </span>
            ))}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-56">
            {ticks.map((tick) => (
              <div
                key={tick.value}
                className={cn(
                  'absolute inset-x-0 h-px',
                  tick.value === 0 ? 'bg-line-strong' : 'bg-line',
                )}
                style={{ top: `${(y(tick.value) / PLOT) * 100}%` }}
                aria-hidden="true"
              />
            ))}
            <svg
              viewBox={`0 0 ${PLOT} ${PLOT}`}
              preserveAspectRatio="none"
              className="absolute inset-0 size-full overflow-visible"
              aria-hidden="true"
              focusable="false"
            >
              {area ? <path d={area} className="fill-chart-1" fillOpacity={0.1} /> : null}
              {count > 1 ? (
                <path
                  d={line}
                  fill="none"
                  className="stroke-chart-1"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </svg>
            {/* End dot (and the lone point of a one-bucket range): 8px with a 2px surface ring. */}
            {count > 0 ? (
              <span
                className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-chart-1"
                style={{
                  left: `${xPercent(last, count)}%`,
                  top: `${(y(points[last]!.value) / PLOT) * 100}%`,
                }}
                aria-hidden="true"
              />
            ) : null}
            {activePoint ? (
              <>
                <div
                  className="pointer-events-none absolute inset-y-0 w-px bg-ink/40"
                  style={{ left: `${activeX}%` }}
                  aria-hidden="true"
                />
                <span
                  className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-chart-1"
                  style={{ left: `${activeX}%`, top: `${(y(activePoint.value) / PLOT) * 100}%` }}
                  aria-hidden="true"
                />
                <div
                  className={cn(
                    'pointer-events-none absolute top-0 z-10 min-w-36 border border-line bg-paper px-3 py-2 text-xs shadow-sm',
                    activeX < 18
                      ? 'translate-x-2'
                      : activeX > 82
                        ? '-translate-x-[calc(100%+0.5rem)]'
                        : '-translate-x-1/2',
                  )}
                  style={{ left: `${activeX}%` }}
                  dir={dir}
                >
                  <p className="ltr-nums text-sm font-medium text-ink">{activePoint.valueLabel}</p>
                  <p className="mt-0.5 text-muted">{activePoint.ordersLabel}</p>
                  <p className="mt-1 text-muted">{activePoint.label}</p>
                </div>
              </>
            ) : null}
            {/* Hover/focus layer: the whole plot is the target; the crosshair snaps to the nearest bucket. */}
            <div
              className="absolute inset-0 cursor-crosshair focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
              tabIndex={0}
              role="group"
              aria-label={`${title}. ${labels.hint}`}
              onPointerMove={(event) => setActive(indexAt(event))}
              onPointerDown={(event) => setActive(indexAt(event))}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive((value) => value ?? last)}
              onBlur={() => setActive(null)}
              onKeyDown={onKeyDown}
            />
            <p className="sr-only" aria-live="polite" dir={dir}>
              {activePoint
                ? `${activePoint.label}: ${activePoint.valueLabel}, ${activePoint.ordersLabel}`
                : ''}
            </p>
          </div>
          <div className="relative mt-2 h-5 text-[11px] text-muted" aria-hidden="true">
            {labelIndexes(count).map((index) => (
              <span
                key={index}
                className={cn(
                  'absolute whitespace-nowrap',
                  index === 0 ? '' : index === last ? '-translate-x-full' : '-translate-x-1/2',
                )}
                style={{ left: `${xPercent(index, count)}%` }}
                dir={dir}
              >
                {points[index]!.axisLabel}
              </span>
            ))}
          </div>
        </div>
      </div>

      {emptyNote ? <p className="mt-4 text-xs text-muted">{emptyNote}</p> : null}

      <div id={`${id}-table`} hidden={!showTable} className="mt-5 max-h-80 overflow-y-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th scope="col" className="py-2 text-start font-medium">
                {labels.period}
              </th>
              <th scope="col" className="py-2 text-end font-medium">
                {labels.sales}
              </th>
              <th scope="col" className="py-2 text-end font-medium">
                {labels.orders}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular-nums">
            {points.map((point) => (
              <tr key={point.label}>
                <th scope="row" className="py-2 text-start font-normal text-text">
                  {point.label}
                </th>
                <td className="ltr-nums py-2 text-end">{point.valueLabel}</td>
                <td className="py-2 text-end">{point.ordersLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
