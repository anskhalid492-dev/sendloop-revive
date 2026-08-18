import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { LaunchReadiness } from "@/lib/campaign-launch-model";

/**
 * Shows the database-verified launch state: either the real eligible recipient
 * count, or the exact reasons the campaign cannot launch yet.
 */
export function LaunchReadinessBar({
  readiness,
  loading,
  dirty,
  className,
}: {
  readiness: LaunchReadiness | null;
  loading: boolean;
  dirty: boolean;
  className?: string;
}) {
  if (loading && !readiness) {
    return (
      <p className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
        <Loader2 className="size-3.5 animate-spin" /> Checking launch readiness…
      </p>
    );
  }
  if (!readiness) return null;

  if (readiness.ready) {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700",
          className,
        )}
      >
        <CheckCircle2 className="size-3.5" />
        <span className="font-medium">
          Ready to launch — {readiness.audience.toLocaleString()} leads
        </span>
        {readiness.listName ? (
          <span className="text-emerald-700/80">
            from “{readiness.listName}”
            {readiness.alreadyQueued
              ? ` · ${readiness.alreadyQueued.toLocaleString()} already queued`
              : ""}
          </span>
        ) : (
          <span className="text-emerald-700/80">
            {readiness.alreadyQueued.toLocaleString()} recipients already attached
          </span>
        )}
        {dirty ? <span className="text-muted-foreground">· unsaved edits are saved on launch</span> : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-800",
        className,
      )}
    >
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="size-3.5" /> Not ready to launch
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-6">
        {readiness.issues.map((issue) => (
          <li key={issue.code}>{issue.message}</li>
        ))}
      </ul>
      {readiness.unassignedLeads > 0 &&
      readiness.issues.some((i) => i.code === "no_list" || i.code === "list_empty") ? (
        <p className="mt-1 pl-6 text-amber-800/80">
          {readiness.unassignedLeads.toLocaleString()} leads in “All leads” are not assigned to any
          list yet — assign them to a list on the Leads page, then select it here.
        </p>
      ) : null}
    </div>
  );
}
