/** Display state for Admin → AI Sales Agent. Every request path ends in a non-loading state. */
export type MonitoringView = "loading" | "ready" | "error" | "denied" | "invalid";

const ACCESS = /forbidden|unauthori|super admin|two-factor|verification|revoked/i;

export function monitoringView(s: { invalid: boolean; isError: boolean; hasData: boolean; errorMessage?: string | null }): MonitoringView {
  if (s.invalid) return "invalid";
  if (s.isError && !s.hasData) return ACCESS.test(s.errorMessage ?? "") ? "denied" : "error";
  return s.hasData ? "ready" : "loading";
}
