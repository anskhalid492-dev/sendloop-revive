/**
 * Provider selector for the mailbox connection flow.
 *
 * Picking a provider only pre-fills the recommended server settings — every
 * field stays editable, because a domain bought at one company is often hosted
 * for email somewhere else.
 */
import { Check } from "lucide-react";

import { ProviderLogo } from "@/components/mailbox/ProviderLogo";
import { MAILBOX_PROVIDERS, type MailboxProviderId } from "@/lib/mailbox-providers";

export function ProviderPicker({
  value,
  onChange,
  disabled,
}: {
  value: MailboxProviderId | null;
  onChange: (id: MailboxProviderId) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Email provider"
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4"
    >
      {MAILBOX_PROVIDERS.map((provider) => {
        const selected = value === provider.id;
        return (
          <button
            key={provider.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(provider.id)}
            className={
              "group relative flex min-w-0 items-center gap-2.5 rounded-xl border bg-card p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" +
              (selected
                ? " border-primary bg-primary/5 ring-1 ring-primary/30"
                : " border-border hover:border-primary/50 hover:bg-muted/40")
            }
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background">
              <ProviderLogo provider={provider.id} name={provider.displayName} className="size-5" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {provider.displayName}
            </span>
            {selected ? (
              <Check className="size-4 shrink-0 text-primary" aria-hidden />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
