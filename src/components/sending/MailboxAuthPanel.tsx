/**
 * Pass / fail status of a mailbox domain's email authentication, with the exact
 * place the customer goes to fix anything missing.
 */
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AUTH_STATE_LABELS,
  type AuthCheckState,
  type MailboxAuthResult,
} from "@/lib/mailbox-auth-check";
import { mailboxAuthGuide } from "@/lib/mailbox-auth-guides";
import { providerSendingLimit } from "@/lib/mailbox-provider-limits";

const ICONS: Record<AuthCheckState, typeof CheckCircle2> = {
  pass: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
  unchecked: HelpCircle,
};

const TONE: Record<AuthCheckState, string> = {
  pass: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  fail: "text-destructive",
  unchecked: "text-muted-foreground",
};

function Row({
  label,
  state,
  summary,
}: {
  label: string;
  state: AuthCheckState;
  summary: string;
}) {
  const Icon = ICONS[state];
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", TONE[state])} />
      <p>
        <span className="font-medium">{label}</span>{" "}
        <span className={cn("text-xs", TONE[state])}>({AUTH_STATE_LABELS[state]})</span>
        <br />
        <span className="text-muted-foreground">{summary}</span>
      </p>
    </div>
  );
}

export function MailboxAuthPanel({
  result,
  onRecheck,
  rechecking,
}: {
  result: MailboxAuthResult;
  onRecheck?: () => void;
  rechecking?: boolean;
}) {
  const guide = mailboxAuthGuide(result.mailHost);
  const limit = providerSendingLimit(result.mailHost);
  const needsWork = result.overall === "fail" || result.overall === "warn";

  return (
    <section className="space-y-4 rounded-lg border border-border/70 bg-muted/20 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Email authentication for {result.domain}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{result.reason}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Mail host detected: {result.mailHostLabel}. We keep this mailbox to a maximum of{" "}
            {limit.dailyCeiling} emails a day — {limit.note}
          </p>
        </div>
        {onRecheck ? (
          <Button type="button" variant="outline" size="sm" onClick={onRecheck} disabled={rechecking}>
            {rechecking ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Re-check
          </Button>
        ) : null}
      </header>

      <div className="space-y-2.5">
        <Row label="SPF" state={result.spf.state} summary={result.spf.summary} />
        <Row label="DKIM" state={result.dkim.state} summary={result.dkim.summary} />
        <Row label="DMARC" state={result.dmarc.state} summary={result.dmarc.summary} />
      </div>

      {needsWork ? (
        <div className="space-y-2 rounded-md border border-border/70 bg-background p-3">
          <p className="text-sm font-medium">How to fix this on {result.mailHostLabel}</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">{guide.note}</p>
          {guide.docsUrl ? (
            <a
              className="text-xs font-medium underline"
              href={guide.docsUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              Open your provider's own instructions
            </a>
          ) : null}
        </div>
      ) : null}

      {result.overall === "fail" ? (
        <p className="text-xs text-destructive">
          This mailbox is held out of campaigns until the failing record is fixed. Use Re-check once
          you have added it — DNS changes can take up to an hour to show.
        </p>
      ) : null}
    </section>
  );
}
