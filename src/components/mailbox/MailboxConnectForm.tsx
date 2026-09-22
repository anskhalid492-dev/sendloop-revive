/**
 * Mailbox connection form, shared by "Single Mailbox" and "Advanced Setup".
 *
 * Both modes drive the SAME existing services: `testMailboxConnection` for the
 * live SMTP/IMAP checks, `saveMailboxConnection` for storage (passwords go
 * straight into the encrypted secret store and are never returned), and
 * `setMailboxWarmup` for warm-up, exactly as the mailbox list and the CSV
 * import do. Simple mode hides the server fields and takes them from the
 * provider registry; advanced mode exposes every field for editing.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ExternalLink, Info, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { ProviderLogo } from "@/components/mailbox/ProviderLogo";
import { ProviderPicker } from "@/components/mailbox/ProviderPicker";
import { MailboxAuthPanel } from "@/components/sending/MailboxAuthPanel";
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
import { Switch } from "@/components/ui/switch";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  saveMailboxConnection,
  testMailboxConnection,
  type MailboxConnectionTest,
} from "@/lib/customer-mailboxes.functions";
import {
  friendlyMailboxError,
  mailboxSuccessMessage,
  type ConnectProtocol,
} from "@/lib/mailbox-connect-errors";
import type { MailboxAuthResult } from "@/lib/mailbox-auth-check";
import { checkMailboxAuthentication } from "@/lib/mailbox-auth.functions";
import type { MailSecurity } from "@/lib/mailbox-presets";
import { getMailboxProvider, type MailboxProviderId } from "@/lib/mailbox-providers";
import { setMailboxWarmup } from "@/lib/workspace-mailboxes.functions";

const SECURITY_OPTIONS: Array<{ value: MailSecurity; label: string }> = [
  { value: "ssl", label: "SSL / TLS" },
  { value: "tls", label: "STARTTLS" },
  { value: "none", label: "None" },
];

type Endpoint = {
  host: string;
  port: string;
  security: MailSecurity;
  username: string;
  password: string;
};

const emptyEndpoint = (port: string): Endpoint => ({
  host: "",
  port,
  security: "ssl",
  username: "",
  password: "",
});

export function MailboxConnectForm({ mode }: { mode: "simple" | "advanced" }) {
  const advanced = mode === "advanced";
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const runTest = useServerFn(testMailboxConnection);
  const runSave = useServerFn(saveMailboxConnection);
  const runWarmup = useServerFn(setMailboxWarmup);
  const runAuthCheck = useServerFn(checkMailboxAuthentication);

  const [providerId, setProviderId] = useState<MailboxProviderId | null>(null);
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [fromName, setFromName] = useState("");
  const [dailyLimit, setDailyLimit] = useState("50");
  const [warmup, setWarmup] = useState(false);
  const [smtp, setSmtp] = useState<Endpoint>(emptyEndpoint("465"));
  const [imap, setImap] = useState<Endpoint>(emptyEndpoint("993"));
  /** Fields the customer edited by hand are never overwritten by a preset. */
  const [edited, setEdited] = useState<Set<string>>(new Set());

  const [result, setResult] = useState<MailboxConnectionTest | null>(null);
  const [auth, setAuth] = useState<MailboxAuthResult | null>(null);
  const [mailboxId, setMailboxId] = useState<string | null>(null);

  const provider = providerId ? getMailboxProvider(providerId) : null;
  const markEdited = (key: string) => setEdited((current) => new Set(current).add(key));

  /** Applies the registry defaults, leaving anything hand-edited alone. */
  const selectProvider = (id: MailboxProviderId) => {
    setProviderId(id);
    setResult(null);
    const next = getMailboxProvider(id);
    setSmtp((current) => ({
      ...current,
      host: edited.has("smtpHost") ? current.host : next.smtpHost,
      port: edited.has("smtpPort") ? current.port : String(next.smtpPort),
      security: edited.has("smtpSecurity") ? current.security : next.smtpSecurity,
    }));
    setImap((current) => ({
      ...current,
      host: edited.has("imapHost") ? current.host : next.imapHost,
      port: edited.has("imapPort") ? current.port : String(next.imapPort),
      security: edited.has("imapSecurity") ? current.security : next.imapSecurity,
    }));
  };

  const address = emailAddress.trim().toLowerCase();
  const smtpUsername = (edited.has("smtpUsername") ? smtp.username : address).trim();
  const imapUsername = (edited.has("imapUsername") ? imap.username : address).trim();
  const smtpPassword = edited.has("smtpPassword") ? smtp.password : password;
  const imapPassword = edited.has("imapPassword") ? imap.password : password;

  const payload = useMemo(
    () => ({
      workspaceId: workspace?.id ?? "",
      emailAddress: address,
      smtp: {
        host: smtp.host.trim(),
        port: Number(smtp.port),
        security: smtp.security,
        username: smtpUsername,
        password: smtpPassword,
      },
      imap: {
        host: imap.host.trim(),
        port: Number(imap.port),
        security: imap.security,
        username: imapUsername,
        password: imapPassword,
      },
    }),
    [workspace?.id, address, smtp, imap, smtpUsername, imapUsername, smtpPassword, imapPassword],
  );

  const limitNumber = Number(dailyLimit);
  const limitValid = Number.isInteger(limitNumber) && limitNumber >= 1 && limitNumber <= 2000;

  const complete =
    Boolean(workspace?.id) &&
    Boolean(providerId) &&
    address.includes("@") &&
    limitValid &&
    [payload.smtp, payload.imap].every(
      (end) =>
        end.host !== "" &&
        end.username !== "" &&
        end.password !== "" &&
        Number.isInteger(end.port) &&
        end.port > 0,
    );

  /** Test results are re-worded for the customer; raw server text stays server-side. */
  const readable = (protocol: ConnectProtocol, entry: { ok: boolean; message: string }) =>
    entry.ok
      ? mailboxSuccessMessage(protocol)
      : friendlyMailboxError(protocol, entry.message, {
          appPasswordProvider: provider?.supportsAppPassword ? provider.displayName : null,
        });

  const test = useMutation({
    mutationFn: () => runTest({ data: payload }),
    onSuccess: (data) => {
      setResult(data);
      if (data.ok) toast.success("Both connections succeeded — you can connect this mailbox now.");
      else toast.error("One or both connections failed. See the details below.");
    },
    onError: () =>
      toast.error("We could not run the connection test just now. Please try again in a moment."),
  });

  const save = useMutation({
    mutationFn: async () => {
      const saved = await runSave({
        data: {
          ...payload,
          ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
          ...(fromName.trim() ? { fromName: fromName.trim() } : {}),
          dailySendLimit: limitNumber,
          warmupEnabled: warmup,
        },
      });
      // Warm-up goes through the same service the mailbox list uses, so the
      // existing warm-up system owns it from here.
      if (warmup && saved.status === "connected" && saved.mailboxId) {
        try {
          await runWarmup({ data: { ids: [saved.mailboxId], enabled: true } });
        } catch {
          toast.info("Mailbox connected. Warm-up could not be switched on — try it from Mailboxes.");
        }
      }
      return saved;
    },
    onSuccess: (data) => {
      setResult(data);
      setAuth(data.auth);
      setMailboxId(data.mailboxId);
      if (data.status === "connected") {
        toast.success("Mailbox connected.");
        void navigate({ to: "/mailboxes", search: { mailbox: undefined } });
      } else {
        toast.error("Not connected yet — the sign-in checks did not both pass.");
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const recheck = useMutation({
    mutationFn: () =>
      runAuthCheck({
        data: {
          workspaceId: workspace?.id ?? "",
          emailAddress: address,
          ...(mailboxId ? { mailboxId } : {}),
        },
      }),
    onSuccess: (data) => setAuth(data),
    onError: () => toast.error("We could not re-check this domain just now."),
  });

  const busy = test.isPending || save.isPending;
  /** Custom Domain needs its servers typed in even in the simple flow. */
  const showServers = advanced || provider?.manual === true;

  const endpointFields = (
    which: "smtp" | "imap",
    state: Endpoint,
    setState: (next: (current: Endpoint) => Endpoint) => void,
  ) => {
    const label = which === "smtp" ? "SMTP" : "IMAP";
    const alternates = which === "smtp" ? provider?.alternateSmtp : provider?.alternateImap;
    return (
      <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
        <h3 className="text-sm font-semibold">
          {which === "smtp" ? "Outgoing server — SMTP" : "Incoming server — IMAP"}
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${which}-host`}>{label} host</Label>
            <Input
              id={`${which}-host`}
              value={state.host}
              placeholder={which === "smtp" ? "smtp.yourhost.com" : "imap.yourhost.com"}
              onChange={(event) => {
                markEdited(`${which}Host`);
                setState((current) => ({ ...current, host: event.target.value }));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${which}-port`}>{label} port</Label>
            <Input
              id={`${which}-port`}
              type="number"
              min={1}
              max={65535}
              value={state.port}
              onChange={(event) => {
                markEdited(`${which}Port`);
                setState((current) => ({ ...current, port: event.target.value }));
              }}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Security</Label>
            <Select
              value={state.security}
              onValueChange={(value) => {
                markEdited(`${which}Security`);
                setState((current) => ({ ...current, security: value as MailSecurity }));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECURITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${which}-username`}>Username</Label>
            <Input
              id={`${which}-username`}
              autoComplete="off"
              value={edited.has(`${which}Username`) ? state.username : address}
              placeholder="you@yourdomain.com"
              onChange={(event) => {
                markEdited(`${which}Username`);
                setState((current) => ({ ...current, username: event.target.value }));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${which}-password`}>Password</Label>
            <Input
              id={`${which}-password`}
              type="password"
              autoComplete="new-password"
              value={edited.has(`${which}Password`) ? state.password : password}
              onChange={(event) => {
                markEdited(`${which}Password`);
                setState((current) => ({ ...current, password: event.target.value }));
              }}
            />
          </div>
        </div>
        {alternates && alternates.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Also supported:</span>
            {alternates.map((option) => (
              <button
                key={`${option.port}-${option.security}`}
                type="button"
                className="rounded-md border border-border bg-background px-2 py-1 font-medium text-foreground transition-colors hover:border-primary/60"
                onClick={() => {
                  markEdited(`${which}Port`);
                  markEdited(`${which}Security`);
                  setState((current) => ({
                    ...current,
                    port: String(option.port),
                    security: option.security,
                  }));
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* ---------- Account information ---------- */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Account information</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mailbox-email">Email address</Label>
            <Input
              id="mailbox-email"
              type="email"
              autoComplete="off"
              value={emailAddress}
              onChange={(event) => setEmailAddress(event.target.value)}
              placeholder="you@yourdomain.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mailbox-password">Password</Label>
            <Input
              id="mailbox-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mailbox password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mailbox-display-name">Display name (optional)</Label>
            <Input
              id="mailbox-display-name"
              autoComplete="off"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Sales — Michael"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mailbox-from-name">From name (optional)</Label>
            <Input
              id="mailbox-from-name"
              autoComplete="off"
              value={fromName}
              onChange={(event) => setFromName(event.target.value)}
              placeholder="Michael Scott"
            />
            <p className="text-xs text-muted-foreground">
              The name recipients see next to your address. Defaults to your display name.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Provider ---------- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Email provider</h2>
          <p className="text-xs text-muted-foreground">
            Pick the service that hosts this mailbox, not where the domain was bought.
          </p>
        </div>
        <ProviderPicker value={providerId} onChange={selectProvider} disabled={busy} />
        {provider ? (
          <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background">
              <ProviderLogo provider={provider.id} name={provider.displayName} className="size-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {provider.displayName}
                {provider.manual ? null : (
                  <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                    Recommended settings
                  </span>
                )}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">{provider.notes}</p>
              {provider.documentationUrl ? (
                <a
                  href={provider.documentationUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-4"
                >
                  {provider.displayName} setup guide
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      {/* ---------- Mail server settings ---------- */}
      {showServers ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Mail server settings</h2>
          {!advanced ? (
            <p className="text-xs text-muted-foreground">
              Enter the server details from your email host.
            </p>
          ) : null}
          {endpointFields("imap", imap, setImap)}
          {endpointFields("smtp", smtp, setSmtp)}
        </section>
      ) : provider ? (
        <p className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/20 p-3.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            We will use {provider.displayName}&apos;s recommended servers ({provider.imapHost} for
            incoming, {provider.smtpHost} for outgoing). Need different settings? Use Advanced
            Setup.
          </span>
        </p>
      ) : null}

      {/* ---------- Sending controls ---------- */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="daily-limit">Daily sending limit</Label>
          <Input
            id="daily-limit"
            type="number"
            min={1}
            max={2000}
            value={dailyLimit}
            onChange={(event) => setDailyLimit(event.target.value)}
            className="sm:max-w-[160px]"
          />
          <p className="text-xs text-muted-foreground">
            {limitValid
              ? "Actual sending also stays inside your plan and your provider's own limits, whichever is lowest."
              : "Enter a whole number between 1 and 2000."}
          </p>
        </div>
        <div className="flex items-start justify-between gap-4 rounded-xl border border-border/70 bg-muted/20 p-4">
          <div className="space-y-1">
            <Label htmlFor="warmup-toggle" className="text-sm font-medium">
              Warm-up
            </Label>
            <p className="text-xs text-muted-foreground">
              Gradually builds this mailbox&apos;s sending reputation. Warm-up mail is kept
              completely separate from your campaigns.
            </p>
          </div>
          <Switch id="warmup-toggle" checked={warmup} onCheckedChange={setWarmup} />
        </div>
      </section>

      {/* ---------- Results ---------- */}
      {result ? (
        <div className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-4">
          <ResultRow ok={result.imap.ok} message={readable("imap", result.imap)} />
          <ResultRow ok={result.smtp.ok} message={readable("smtp", result.smtp)} />
        </div>
      ) : null}

      {auth ? (
        <MailboxAuthPanel
          result={auth}
          rechecking={recheck.isPending}
          onRecheck={() => recheck.mutate()}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!complete || busy}
          onClick={() => test.mutate()}
        >
          {test.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Test Connection
        </Button>
        <Button type="button" disabled={!complete || busy} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Connect Mailbox
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Connecting re-runs both sign-in checks. The mailbox is only marked connected when incoming
        and outgoing both succeed. Passwords are stored encrypted and are never shown again.
      </p>
    </div>
  );
}

function ResultRow({ ok, message }: { ok: boolean; message: string }) {
  return (
    <p className="flex items-start gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      )}
      <span>{message}</span>
    </p>
  );
}
