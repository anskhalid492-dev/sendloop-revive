/**
 * AI Email Composer for the New Email composer. Rewrites the body the user
 * already wrote using the workspace's own AI key. The suggestion is shown as a
 * preview — the original stays in the composer until "Use this version".
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COMPOSE_MODES, COMPOSE_MODE_LABELS, type ComposeMode } from "@/lib/inbox-ai-prompt";
import { composeAiEmail } from "@/lib/inbox-ai.functions";

export function AiComposerButton({
  workspaceId,
  draft,
  recipientEmail,
  onApply,
}: {
  workspaceId: string | null;
  draft: string;
  recipientEmail?: string;
  onApply: (text: string) => void;
}) {
  const compose = useServerFn(composeAiEmail);
  const [suggestion, setSuggestion] = useState<{ mode: ComposeMode; text: string } | null>(null);

  const run = useMutation({
    mutationFn: (mode: ComposeMode) =>
      compose({ data: { workspaceId: workspaceId!, mode, draft, recipientEmail: recipientEmail?.trim() || null } }).then((r) => ({ mode, text: r.text })),
    onSuccess: (r) => setSuggestion(r),
    onError: (e: Error) => toast.error(e.message || "Couldn't improve the email. Your draft is unchanged."),
  });

  const hasDraft = draft.trim().length > 0;

  return (
    <Popover open={Boolean(suggestion)} onOpenChange={(o) => !o && setSuggestion(null)}>
      <DropdownMenu>
        <PopoverAnchor asChild>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={!workspaceId || run.isPending}>
              {run.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5 text-primary" />}
              {run.isPending ? "Improving…" : "AI Email Composer"}
            </Button>
          </DropdownMenuTrigger>
        </PopoverAnchor>
        <DropdownMenuContent align="start" side="top">
          {COMPOSE_MODES.map((mode) => (
            <DropdownMenuItem
              key={mode}
              onClick={() => {
                if (!hasDraft) {
                  toast.info("Write a rough email first, then let AI polish it.");
                  return;
                }
                run.mutate(mode);
              }}
            >
              {COMPOSE_MODE_LABELS[mode]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <PopoverContent side="top" align="start" className="w-[min(32rem,90vw)] space-y-3">
        <p className="text-xs font-medium text-muted-foreground">{suggestion ? COMPOSE_MODE_LABELS[suggestion.mode] : ""} — preview</p>
        <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">{suggestion?.text}</div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setSuggestion(null)}>
            Keep my original
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (suggestion) onApply(suggestion.text);
              setSuggestion(null);
            }}
          >
            Use this version
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
