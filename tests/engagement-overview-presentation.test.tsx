import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { EngagementOverview } from "@/components/analytics/EngagementOverview";
import { ENGAGEMENT_SERIES } from "@/lib/analytics-overview";

const props = { points: [], loading: false, error: false, onRetry: () => {}, controls: <button>Custom</button>, bucket: "day" as const };
describe("engagement overview presentation", () => {
  it("renders all headline metrics and the real-data empty state", () => {
    const html = renderToStaticMarkup(<EngagementOverview {...props} />);
    for (const label of ["Engagement Overview", "Contacted", "Opened", "Replied", "Unsubscribe Rate", "Custom", "No engagement recorded in this range."]) expect(html).toContain(label);
  });
  it("renders a retryable error instead of false zero metrics", () => {
    const html = renderToStaticMarkup(<EngagementOverview {...props} error />);
    expect(html).toContain('role="alert"'); expect(html).toContain("Retry");
    expect(html).not.toContain("No engagement recorded");
  });
  it("uses loading skeletons, not decorative trends", () => {
    const html = renderToStaticMarkup(<EngagementOverview {...props} loading />);
    expect(html).toContain("animate-pulse"); expect(html).not.toContain("No engagement recorded");
  });
  it("resolves distinct series tokens defined in light and dark themes", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(new Set(ENGAGEMENT_SERIES.map(s => s.color)).size).toBe(4);
    for (const series of ENGAGEMENT_SERIES) {
      const token = series.color.slice(4, -1);
      expect(css.split(`${token}:`).length - 1).toBeGreaterThanOrEqual(2);
    }
    expect(ENGAGEMENT_SERIES[0].color).toBe("var(--primary)");
  });
});