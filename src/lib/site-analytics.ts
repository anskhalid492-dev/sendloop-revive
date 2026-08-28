/**
 * Lightweight marketing analytics.
 *
 * Emits named events to whatever tag manager the admin injected through the
 * global SEO head scripts (gtag or a dataLayer). No personal data is collected
 * — only the event name and a small, non-identifying property bag.
 */

type EventProps = Record<string, string | number | boolean>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export function trackEvent(event: string, props: EventProps = {}): void {
  if (typeof window === "undefined") return;
  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", event, props);
      return;
    }
    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event, ...props });
    }
  } catch {
    // Analytics must never break a page interaction.
  }
}
