import { describe, expect, it } from "vitest";

import {
  DEFAULT_BLOG_PROMO_BANNER,
  blogPromoBannerRenderable,
  normalizeBlogPromoBanner,
} from "@/lib/blog-promo-banner";

describe("blog promo banner config", () => {
  it("defaults to enabled with the pricing page destination", () => {
    const config = normalizeBlogPromoBanner(undefined);
    expect(config.enabled).toBe(true);
    expect(config.ctaUrl).toBe("/pricing");
    expect(config.heading).toBe(DEFAULT_BLOG_PROMO_BANNER.heading);
    expect(config.ctaLabel).toContain("Try MunchReach");
  });

  it("merges stored partial configs over the defaults", () => {
    const config = normalizeBlogPromoBanner({ heading: "Custom", enabled: false });
    expect(config.heading).toBe("Custom");
    expect(config.enabled).toBe(false);
    expect(config.ctaUrl).toBe("/pricing");
  });

  it("rejects unsafe or invalid destination URLs", () => {
    expect(normalizeBlogPromoBanner({ ctaUrl: "javascript:alert(1)" }).ctaUrl).toBe("/pricing");
    expect(normalizeBlogPromoBanner({ ctaUrl: "//evil.example" }).ctaUrl).toBe("/pricing");
    expect(normalizeBlogPromoBanner({ ctaUrl: "http://insecure.example" }).ctaUrl).toBe("/pricing");
    expect(normalizeBlogPromoBanner({ ctaUrl: "https://munchreach.com/pricing" }).ctaUrl).toBe(
      "https://munchreach.com/pricing",
    );
    expect(normalizeBlogPromoBanner({ ctaUrl: "/signup" }).ctaUrl).toBe("/signup");
  });

  it("falls back to brand defaults for invalid colors and clamps radius/position", () => {
    const config = normalizeBlogPromoBanner({
      backgroundColor: "red",
      borderRadius: 999,
      position: -5,
    });
    expect(config.backgroundColor).toBe(DEFAULT_BLOG_PROMO_BANNER.backgroundColor);
    expect(config.borderRadius).toBe(32);
    expect(config.position).toBe(0);
  });

  it("does not render when disabled or missing required content", () => {
    expect(blogPromoBannerRenderable(normalizeBlogPromoBanner({ enabled: false }))).toBe(false);
    expect(
      blogPromoBannerRenderable(normalizeBlogPromoBanner({ heading: "", ctaLabel: "", ctaUrl: "" })),
    ).toBe(true); // empty fields fall back to defaults
    expect(blogPromoBannerRenderable(normalizeBlogPromoBanner(undefined))).toBe(true);
  });

  it("respects desktop/mobile visibility flags", () => {
    const config = normalizeBlogPromoBanner({ showOnDesktop: false, showOnMobile: true });
    expect(config.showOnDesktop).toBe(false);
    expect(config.showOnMobile).toBe(true);
  });
});
