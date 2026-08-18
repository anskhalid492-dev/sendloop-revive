import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { subscribeToNewsletter } from "@/lib/blog.functions";

export function NewsletterCard({ source = "blog", compact = false }: { source?: string; compact?: boolean }) {
  const subscribe = useServerFn(subscribeToNewsletter);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setState(null);
    try {
      const res = await subscribe({ data: { email: email.trim(), source } });
      if (res.ok) {
        toast.success(res.message);
        setState({ kind: "success", message: res.message });
        setEmail("");
      } else {
        toast.error(res.message);
        setState({ kind: "error", message: res.message });
      }
    } catch {
      const message = "Could not subscribe right now. Please try again.";
      toast.error(message);
      setState({ kind: "error", message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`surface-card ${compact ? "p-5" : "p-8 text-center"}`}>
      {!compact ? (
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/12 text-primary">
          <Mail className="size-6" />
        </span>
      ) : null}
      <p className={compact ? "text-sm font-semibold" : "text-2xl font-bold tracking-tight"}>
        Get Better at Cold Email
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Practical cold email strategies, deliverability tips and proven outreach ideas in your inbox.
      </p>
      <form className="mt-4 flex flex-col gap-2" onSubmit={onSubmit}>
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email address"
          aria-label="Your email address"
        />
        <Button type="submit" disabled={busy}>
          {busy ? "Subscribing…" : "Subscribe"}
          <ArrowRight className="size-4" />
        </Button>
      </form>
      {state ? (
        <p
          role="status"
          className={`mt-2 text-xs font-medium ${
            state.kind === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
          }`}
        >
          {state.message}
        </p>
      ) : null}
      <p className="mt-2 text-[11px] text-muted-foreground">No spam. Unsubscribe anytime.</p>
    </div>
  );
}
