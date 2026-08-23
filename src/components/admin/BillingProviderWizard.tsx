import { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronRight, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  BILLING_ENVIRONMENTS,
  BILLING_PROVIDERS,
  PROVIDER_ID_RULES,
  PROVIDER_LABELS,
  PROVIDER_REQUIREMENTS,
  secretName,
  type BillingEnvironment,
  type BillingProvider,
} from "@/lib/billing/model";

type PlanCell = { value: string | null; ok: boolean; problem: string | null };

type PlanCheck = {
  planId: string;
  planName: string;
  billingType?: "recurring" | "lifetime";
  monthly: PlanCell;
  yearly: PlanCell;
  lifetime?: PlanCell;
};

export type Readiness = {
  provider: BillingProvider;
  environment: BillingEnvironment;
  enabled: boolean;
  credentials: { ok: boolean; missing: string[] };
  webhook: { path: string; lastReceivedAt: string | null; verifiedEver: boolean };
  plans: PlanCheck[];
  planIdsOk: boolean;
  ready: boolean;
  blockers: string[];
};

function StepHeader({
  index,
  title,
  done,
  description,
}: {
  index: number;
  title: string;
  done: boolean;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {done ? <Check className="size-4" /> : index}
      </div>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function copy(value: string) {
  void navigator.clipboard?.writeText(value);
  toast.success("Copied");
}

export function BillingProviderWizard({
  readiness,
  appOrigin,
  savingPrice,
  togglingProvider,
  onSavePrice,
  onToggleProvider,
}: {
  readiness: Readiness[];
  appOrigin: string;
  savingPrice: boolean;
  togglingProvider: boolean;
  onSavePrice: (v: {
    planId: string;
    provider: BillingProvider;
    environment: BillingEnvironment;
    interval: "monthly" | "yearly" | "lifetime";
    externalPriceId: string;
  }) => void;
  onToggleProvider: (v: {
    provider: BillingProvider;
    environment: BillingEnvironment;
    enabled: boolean;
  }) => void;
}) {
  const [provider, setProvider] = useState<BillingProvider>("stripe");
  const [environment, setEnvironment] = useState<BillingEnvironment>("test");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const state = useMemo(
    () => readiness.find((r) => r.provider === provider && r.environment === environment),
    [readiness, provider, environment],
  );
  const rule = PROVIDER_ID_RULES[provider];
  const requirements = PROVIDER_REQUIREMENTS[provider];
  const webhookUrl = `${appOrigin}${requirements.webhookPath}`;

  if (!state) return null;

  const step1 = state.credentials.ok;
  const step2 = state.webhook.verifiedEver;
  const step3 = state.planIdsOk;
  const step4 = state.enabled && state.ready;

  return (
    <div className="space-y-4">
      <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap gap-2">
          {BILLING_PROVIDERS.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={p === provider ? "default" : "outline"}
              onClick={() => setProvider(p)}
            >
              {PROVIDER_LABELS[p]}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
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

      <div className="surface-card space-y-4 p-5">
        <StepHeader
          index={1}
          done={step1}
          title="Add credentials for this environment"
          description={`Test and live keys are stored separately — ${environment} mode only reads the ${environment.toUpperCase()} suffixed secrets.`}
        />
        <ul className="ml-10 space-y-2 text-sm">
          {requirements.secrets.map((s) => {
            const name = secretName(s.name, environment);
            const missing = state.credentials.missing.includes(name);
            return (
              <li key={name} className="flex items-center gap-2">
                {missing ? (
                  <AlertTriangle className="size-4 text-destructive" />
                ) : (
                  <Check className="size-4 text-primary" />
                )}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{name}</code>
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="surface-card space-y-3 p-5">
        <StepHeader
          index={2}
          done={step2}
          title="Point the provider webhook at MunchReach"
          description="A verified signed event must arrive before this step completes."
        />
        <div className="ml-10 space-y-2">
          <div className="flex items-center gap-2">
            <Input readOnly value={webhookUrl} className="font-mono text-xs" />
            <Button size="sm" variant="outline" onClick={() => copy(webhookUrl)}>
              <Copy className="size-3.5" />
            </Button>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {requirements.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Last event:{" "}
            {state.webhook.lastReceivedAt
              ? new Date(state.webhook.lastReceivedAt).toLocaleString()
              : "none yet"}
          </p>
        </div>
      </div>

      <div className="surface-card space-y-3 p-5">
        <StepHeader
          index={3}
          done={step3}
          title={`Map every paid plan to its ${environment} ${rule.label}`}
          description={rule.hint}
        />
        <div className="ml-10 space-y-3">
          {state.plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">No paid plans configured yet.</p>
          ) : null}
          {state.plans.map((plan) => {
            const isLifetime = plan.billingType === "lifetime";
            // Lifetime plans map exactly one non-recurring price; recurring
            // plans keep their existing monthly + yearly fields untouched.
            const intervals = isLifetime
              ? (["lifetime"] as const)
              : (["monthly", "yearly"] as const);
            const complete = isLifetime
              ? Boolean(plan.lifetime?.ok)
              : plan.monthly.ok && plan.yearly.ok;
            return (
            <div key={plan.planId} className="rounded-lg border border-border/60 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{plan.planName}</span>
                <div className="flex items-center gap-2">
                  {isLifetime ? <Badge variant="outline">Lifetime / one-time</Badge> : null}
                  {complete ? (
                    <Badge variant="secondary">Complete</Badge>
                  ) : (
                    <Badge variant="destructive">Missing</Badge>
                  )}
                </div>
              </div>
              <div className={`grid gap-3 ${isLifetime ? "" : "sm:grid-cols-2"}`}>
                {intervals.map((interval) => {
                  const cell = (interval === "lifetime" ? plan.lifetime : plan[interval]) as PlanCell;
                  const key = `${provider}:${environment}:${plan.planId}:${interval}`;
                  const value = drafts[key] ?? cell.value ?? "";
                  return (
                    <div key={interval} className="space-y-1">
                      <label className="text-xs uppercase text-muted-foreground">
                        {interval === "lifetime" ? `${environment} one-time` : interval}{" "}
                        {rule.label}
                      </label>
                      <div className="flex gap-2">
                        <Input
                          value={value}
                          placeholder={rule.hint}
                          className="font-mono text-xs"
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [key]: e.target.value }))
                          }
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={savingPrice || !value.trim() || value === cell.value}
                          onClick={() =>
                            onSavePrice({
                              planId: plan.planId,
                              provider,
                              environment,
                              interval,
                              externalPriceId: value.trim(),
                            })
                          }
                        >
                          Save
                        </Button>
                      </div>
                      {cell.problem ? (
                        <p className="text-xs text-destructive">{cell.problem}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })}
        </div>
      </div>

      <div className="surface-card space-y-3 p-5">
        <StepHeader
          index={4}
          done={step4}
          title={`Enable ${PROVIDER_LABELS[provider]} in ${environment} mode`}
          description="Customers only see this provider at checkout once every step above passes for the active environment."
        />
        <div className="ml-10 space-y-3">
          {state.blockers.length ? (
            <ul className="list-disc space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 pl-6 text-xs text-destructive">
              {state.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-primary">
              <Check className="size-4" /> All checks passed.
            </p>
          )}
          <div className="flex items-center gap-3">
            <Switch
              checked={state.enabled}
              disabled={togglingProvider || (!state.ready && !state.enabled)}
              onCheckedChange={(enabled) => onToggleProvider({ provider, environment, enabled })}
            />
            <span className="text-sm">
              {state.enabled ? "Enabled" : "Disabled"}
              {togglingProvider ? <Loader2 className="ml-2 inline size-3.5 animate-spin" /> : null}
            </span>
            {!state.ready ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ChevronRight className="size-3.5" /> Resolve the blockers to enable
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
