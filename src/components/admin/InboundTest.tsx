import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock, Loader2, Send, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getInboundTests, startInboundTest } from "@/lib/ops.functions";

const STATUS_META: Record<string, { label: string; icon: typeof CheckCircle2; tone: string }> = {
  reply_received: { label: "Reply received", icon: CheckCircle2, tone: "text-emerald-600" },
  awaiting_reply: { label: "Awaiting reply", icon: Clock, tone: "text-amber-600" },
  failed: { label: "Send failed", icon: XCircle, tone: "text-destructive" },
};

/**
 * End-to-end inbound test: sends a real email with a routed reply address and
 * shows whether the reply came back through the inbound pipeline.
 */
export function InboundTest() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const run = useServerFn(startInboundTest);
  const list = useServerFn(getInboundTests);

  const tests = useQuery({
    queryKey: ["inbound-tests"],
    queryFn: () => list(),
    refetchInterval: 15_000,
  });

  const mutation = useMutation({
    mutationFn: (toEmail: string) => run({ data: { toEmail } }),
    onSuccess: (result) => {
      toast.success(`Test sent to ${result.to}. Reply to it to complete the check.`);
      setEmail("");
      void queryClient.invalidateQueries({ queryKey: ["inbound-tests"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test inbound replies</CardTitle>
        <CardDescription>
          Sends a real email from a managed mailbox using a tracked reply address. Reply to it from
          your own inbox and the result appears below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (email.trim()) mutation.mutate(email.trim());
          }}
        >
          <Input
            type="email"
            required
            placeholder="you@yourcompany.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Send test
          </Button>
        </form>

        <div className="space-y-2">
          {tests.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading recent tests…</p>
          ) : !tests.data?.tests.length ? (
            <p className="text-sm text-muted-foreground">No inbound tests have been run yet.</p>
          ) : (
            tests.data.tests.map((test) => {
              const meta = STATUS_META[test.status] ?? STATUS_META["awaiting_reply"]!;
              const Icon = meta.icon;
              return (
                <div
                  key={test.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{test.to_email}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Reply address: {test.reply_to}
                    </p>
                    {test.error ? (
                      <p className="truncate text-xs text-destructive">{test.error}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Icon className={`size-4 ${meta.tone}`} aria-hidden />
                    <Badge variant="outline">{meta.label}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(test.sent_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
