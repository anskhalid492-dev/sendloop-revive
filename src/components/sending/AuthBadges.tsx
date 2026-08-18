import { Check, Minus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AuthCheck } from "@/lib/sending-model";

const STYLE: Record<AuthCheck, string> = {
  pass: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  fail: "border-destructive/30 bg-destructive/10 text-destructive",
  unknown: "border-border bg-muted text-muted-foreground",
};

export function AuthBadge({ label, value }: { label: string; value: AuthCheck }) {
  const Icon = value === "pass" ? Check : value === "fail" ? X : Minus;
  return (
    <span
      title={`${label}: ${value}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none",
        STYLE[value],
      )}
    >
      {label}
      <Icon className="size-3" />
    </span>
  );
}

export function AuthBadgeRow({
  spf,
  dkim,
  dmarc,
  mx,
}: {
  spf: AuthCheck;
  dkim: AuthCheck;
  dmarc: AuthCheck;
  mx: AuthCheck;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <AuthBadge label="SPF" value={spf} />
      <AuthBadge label="DKIM" value={dkim} />
      <AuthBadge label="DMARC" value={dmarc} />
      <AuthBadge label="MX" value={mx} />
    </div>
  );
}
