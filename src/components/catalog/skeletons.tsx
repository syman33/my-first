/** Placeholder shapes shown while catalogue pages stream in (no layout shift). */
function Block({ className }: { className: string }) {
  return <div className={`animate-pulse bg-sand ${className}`} />
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul
      className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:gap-x-6 xl:grid-cols-4"
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <Block className="aspect-[4/5] w-full" />
          <Block className="mt-4 h-3 w-1/3" />
          <Block className="mt-2 h-4 w-3/4" />
          <Block className="mt-2 h-4 w-1/4" />
        </li>
      ))}
    </ul>
  )
}

export function ListingSkeleton({ label }: { label: string }) {
  return (
    <div className="container-luxe py-8 lg:py-12" role="status" aria-label={label}>
      <Block className="h-3 w-40" />
      <Block className="mt-6 h-10 w-64" />
      <Block className="mt-8 h-12 w-full" />
      <div className="mt-6 grid gap-10 lg:grid-cols-[15rem_1fr] lg:gap-12">
        <div className="hidden space-y-4 lg:block">
          {Array.from({ length: 6 }, (_, i) => (
            <Block key={i} className="h-5 w-full" />
          ))}
        </div>
        <ProductGridSkeleton />
      </div>
    </div>
  )
}

export function ProductSkeleton({ label }: { label: string }) {
  return (
    <div className="container-luxe py-8 lg:py-12" role="status" aria-label={label}>
      <Block className="h-3 w-56" />
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16">
        <Block className="aspect-[4/5] w-full" />
        <div className="space-y-4">
          <Block className="h-3 w-24" />
          <Block className="h-12 w-3/4" />
          <Block className="h-6 w-32" />
          <Block className="mt-8 h-9 w-48" />
          <Block className="h-12 w-full" />
        </div>
      </div>
    </div>
  )
}
