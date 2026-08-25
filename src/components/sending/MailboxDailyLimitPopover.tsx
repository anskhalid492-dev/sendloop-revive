import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { updateMailbox } from "@/lib/mailboxes.functions";

const numberFmt = new Intl.NumberFormat("en-US");

/** Highest mailbox daily limit accepted by the sending backend. */
export const MAILBOX_DAILY_LIMIT_MAX = 2000;

/**
 * Inline editor for a mailbox's daily sending limit.
 *
 * Writes to the same `sending_accounts.daily_limit` field the dispatcher,
 * Unified Inbox compose and mailbox-capacity logic already read, so the new
 * value applies on the very next send. No second limit system is introduced.
 */
export function MailboxDailyLimitPopover({
  accountId,
  dailyLimit,
  sentToday,
  compact,
}: {
  accountId: string;
  dailyLimit: number;
  sentToday: number;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(updateMailbox);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(dailyLimit || 30));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(String(dailyLimit || 30));
      setError(null);
    }
  }, [open, dailyLimit]);

  const remaining = Math.max(0, dailyLimit - sentToday);
  const nextLimit = Number(value.replace(/[^0-9]/g, ""));
  const previewRemaining = Number.isFinite(nextLimit) ? Math.max(0, nextLimit - sentToday) : 0;

  const save = useMutation({
    mutationFn: async () => {
      const parsed = Number(value.replace(/[^0-9]/g, ""));
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error("Enter a whole number of 1 or more.");
      }
      if (parsed > MAILBOX_DAILY_LIMIT_MAX) {
        throw new Error(
          `The highest mailbox limit is ${numberFmt.format(MAILBOX_DAILY_LIMIT_MAX)} emails per day.`,
        );
      }
      return saveFn({ data: { id: accountId, dailyLimit: parsed } });
    },
    onSuccess: async () => {
      toast.success(`Daily sending limit updated to ${numberFmt.format(nextLimit)} emails/day.`);
      setOpen(false);
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["email-accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["email-account-detail", accountId] }),
        queryClient.invalidateQueries({ queryKey: ["mailbox-capacity"] }),
        queryClient.invalidateQueries({ queryKey: ["inbox-mailboxes"] }),
        queryClient.invalidateQueries({ queryKey: ["campaign-accounts"] }),
      ]);
    },
    onError: (err: Error) => {
      setError(err.message || "We could not save that daily limit. Please try again.");
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 tabular-nums"
          aria-label="Edit daily sending limit"
        >
          <span className="font-medium">
            {numberFmt.format(sentToday)} / {numberFmt.format(dailyLimit)}
          </span>
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div>
          <p className="text-sm font-semibold">Daily sending limit</p>
          <p className="text-xs text-muted-foreground">
            Applies to campaign sending and manual emails from the inbox.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-md border border-border/60 bg-muted/40 p-2 text-center">
          <Stat label="Limit" value={dailyLimit} />
          <Stat label="Sent today" value={sentToday} />
          <Stat label="Remaining" value={remaining} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`mailbox-limit-${accountId}`} className="text-xs">
            New limit (emails/day)
          </Label>
          <Input
            id={`mailbox-limit-${accountId}`}
            inputMode="numeric"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !save.isPending) save.mutate();
            }}
          />
          {error ? (
            <p className="text-xs font-medium text-destructive">{error}</p>
          ) : (
            <p className="text-xs text-muted-foreground tabular-nums">
              Remaining after save: {numberFmt.format(previewRemaining)}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </Button>
        </div>
        {compact ? null : (
          <p className="text-[11px] text-muted-foreground">
            Hourly pacing and warmup limits are unchanged.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{numberFmt.format(value)}</p>
    </div>
  );
}
