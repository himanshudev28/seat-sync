import { cn } from "@/lib/utils"

/** Loading placeholder (redesign.md §9: bg-elevated pulse). Hidden from assistive tech; put aria-busy on the
 *  container instead. The pulse stops under reduced motion (global rule in index.css). */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-surface-elevated", className)}
      {...props}
    />
  )
}

/** Skeletons that match the real card shapes exactly, so the layout doesn't jump when data arrives. */
function SkeletonCard({
  variant = "event",
  className,
}: {
  variant?: "event" | "ticket" | "row"
  className?: string
}) {
  if (variant === "row")
    return (
      <div aria-hidden="true" className={cn("flex items-center gap-4 rounded-2xl bg-card p-4 shadow-sm", className)}>
        <Skeleton className="size-12 shrink-0 rounded-xl" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-9 w-20 rounded-full" />
      </div>
    )
  if (variant === "ticket")
    return (
      <div aria-hidden="true" className={cn("flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-sm sm:flex-row", className)}>
        <Skeleton className="aspect-square w-28 shrink-0 rounded-xl" />
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-auto h-6 w-24" />
        </div>
      </div>
    )
  return (
    <div aria-hidden="true" className={cn("overflow-hidden rounded-2xl bg-card shadow-sm", className)}>
      <Skeleton className="aspect-[16/10] w-full rounded-none" />
      <div className="flex flex-col gap-3 p-5">
        <Skeleton className="h-3 w-20 rounded-full" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="mt-2 flex items-center justify-between">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-10 w-28 rounded-full" />
        </div>
      </div>
    </div>
  )
}

export { Skeleton, SkeletonCard }
