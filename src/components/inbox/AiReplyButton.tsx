/**
 * AI Reply control for the composer.
 *
 * Uses the workspace's own connected AI provider (OpenAI or Claude). The draft
 * lands in the composer for the customer to read and edit — it is never sent
 * automatically, and no key ever reaches the browser.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { draftAiReply, listInboxAiProviders } from "@/lib/inbox-ai.functions";

type ProviderId = "openai" | "anthropic";

export function AiReplyButton({
  conversationId,
  onDraft,
  currentDraft = "",
}: {
  conversationId: string;
  onDraft: (text: string) => void;
  /** What the user already typed; kept so it can be restored after AI Reply. */
  currentDraft?: string;
}) {
  const [stage, setStage] = useState<"reading" | "writing">("reading");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const fetchProviders = useServerFn(listInboxAiProviders);
  const draft = useServerFn(draftAiReply);
  const [open, setOpen] = useState(false);

  const providersQuery = useQuery({
    queryKey: ["inbox-ai-providers", conversationId],
    queryFn: () => fetchProviders({ data: { conversationId } }),
    staleTime: 60_000,
  });
  const providers = (providersQuery.data?.providers ?? []) as Array<{
    id: ProviderId;
    label: string;
  }>;

  const generate = useMutation({
    mutationFn: (provider?: ProviderId) => {
      setStage("reading");
      timer.current = setTimeout(() => setStage("writing"), 1500);
      return draft({ data: { conversationId, ...(provider ? { provider } : {}) } });
    },
    onSettled: () => {
      if (timer.current) clearTimeout(timer.current);
    },
    onSuccess: (result) => {
      // Never silently lose what the user typed: offer one-click restore.
      const previous = currentDraft;
      onDraft(result.text);
      if (previous.trim()) {
        toast.success("AI reply inserted — your previous text was replaced.", {
          description: "Review and edit before sending.",
          duration: 12_000,
          action: { label: "Restore my draft", onClick: () => onDraft(previous) },
        });
      } else {
        toast.success("Draft ready — review and edit before sending.");
      }
    },
    onError: (error: Error) =>
      toast.error(error.message || "The reply could not be drafted. Please try again."),
  });

  const label = generate.isPending
    ? stage === "reading"
      ? "Reading conversation…"
      : "Writing reply…"
    : "AI Reply";
  const icon = generate.isPending ? (
    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
  ) : (
    <Sparkles className="mr-1.5 h-3.5 w-3.5 text-primary" />
  );

  // No provider connected yet: point the customer at the one place keys live.
  if (!providers.length) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8"
        onClick={() =>
          toast.info("Connect OpenAI or Claude", {
            description: "Add your AI key in Settings → Integrations to use AI Reply.",
            action: {
              label: "Open settings",
              onClick: () => {
                window.location.href = "/settings?tab=integrations";
              },
            },
          })
        }
      >
        <Sparkles className="mr-1.5 h-3.5 w-3.5 text-primary" />
        Connect OpenAI or Claude
      </Button>
    );
  }

  if (providers.length === 1) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8"
        disabled={generate.isPending}
        onClick={() => generate.mutate(providers[0]!.id)}
      >
        {icon}
        {label}
      </Button>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={generate.isPending}
        >
          {icon}
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Write with</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {providers.map((provider) => (
          <DropdownMenuItem
            key={provider.id}
            onClick={() => {
              setOpen(false);
              generate.mutate(provider.id);
            }}
          >
            {provider.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
