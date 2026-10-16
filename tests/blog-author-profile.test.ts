import { describe, expect, it } from "vitest";

import {
  authorCanonicalUrl,
  authorMetaDescription,
  authorPersonRef,
  authorProfileJsonLd,
  authorProfilePath,
  authorSeoTitle,
  authorSocialLinks,
  isValidEmail,
  isValidHttpUrl,
} from "@/lib/blog-author";
import type { BlogAuthor } from "@/lib/blog-model";

const base: BlogAuthor = {
  id: "a1",
  slug: "anus-khalid",
  name: "Anus Khalid",
  role: "Founder",
  bio: "Builds MunchReach and writes about cold email.",
  avatar_url: "/api/public/media/avatar.png",
};

describe("author SEO defaults", () => {
  it("builds a default title from name and role", () => {
    expect(authorSeoTitle(base)).toBe("Anus Khalid — Founder | MunchReach Blog");
  });

  it("prefers a custom SEO title", () => {
    expect(authorSeoTitle({ ...base, seo_title: "Custom" })).toBe("Custom");
  });

  it("falls back to the short bio for the meta description", () => {
    expect(authorMetaDescription(base)).toBe(base.bio);
  });

  it("generates a description when no bio exists", () => {
    expect(authorMetaDescription({ ...base, bio: "" })).toContain("Anus Khalid");
  });

  it("canonical defaults to the profile URL and respects overrides", () => {
    expect(authorCanonicalUrl(base)).toBe("https://munchreach.com/blog/author/anus-khalid");
    expect(authorCanonicalUrl({ ...base, canonical_url: "/blog" })).toBe("https://munchreach.com/blog");
  });
});

describe("author social links", () => {
  it("returns nothing when all fields are empty", () => {
    expect(authorSocialLinks(base)).toEqual([]);
  });

  it("includes only populated links", () => {
    const links = authorSocialLinks({ ...base, linkedin_url: "https://www.linkedin.com/in/anus" });
    expect(links).toEqual([{ kind: "linkedin", href: "https://www.linkedin.com/in/anus", label: "LinkedIn profile" }]);
  });

  it("hides the email when show_email is false", () => {
    const withEmail = { ...base, public_email: "a@b.co", show_email: true };
    const hidden = { ...base, public_email: "a@b.co", show_email: false };
    expect(authorSocialLinks(withEmail).some((l) => l.kind === "email")).toBe(true);
    expect(authorSocialLinks(hidden).some((l) => l.kind === "email")).toBe(false);
  });

  it("renders email as a mailto link", () => {
    const links = authorSocialLinks({ ...base, public_email: "a@b.co", show_email: true });
    expect(links.find((l) => l.kind === "email")?.href).toBe("mailto:a@b.co");
  });
});

describe("author structured data", () => {
  it("emits ProfilePage with Person mainEntity", () => {
    const ld = authorProfileJsonLd({
      ...base,
      company: "MunchReach",
      linkedin_url: "https://www.linkedin.com/in/anus",
      x_url: "https://x.com/anus",
    }) as any;
    expect(ld["@type"]).toBe("ProfilePage");
    expect(ld.mainEntity["@type"]).toBe("Person");
    expect(ld.mainEntity.name).toBe("Anus Khalid");
    expect(ld.mainEntity.jobTitle).toBe("Founder");
    expect(ld.mainEntity.worksFor.name).toBe("MunchReach");
    expect(ld.mainEntity.sameAs).toHaveLength(2);
    expect(ld.mainEntity.url).toBe("https://munchreach.com/blog/author/anus-khalid");
  });

  it("omits empty schema properties", () => {
    const ld = authorProfileJsonLd({ ...base, role: "", avatar_url: null }) as any;
    expect(ld.mainEntity.jobTitle).toBeUndefined();
    expect(ld.mainEntity.image).toBeUndefined();
    expect(ld.mainEntity.worksFor).toBeUndefined();
    expect(ld.mainEntity.sameAs).toBeUndefined();
  });

  it("Person ref on articles points at the internal profile", () => {
    expect(authorPersonRef(base)).toEqual({
      "@type": "Person",
      name: "Anus Khalid",
      url: "https://munchreach.com/blog/author/anus-khalid",
    });
  });
});

describe("validation helpers", () => {
  it("validates emails", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
  });

  it("validates http(s) URLs only", () => {
    expect(isValidHttpUrl("https://x.com/a")).toBe(true);
    expect(isValidHttpUrl("ftp://x.com")).toBe(false);
    expect(isValidHttpUrl("not a url")).toBe(false);
  });

  it("builds the profile path", () => {
    expect(authorProfilePath("anus-khalid")).toBe("/blog/author/anus-khalid");
  });
});
