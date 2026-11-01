import * as React from "react"

import { cn } from "@/lib/utils"

export interface EmptyStateProps {
  /** A lucide icon element, e.g. <Ticket />. Decorative. */
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  /** Usually a <Button size="pill"> or a link styled as one. */
  action?: React.ReactNode
  /** Heading level for the title so it fits the page outline (default h2). */
  as?: "h2" | "h3"
  className?: string
}

/** Empty / no-results / error-ish states (redesign.md: friendly, coral accent, one clear next step). */
function EmptyState({ icon, title, description, action, as: Heading = "h2", className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <div
          aria-hidden="true"
          className="mb-2 grid size-16 place-items-center rounded-2xl bg-coral-bg text-primary [&_svg]:size-7"
        >
          {icon}
        </div>
      )}
      <Heading className="font-display text-card-title text-foreground">{title}</Heading>
      {description && <p className="text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export { EmptyState }
