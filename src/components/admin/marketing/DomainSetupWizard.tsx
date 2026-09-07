/**
 * Step-by-step wizard for connecting a marketing sending domain to a provider.
 *
 * Presentation only: connection details are posted straight to the server fn
 * that encrypts them, DNS records come back from the provider itself and the
 * ready state is whatever the provider reports — nothing is decided here.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MarketingPanel } from "@/components/admin/marketing/MarketingUI";
import { MARKETING_PROVIDER_TYPES } from "@/lib/marketing/provider-types";
import type { MarketingProvider, ProviderType } from "@/lib/marketing/types";
import {
  saveMarketingDomain,
  saveMarketingProvider,
  testMarketingProviderFn,
  verifyMarketingDomain,
} from "@/lib/marketing.functions";
import { cn } from "@/lib/utils";

export const PROVIDER_FIELD_LABEL: Record<string, string> = {
  api_key: "API key",
  access_key_id: "Access key ID",
  secret_access_key: "Secret access key",
  region: "Region",
  domain: "Provider domain",
  host: "SMTP host",
  port: "Port",
  username: "Username",
  password: "Password",
};

export const PROVIDER_FIELD_PLACEHOLDER: Record<string, string> = {
  api_key: "re_xxxxxxxx",
  access_key_id: "AKIA…",
  secret_access_key: "••••••••",
  region: "us-east-1",
};

const SECRET_FIELDS = new Set(["api_key", "secret_access_key", "password"]);

export const PROVIDER_INSTRUCTIONS: Record<string, string[]> = {
  resend: [
    "In Resend, open API Keys and create a key with full access.",
    "Paste the key here — it is encrypted and never shown again.",
    "We register the domain in Resend and pull back its exact DNS records.",
  ],
  ses: [
    "In AWS IAM, create an access key for a user allowed to manage SES identities.",
    "Enter the key pair and the SES region the domain should live in.",
    "We create the SES identity and pull back its DKIM and SPF records.",
  ],
  sendgrid: ["Create a SendGrid API key with Mail Send and Sender Authentication access."],
  mailgun: ["Create a Mailgun private API key and enter your Mailgun sending domain and region."],
  smtp: ["Enter your SMTP host, port and login. SMTP has no domain API to verify against."],
};

const DOMAIN_API_PROVIDERS = new Set<ProviderType>(["ses", "resend", "sendgrid", "mailgun"]);

type WizardRecord = { type?: string; name?: string; value?: string; priority?: number; purpose?: string };

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-left font-mono text-xs break-all hover:text-foreground"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      <span>{value}</span>
      {copied ? (
        <Check className="h-3 w-3 shrink-0 text-emerald-600" />
      ) : (
        <Copy className="h-3 w-3 shrink-0 opacity-50" />
      )}
    </button>
  );
}

function StepHeader({ index, current, label }: { index: number; current: number; label: string }) {
  const done = current > index;
  const active = current === index;
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold",
          done
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
            : active
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground",
        )}
      >
        {done ? <Check className="h-3 w-3" /> : index}
      </span>
      <span className={cn("text-sm", active ? "font-medium" : "text-muted-foreground")}>
        {label}
      </span>
    </div>
  );
}

export function DomainSetupWizard({ providers }: { providers: MarketingProvider[] }) {
  const qc = useQueryClient();
  const saveProvider = useServerFn(saveMarketingProvider);
  const testProvider = useServerFn(testMarketingProviderFn);
  const saveDomain = useServerFn(saveMarketingDomain);
  const verify = useServerFn(verifyMarketingDomain);

  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<"existing" | "new">(providers.length ? "existing" : "new");
  const [providerId, setProviderId] = useState<string>(providers[0]?.id ?? "");
  const [providerType, setProviderType] = useState<ProviderType>("resend");
  const [providerName, setProviderName] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [domain, setDomain] = useState("");
  const [domainId, setDomainId] = useState<string | null>(null);
  const [records, setRecords] = useState<WizardRecord[]>([]);
  const [status, setStatus] = useState<"pending" | "verified" | "failed" | null>(null);
  const [detail, setDetail] = useState("");

  const chosenProvider = providers.find((p) => p.id === providerId);
  const activeType = mode === "new" ? providerType : (chosenProvider?.providerType ?? "resend");
  const fields = MARKETING_PROVIDER_TYPES.find((p) => p.id === activeType)?.fields ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "marketing"] });

  const connect = useMutation({
    mutationFn: async () => {
      if (mode === "existing") {
        if (!providerId) throw new Error("Choose a provider.");
        if (Object.values(credentials).some((v) => v.trim())) {
          await saveProvider({
            data: {
              id: providerId,
              name: chosenProvider?.name ?? providerId,
              providerType: activeType,
              status: "active",
              credentials,
            },
          });
        }
        return testProvider({ data: { id: providerId } });
      }
      const missing = fields.filter((f) => !credentials[f]?.trim());
      if (missing.length) throw new Error(`Missing ${missing.map((m) => PROVIDER_FIELD_LABEL[m] ?? m).join(", ")}.`);
      const saved = await saveProvider({
        data: {
          name: providerName.trim() || `${activeType} provider`,
          providerType,
          status: "active",
          credentials,
        },
      });
      setProviderId(saved.id);
      setMode("existing");
      return testProvider({ data: { id: saved.id } });
    },
    onSuccess: (result) => {
      invalidate();
      setCredentials({});
      if (result.ok) {
        toast.success("Connection verified");
        setStep(2);
      } else {
        toast.error(result.message);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addDomain = useMutation({
    mutationFn: async () => {
      const saved = await saveDomain({ data: { domain, providerId } });
      setDomainId(saved.id);
      return verify({ data: { id: saved.id } });
    },
    onSuccess: (result) => {
      invalidate();
      setRecords(result.records as WizardRecord[]);
      setStatus(result.status);
      setDetail(result.detail);
      setStep(3);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const recheck = useMutation({
    mutationFn: () => verify({ data: { id: domainId! } }),
    onSuccess: (result) => {
      invalidate();
      setRecords(result.records as WizardRecord[]);
      setStatus(result.status);
      setDetail(result.detail);
      if (result.status === "verified") toast.success("Domain verified by the provider");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <MarketingPanel
      title="Connect a sending domain"
      description="Four steps: connect the provider, add the domain, publish the DNS records the provider returns, then confirm it is ready."
      actions={
        step > 1 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStep(1);
              setStatus(null);
              setRecords([]);
              setDomain("");
              setDomainId(null);
            }}
          >
            Start over
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-4">
          <StepHeader index={1} current={step} label="Provider connection" />
          <StepHeader index={2} current={step} label="Domain" />
          <StepHeader index={3} current={step} label="DNS records" />
        </div>

        {step === 1 ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label>Use</Label>
                <Select
                  value={mode === "new" ? "__new__" : providerId}
                  onValueChange={(value) => {
                    if (value === "__new__") {
                      setMode("new");
                    } else {
                      setMode("existing");
                      setProviderId(value);
                    }
                    setCredentials({});
                  }}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Choose a provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name} · {provider.providerType}
                        {provider.hasCredentials ? "" : " (no details)"}
                      </SelectItem>
                    ))}
                    <SelectItem value="__new__">New provider connection…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {mode === "new" ? (
                <>
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input
                      className="w-52"
                      placeholder="Marketing Resend"
                      value={providerName}
                      onChange={(event) => setProviderName(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Type</Label>
                    <Select
                      value={providerType}
                      onValueChange={(value) => {
                        setProviderType(value as ProviderType);
                        setCredentials({});
                      }}
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MARKETING_PROVIDER_TYPES.map((type) => (
                          <SelectItem key={type.id} value={type.id}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : null}
            </div>

            <ul className="list-decimal space-y-1 rounded-md border bg-muted/30 p-3 pl-7 text-xs text-muted-foreground">
              {(PROVIDER_INSTRUCTIONS[activeType] ?? []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>

            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((field) => (
                <div key={field} className="space-y-1">
                  <Label>{PROVIDER_FIELD_LABEL[field] ?? field}</Label>
                  <Input
                    type={SECRET_FIELDS.has(field) ? "password" : "text"}
                    autoComplete="off"
                    placeholder={
                      PROVIDER_FIELD_PLACEHOLDER[field] ??
                      (mode === "existing" && chosenProvider?.hasCredentials
                        ? "Saved — leave blank to keep"
                        : "")
                    }
                    value={credentials[field] ?? ""}
                    onChange={(event) =>
                      setCredentials((prev) => ({ ...prev, [field]: event.target.value }))
                    }
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
                {connect.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save and test connection
              </Button>
              {!DOMAIN_API_PROVIDERS.has(activeType) ? (
                <p className="text-xs text-muted-foreground">
                  This type has no domain API, so DNS must be verified in the provider dashboard.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>Marketing domain</Label>
              <Input
                className="w-72"
                placeholder="news.munchreach.com"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
              />
            </div>
            <Button
              onClick={() => addDomain.mutate()}
              disabled={!domain.includes(".") || addDomain.isPending}
            >
              {addDomain.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Register with provider
            </Button>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={status === "verified" ? "default" : "outline"}>
                {status === "verified"
                  ? "Ready to send"
                  : status === "failed"
                    ? "Verification failed"
                    : "Waiting for DNS"}
              </Badge>
              <span className="text-xs text-muted-foreground">{detail}</span>
            </div>
            {records.length > 0 ? (
              <div className="overflow-x-auto rounded border bg-muted/30 p-2">
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-1">Type</th>
                      <th className="py-1">Name</th>
                      <th className="py-1">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record, index) => (
                      <tr key={`${record.name}-${index}`} className="align-top">
                        <td className="py-1 pr-2">{record.type ?? "—"}</td>
                        <td className="py-1 pr-2 font-mono">
                          <CopyValue value={record.name ?? ""} />
                        </td>
                        <td className="py-1">
                          <CopyValue value={record.value ?? ""} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                The provider returned no DNS records yet. Re-check in a moment.
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => recheck.mutate()}
              disabled={!domainId || recheck.isPending}
            >
              {recheck.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Check DNS with provider
            </Button>
          </div>
        ) : null}
      </div>
    </MarketingPanel>
  );
}
