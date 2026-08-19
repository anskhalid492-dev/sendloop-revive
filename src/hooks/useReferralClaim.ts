import { useEffect } from "react";

import { REFERRAL_COOKIE, REFERRAL_STORAGE_KEY, normalizeCode } from "@/lib/referral-model";
import { claimReferralCode } from "@/lib/referral.functions";

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
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(REFERRAL_STORAGE_KEY);
    } catch {
      stored = null;
    }
    const code = normalizeCode(stored ?? readCookie(REFERRAL_COOKIE));
    if (!code) return;

    let cancelled = false;
    void claimReferralCode({ data: { code } })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) clearStoredCode();
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
}

/** Stores a referral code seen in the URL so it survives the signup flow. */
export function captureReferralCode(raw: string | null | undefined) {
  const code = normalizeCode(raw);
  if (!code || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REFERRAL_STORAGE_KEY, code);
  } catch {
    /* storage may be blocked */
  }
  document.cookie = `${REFERRAL_COOKIE}=${code}; Path=/; Max-Age=${60 * 60 * 24 * 60}; SameSite=Lax`;
}
