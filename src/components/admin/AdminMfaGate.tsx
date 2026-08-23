/**
 * Two-factor gate for the admin area.
 *
 * Uses the existing Supabase Auth MFA (TOTP) — no second auth system. Admins
 * without a verified factor must enroll; admins with a factor must step the
 * session up to AAL2 before the admin UI renders. Every privileged server
 * function independently rejects AAL1 sessions, so this screen is the UX for a
 * rule that is enforced server-side.
 */
import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { adminRecordMfaEvent } from "@/lib/admin-security.functions";

type Props = { enrolled: boolean; onSatisfied: () => void };

export function AdminMfaGate({ enrolled, onSatisfied }: Props) {
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = data?.totp?.find((factor) => factor.status === "verified");
      if (verified) {
        if (!cancelled) setFactorId(verified.id);
        return;
      }
      const unverified = data?.all?.find((factor) => factor.status === "unverified");
      if (unverified) await supabase.auth.mfa.unenroll({ factorId: unverified.id });
      const { data: enrollment, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `MunchReach admin ${new Date().toISOString().slice(0, 10)}`,
      });
      if (error || cancelled) return;
      setFactorId(enrollment.id);
      setQr(enrollment.totp.qr_code);
      setSecret(enrollment.totp.secret);
    })();
    return () => {
      cancelled = true;
    };
  }, [enrolled]);

  async function verify() {
    if (!factorId || code.trim().length < 6) return;
    setBusy(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (error) {
        await adminRecordMfaEvent({ data: { event: qr ? "enroll" : "challenge", success: false } }).catch(() => {});
        toast.error("That code was not accepted. Try the next one from your app.");
        return;
      }
      await adminRecordMfaEvent({ data: { event: qr ? "enroll" : "challenge", success: true } }).catch(() => {});
      toast.success("Two-factor verification complete.");
      onSatisfied();
    } catch {
      toast.error("Verification failed. Please try again.");
    } finally {
      setBusy(false);
      setCode("");
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg items-center">
      <div className="surface-card w-full p-8">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          {qr ? <KeyRound className="size-6" /> : <ShieldCheck className="size-6" />}
        </span>
        <h2 className="mt-4 text-lg font-semibold">
          {qr ? "Set up two-factor authentication" : "Two-factor verification required"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {qr
            ? "The MunchReach admin area requires a second factor. Scan this code with your authenticator app, then enter the 6-digit code."
            : "Enter the 6-digit code from your authenticator app to unlock the admin area."}
        </p>

        {qr ? (
          <div className="mt-6 flex flex-col items-center gap-3">
            <img src={qr} alt="Two-factor setup QR code" className="size-44 rounded-lg bg-white p-2" />
            {secret ? (
              <code className="rounded bg-muted px-2 py-1 text-xs tracking-widest">{secret}</code>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex gap-2">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className="tracking-[0.4em]"
          />
          <Button onClick={verify} disabled={busy || code.length < 6}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Verify"}
          </Button>
        </div>
      </div>
    </div>
  );
}
