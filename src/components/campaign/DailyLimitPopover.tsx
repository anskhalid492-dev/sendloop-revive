import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Gauge, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { setCampaignDailyLimit } from "@/lib/campaigns.functions";
import type { CampaignOverviewRow } from "@/lib/campaign-overview";

const numberFmt = new Intl.NumberFormat("en-US");

/**
 * Quick shortcut for the campaign's daily sending limit.
 *
 * Saves to the same campaign daily limit used by the sending backend, so the
 * change takes effect on the very next send.
 */
export function DailyLimitPopover({
  row,
  trigger,
}: {
  row: CampaignOverviewRow;
  trigger?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(setCampaignDailyLimit);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(row.dailyCap || 100));

  useEffect(() => {
    if (open) setValue(String(row.dailyCap || 100));
  }, [open, row.dailyCap]);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = Number(value.replace(/[^0-9]/g, ""));
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error("Enter a whole number of 1 or more.");
      }
      if (parsed > 10000) {
        throw new Error("The highest daily limit is 10,000 emails per day.");
      }
      return saveFn({ data: { id: row.id, dailyCap: parsed } });
    },
    onSuccess: async (result) => {
      toast.success(
        `Daily sending limit updated to ${numberFmt.format(result.dailyCap)} emails/day.`,
      );
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (error: Error) => {
      setValue(String(row.dailyCap || 100));
      toast.error(error.message || "We could not save that daily limit. Please try again.");
    },
  });

  const capacity =
    row.mailboxDailyCapacity > 0 && row.dailyCap > 0
      ? Math.min(row.mailboxDailyCapacity, row.dailyCap)
      : row.dailyCap;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="icon" title="Daily email sending limit">
            <Gauge className="size-4" />
            <span className="sr-only">Daily email sending limit for {row.name}</span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4">
        <div className="space-y-1">
          <Label htmlFor={`daily-limit-${row.id}`} className="text-sm font-semibold">
            Daily email sending limit
          </Label>
          <p className="text-xs text-muted-foreground">
            Follow-ups are included in this daily limit.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Input
            id={`daily-limit-${row.id}`}
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-28"
          />
          <span className="text-sm text-muted-foreground">emails/day</span>
        </div>

        <div className="space-y-1 rounded-lg bg-muted/50 px-3 py-2 text-xs">
          <p className="text-muted-foreground">Current daily usage</p>
          <p className="font-medium tabular-nums">
            {numberFmt.format(row.sentToday)} / {numberFmt.format(row.dailyCap || 0)} emails
          </p>
          <p className="text-muted-foreground">
            Remaining today:{" "}
            <span className="font-medium tabular-nums text-foreground">
              {row.dailyCap > 0
                ? numberFmt.format(Math.max(0, row.dailyCap - row.sentToday))
                : "—"}
            </span>
          </p>
          <p className="text-muted-foreground">
            Total leads: {numberFmt.format(row.leads)} · pending{" "}
            {numberFmt.format(Math.max(0, row.leads - row.sent))}
          </p>
          {row.mailboxDailyCapacity > 0 ? (
            <p className="text-muted-foreground">
              Actual available capacity: {numberFmt.format(capacity)}/day from your connected
              mailboxes.
            </p>
          ) : null}
        </div>

        <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Save limit
        </Button>
      </PopoverContent>
    </Popover>
  );
}
