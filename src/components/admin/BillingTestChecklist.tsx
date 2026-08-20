import { useState } from "react";
import { Check, CircleDashed, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BILLING_ENVIRONMENTS,
  PROVIDER_LABELS,
  type BillingEnvironment,
  type BillingProvider,
} from "@/lib/billing/model";

export type Checklist = {
  provider: BillingProvider;
  environment: BillingEnvironment;
  events: {
    type: string;
    label: string;
    processed: boolean;
    failed: boolean;
    lastAt: string | null;
    error: string | null;
  }[];
  flows: { key: string; label: string; detail: string; done: boolean }[];
  completion: number;
};

function Row({
  ok,
  failed,
  title,
  subtitle,
  meta,
}: {
  ok: boolean;
  failed?: boolean;
  title: string;
  subtitle: string;
  meta?: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/40 px-4 py-3 last:border-0">
      <div className="flex items-start gap-3">
        {ok ? (
          <Check className="mt-0.5 size-4 text-primary" />
        ) : failed ? (
          <XCircle className="mt-0.5 size-4 text-destructive" />
        ) : (
          <CircleDashed className="mt-0.5 size-4 text-muted-foreground" />
        )}
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="font-mono text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </div>
      <div className="text-right text-xs text-muted-foreground">
        {ok ? "Passed" : failed ? "Failed" : "Not seen yet"}
        {meta ? <div>{meta}</div> : null}
      </div>
    </div>
  );
}

export function BillingTestChecklist({ data }: { data: Checklist[] }) {
  const [environment, setEnvironment] = useState<BillingEnvironment>("test");
  const scoped = data.filter((d) => d.environment === environment);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Tracks which signed webhook events and end-to-end flows have actually been processed,
          separately for test and live mode.
        </p>
        <div className="flex gap-2">
          {BILLING_ENVIRONMENTS.map((e) => (
            <Button
              key={e}
              size="sm"
              variant={e === environment ? "default" : "outline"}
              onClick={() => setEnvironment(e)}
            >
              {e === "test" ? "Test mode" : "Live mode"}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {scoped.map((c) => (
          <div key={c.provider} className="surface-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <span className="font-semibold">{PROVIDER_LABELS[c.provider]}</span>
              <Badge variant={c.completion === 100 ? "default" : "secondary"}>
                {c.completion}% verified
              </Badge>
            </div>
            <div className="h-1 w-full bg-muted">
              <div className="h-1 bg-primary" style={{ width: `${c.completion}%` }} />
            </div>
            <div className="px-4 pt-3 text-xs font-semibold uppercase text-muted-foreground">
              Webhook events
            </div>
            {c.events.map((e) => (
              <Row
                key={e.type}
                ok={e.processed}
                failed={e.failed}
                title={e.label}
                subtitle={e.type}
                meta={
                  e.error ?? (e.lastAt ? new Date(e.lastAt).toLocaleDateString() : null)
                }
              />
            ))}
            <div className="px-4 pt-3 text-xs font-semibold uppercase text-muted-foreground">
              End-to-end flows
            </div>
            {c.flows.map((f) => (
              <Row key={f.key} ok={f.done} title={f.label} subtitle={f.detail} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
