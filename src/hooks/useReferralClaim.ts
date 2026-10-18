import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";

import { REFERRAL_COOKIE, REFERRAL_STORAGE_KEY, normalizeCode } from "@/lib/referral-model";
import { claimReferralCode, getPublicReferralProgram } from "@/lib/referral.functions";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function clearStoredCode() {
  try {
    window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {
    /* storage may be blocked */
  }
  document.cookie = `${REFERRAL_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * Claims a captured referral code once the user has a session.
 * The server decides whether the attribution is valid; the client only
 * proposes the code and then forgets it.
 */
export function useReferralClaim(enabled: boolean) {
  const claim = useServerFn(claimReferralCode);
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(REFERRAL_STORAGE_KEY);
    } catch {
      stored = null;
    }
    const cookie = readCookie(REFERRAL_COOKIE);
    const code = normalizeCode(cookie ? stored ?? cookie : null);
    if (!code) return;

    let cancelled = false;
    void claim({ data: { code } })
      .then((result) => {
        if (!cancelled && (result.attributed || ["already_attributed", "self_referral", "account_too_old", "invalid_code"].includes(result.reason ?? ""))) clearStoredCode();
      }).catch(() => { /* Keep attribution for a later authenticated retry. */ });
    return () => {
      cancelled = true;
    };
  }, [enabled, claim]);
}

/** Stores a referral code seen in the URL so it survives the signup flow. */
export function captureReferralCode(raw: string | null | undefined) {
  const code = normalizeCode(raw);
  if (!code || typeof window === "undefined") return;
  const existing = normalizeCode(readCookie(REFERRAL_COOKIE));
  if (existing) {
    try { window.localStorage.setItem(REFERRAL_STORAGE_KEY, existing); } catch { /* optional cache */ }
    return;
  }
  try {
    window.localStorage.setItem(REFERRAL_STORAGE_KEY, code);
  } catch {
    /* storage may be blocked */
  }
  document.cookie = `${REFERRAL_COOKIE}=${code}; Path=/; Max-Age=${60 * 60 * 24 * 60}; SameSite=Lax`;
  void getPublicReferralProgram().then((program) => {
    if (readCookie(REFERRAL_COOKIE) !== code) return;
    document.cookie = `${REFERRAL_COOKIE}=${code}; Path=/; Max-Age=${60 * 60 * 24 * (program?.cookie_duration_days ?? 60)}; SameSite=Lax`;
  }).catch(() => { /* Tracking never blocks signup. */ });
}
