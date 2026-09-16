/**
 * The ONE tracking step every send path uses.
 *
 * Campaign dispatch, Unified Inbox replies and Compose all call
 * `applyEmailTracking` so an open pixel and tracked links are added in exactly
 * the same way, in the same order, with the same rules:
 *
 *  - no HTML body  -> nothing is injected (a plain-text email is never turned
 *    into HTML just to carry tracking),
 *  - tracking switched off -> that part is skipped,
 *  - unsubscribe links and the pixel itself are never wrapped as clicks.
 */
import { rewriteLinksForClickTracking, type ClickTrackingTarget } from "@/lib/click-tracking";
import { injectOpenPixel, openPixelUrl, type OpenTrackingTarget } from "@/lib/open-tracking";

export type EmailTrackingTarget = OpenTrackingTarget & ClickTrackingTarget;

export function applyEmailTracking(
  html: string | null | undefined,
  args: { target: EmailTrackingTarget; trackOpens: boolean; trackClicks: boolean },
): string | null {
  if (!html) return html ?? null;
  let out: string | null = html;
  // Links first, so the pixel added afterwards is never itself rewritten.
  if (args.trackClicks) out = rewriteLinksForClickTracking(out, args.target);
  if (args.trackOpens) out = injectOpenPixel(out, openPixelUrl(args.target));
  return out;
}
