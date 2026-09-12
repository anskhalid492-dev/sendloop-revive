/**
 * Cloudflare Turnstile widget in "managed" mode.
 *
 * - The Turnstile script is injected after mount and loaded async/defer, so it
 *   never blocks first paint or hydration of the auth forms.
 * - `appearance: "always"` keeps the widget visible so visitors (and we) can
 *   see the check running; managed mode still resolves without interaction for
 *   legitimate traffic.
 * - The token is handed to the parent form, which sends it to the server; the
 *   server is what actually decides whether the request proceeds.
 */
import { useEffect, useRef } from "react";

import { TURNSTILE_SITE_KEY, type TurnstileAction } from "@/lib/turnstile-config";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => {
      scriptPromise = null;
      reject(new Error("Turnstile script failed to load"));
    });
    if (!existing) document.head.appendChild(script);
  });

  return scriptPromise;
}

export type TurnstileWidgetProps = {
  action: TurnstileAction;
  /** Receives a fresh token, or null when the token expired or errored. */
  onToken: (token: string | null) => void;
  className?: string;
};

export function TurnstileWidget({ action, onToken, className }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const callbackRef = useRef(onToken);
  callbackRef.current = onToken;

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          appearance: "always",
          size: "flexible",
          callback: (token: string) => callbackRef.current(token),
          "expired-callback": () => callbackRef.current(null),
          "timeout-callback": () => callbackRef.current(null),
          "error-callback": () => callbackRef.current(null),
        });
      })
      .catch(() => {
        // Never block the form on a script/network failure; the server still
        // rejects requests that arrive without a valid token.
        callbackRef.current(null);
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          /* widget already gone */
        }
      }
    };
  }, [action]);

  return <div ref={containerRef} className={className} />;
}
