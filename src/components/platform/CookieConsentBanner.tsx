/**
 * Cookie consent banner driven entirely by Admin → System settings → Cookie &
 * consent. The choice is stored per consent version, so bumping the version in
 * the admin asks every visitor again.
 */
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { booleanValue, getPlatformConfig } from "@/lib/platform-config-store";

const STORAGE_KEY = "sendloop.cookie-consent";

type Consent = { version: string; analytics: boolean; marketing: boolean; at: string };

export function readCookieConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Consent) : null;
  } catch {
    return null;
  }
}

export function CookieConsentBanner() {
  const config = getPlatformConfig();
  const consentGroup = config?.consent ?? {};
  const enabled = booleanValue("consent", "cookie_banner_enabled", false);
  const version = String(consentGroup["consent_version"] ?? "1");
  const offersAnalytics = booleanValue("consent", "analytics_consent", true);
  const offersMarketing = booleanValue("consent", "marketing_consent", false);

  const [visible, setVisible] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const stored = readCookieConsent();
    setVisible(!stored || stored.version !== version);
  }, [enabled, version]);

  if (!enabled || !visible) return null;

  const persist = (next: { analytics: boolean; marketing: boolean }) => {
    const payload: Consent = { version, ...next, at: new Date().toISOString() };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* storage unavailable — the banner simply shows again next visit */
    }
    window.dispatchEvent(new CustomEvent("sendloop:consent", { detail: payload }));
    setVisible(false);
  };

  const policyUrl = String(consentGroup["policy_url"] ?? "/privacy");

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-background/95 p-4 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <p className="font-semibold">{String(consentGroup["banner_title"] ?? "We use cookies")}</p>
          <p className="mt-1 text-muted-foreground">
            {String(consentGroup["banner_text"] ?? "")}{" "}
            <a href={policyUrl} className="text-primary underline-offset-4 hover:underline">
              Learn more
            </a>
          </p>
          {offersAnalytics || offersMarketing ? (
            <div className="mt-2 flex flex-wrap gap-4 text-xs">
              {offersAnalytics ? (
                <label className="flex items-center gap-2">
                  <Switch checked={analytics} onCheckedChange={setAnalytics} /> Analytics
                </label>
              ) : null}
              {offersMarketing ? (
                <label className="flex items-center gap-2">
                  <Switch checked={marketing} onCheckedChange={setMarketing} /> Marketing
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => persist({ analytics: false, marketing: false })}
          >
            {String(consentGroup["reject_label"] ?? "Essential only")}
          </Button>
          {offersAnalytics || offersMarketing ? (
            <Button variant="secondary" size="sm" onClick={() => persist({ analytics, marketing })}>
              Save choices
            </Button>
          ) : null}
          <Button size="sm" onClick={() => persist({ analytics: true, marketing: true })}>
            {String(consentGroup["accept_label"] ?? "Accept all")}
          </Button>
        </div>
      </div>
    </div>
  );
}
