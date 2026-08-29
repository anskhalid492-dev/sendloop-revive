import { Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { SUPPORT_RATING_LABEL, SUPPORT_RATING_VALUES, type SupportRatingValue } from "@/lib/support-rating";

/** Read-only star display for a submitted support-experience rating. */
export function SupportStars({
  value,
  size = "sm",
  showLabel = false,
  className,
}: {
  value: number;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}) {
  const dimension = size === "md" ? "h-5 w-5" : "h-4 w-4";
  const label = SUPPORT_RATING_LABEL[value as SupportRatingValue];
  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-label={`${value} out of 5 stars`}>
      {SUPPORT_RATING_VALUES.map((star) => (
        <Star
          key={star}
          className={cn(
            dimension,
            star <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
          )}
        />
      ))}
      {showLabel && label ? (
        <span className="ml-1 text-xs text-muted-foreground">{label}</span>
      ) : null}
    </span>
  );
}
