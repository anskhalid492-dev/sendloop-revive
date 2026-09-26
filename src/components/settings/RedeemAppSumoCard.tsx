import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { redeemAppSumoCode } from "@/lib/appsumo.functions";

/** Lets an AppSumo buyer activate Lifetime access — no payment details needed. */
export function RedeemAppSumoCard({ workspaceId }: { workspaceId: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const redeem = useServerFn(redeemAppSumoCode);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const m = useMutation({
    mutationFn: () => redeem({ data: { code: code.trim().toUpperCase(), workspaceId } }),
    onSuccess: (r) => {
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setError(null);
      toast.success("AppSumo code redeemed — Lifetime access is active.");
      qc.invalidateQueries();
      navigate({ to: "/dashboard" });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <section className="surface-card space-y-3 p-6">
      <div>
        <h2 className="text-base font-semibold tracking-tight">Have an AppSumo code?</h2>
        <p className="text-sm text-muted-foreground">
          Enter it to activate Lifetime access for this workspace. No payment details needed.
        </p>
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) m.mutate();
        }}
      >
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Your AppSumo code"
          aria-label="AppSumo code"
          autoComplete="off"
          maxLength={64}
          className="max-w-xs font-mono uppercase"
        />
        <Button type="submit" disabled={m.isPending || !code.trim()}>
          {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Redeem code
        </Button>
      </form>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
