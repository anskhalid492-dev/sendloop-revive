/** Action-confirmed onboarding notices only; no promotional or timed drip sends. */
export const ACTION_ONBOARDING_EVENTS = ["onboarding.mailbox_ready", "onboarding.leads_imported"] as const;
export function isActionOnboarding(event: string | undefined): boolean {
  return ACTION_ONBOARDING_EVENTS.some((key) => key === event);
}
export const ONBOARDING_GAP_MS = 24 * 60 * 60 * 1000;
export function onboardingDecision(input: { event: string; active: boolean; optedOut: boolean; connected: number; leads: number; campaigns: number; lastNoticeAt?: string | null; now: number }): "send" | "cancel" | "defer" {
  if (!input.active || input.optedOut) return "cancel";
  if (input.event === "onboarding.mailbox_ready" && (input.connected < 1 || input.leads > 0)) return "cancel";
  if (input.event === "onboarding.leads_imported" && (input.leads < 1 || input.campaigns > 0)) return "cancel";
  if (input.lastNoticeAt && input.now - Date.parse(input.lastNoticeAt) < ONBOARDING_GAP_MS) return "defer";
  return "send";
}