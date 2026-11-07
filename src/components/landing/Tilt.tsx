import { useTilt } from "@/hooks/useTilt";
import { cn } from "@/lib/utils";

/**
 * Wraps anything in a cursor-following 3D tilt with a soft glare. On touch
 * screens, or with reduced motion, it is a plain wrapper.
 */
export function Tilt({
  children,
  className,
  max = 6,
  glare = true,
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
  glare?: boolean;
}) {
  const ref = useTilt<HTMLDivElement>(max);
  return (
    <div ref={ref} className={cn("lp-tilt relative", className)}>
      {children}
      {glare && <span aria-hidden="true" className="lp-glare" />}
    </div>
  );
}
