/**
 * Admin → Billing → Providers: enter the API key, webhook signing secret and
 * (Lemon Squeezy) store ID for one provider in one environment. Values are
 * encrypted server-side; the dialog only ever shows a masked preview.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, KeyRound, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PROVIDER_LABELS, PROVIDER_REQUIREMENTS, secretName } from "@/lib/billing/model";
import type { BillingEnvironment, BillingProvider } from "@/lib/billing/model";
import {
  clearBillingProviderSecrets,
  saveBillingProviderSecrets,
} from "@/lib/billing-admin.functions";

type CredentialField = "apiKey" | "webhookSecret" | "storeId";

export type CredentialFieldStatus = {
  field: CredentialField;
  envName: string;
  present: boolean;
  source: "dashboard" | "environment" | "none";
  last4: string | null;
};

export type ProviderSecretStatus = {
  provider: BillingProvider;
  environment: BillingEnvironment;
  updatedAt: string | null;
  fields: CredentialFieldStatus[];
};

const FIELD_ORDER: Record<BillingProvider, CredentialField[]> = {
  stripe: ["apiKey", "webhookSecret"],
  paddle: ["apiKey", "webhookSecret"],
  lemonsqueezy: ["apiKey", "webhookSecret", "storeId"],
};

const PLACEHOLDERS: Record<BillingProvider, Partial<Record<CredentialField, string>>> = {
  stripe: { apiKey: "sk_test_… / sk_live_…", webhookSecret: "whsec_…" },
  paddle: { apiKey: "pdl_…", webhookSecret: "pdl_ntfset_…" },
  lemonsqueezy: { apiKey: "eyJ0…", webhookSecret: "signing secret", storeId: "123456" },
};

function fieldLabel(provider: BillingProvider, field: CredentialField) {
  const index = FIELD_ORDER[provider].indexOf(field);
  return PROVIDER_REQUIREMENTS[provider].secrets[index]?.label ?? field;
}

function fieldBaseName(provider: BillingProvider, field: CredentialField) {
  const index = FIELD_ORDER[provider].indexOf(field);
  return PROVIDER_REQUIREMENTS[provider].secrets[index]?.name ?? "";
}

export function BillingCredentialsDialog({
  provider,
  environment,
  status,
}: {
  provider: BillingProvider;
  environment: BillingEnvironment;
  status: ProviderSecretStatus | undefined;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveBillingProviderSecrets);
  const clear = useServerFn(clearBillingProviderSecrets);
  const [open, setOpen] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [values, setValues] = useState<Partial<Record<CredentialField, string>>>({});

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-billing-provider-health"] });
    queryClient.invalidateQueries({ queryKey: ["admin-billing-provider-secrets"] });
    queryClient.invalidateQueries({ queryKey: ["admin-billing"] });
    queryClient.invalidateQueries({ queryKey: ["admin-billing-readiness"] });
  };

  const saveMutation = useMutation({
    mutationFn: () => save({ data: { provider, environment, values } }),
    onSuccess: () => {
      toast.success(`${PROVIDER_LABELS[provider]} ${environment} credentials saved`);
      setValues({});
      setOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearMutation = useMutation({
    mutationFn: () => clear({ data: { provider, environment } }),
    onSuccess: () => {
      toast.success("Stored credentials removed");
      setValues({});
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fields = FIELD_ORDER[provider];
  const statusFor = (field: CredentialField) => status?.fields.find((f) => f.field === field);
  const hasDashboardValues = status?.fields.some((f) => f.source === "dashboard") === true;
  const missing = fields.filter((f) => !statusFor(f)?.present);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <KeyRound className="mr-2 h-4 w-4" />
          {missing.length === 0 ? "Manage keys" : `Add keys (${missing.length} missing)`}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {PROVIDER_LABELS[provider]} · {environment === "live" ? "Live" : "Sandbox / test"} credentials
          </DialogTitle>
          <DialogDescription>
            Stored encrypted and only used server-side. Leave a field blank to keep the current value.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {fields.map((field) => {
            const s = statusFor(field);
            return (
              <div key={field} className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor={`${provider}-${environment}-${field}`} className="text-sm">
                    {fieldLabel(provider, field)}
                  </Label>
                  {s?.present ? (
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      ••••{s.last4} · {s.source === "dashboard" ? "saved here" : "from environment"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      Not set
                    </Badge>
                  )}
                </div>
                <Input
                  id={`${provider}-${environment}-${field}`}
                  type={reveal || field === "storeId" ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={PLACEHOLDERS[provider][field] ?? ""}
                  value={values[field] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
                />
                <p className="text-[11px] text-muted-foreground">
                  Environment variable equivalent:{" "}
                  <code className="font-mono">{s?.envName ?? secretName(fieldBaseName(provider, field), environment)}</code>
                </p>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {reveal ? "Hide typed values" : "Show typed values"}
          </button>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            disabled={!hasDashboardValues || clearMutation.isPending}
            onClick={() => clearMutation.mutate()}
            className="text-destructive hover:text-destructive"
          >
            {clearMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Remove stored keys
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || Object.values(values).every((v) => !v?.trim())}
          >
            {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save credentials
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
