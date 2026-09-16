import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

type BackLinkProps = {
  /** Where the arrow returns to — always an explicit page, never blind history. */
  to: string;
  label?: string;
};

/**
 * Small "Back" affordance shown at the top of each step of a multi-page flow so
 * the customer can always return to the previous screen.
 */
export function BackLink({ to, label = "Back" }: BackLinkProps) {
  return (
    <Link
      to={to}
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {label}
    </Link>
  );
}
