/**
 * Client-safe helpers for author profiles: SEO defaults, structured data and
 * social-link normalization. Shared by the public author page, the article
 * schema and the admin editor so every surface derives the same values.
 */
import type { BlogAuthor } from "@/lib/blog-model";
import { absoluteUrl } from "@/lib/seo";

export function authorProfilePath(slug: string): string {
  return `/blog/author/${slug}`;
}

/** SEO title: custom value wins, otherwise a sensible default from the profile. */
export function authorSeoTitle(author: Pick<BlogAuthor, "name" | "role" | "seo_title">): string {
  if (author.seo_title?.trim()) return author.seo_title.trim();
  const role = author.role?.trim();
  return role ? `${author.name} — ${role} | MunchReach Blog` : `${author.name} — MunchReach Blog`;
}

/** Meta description: custom value, then short bio, then a generated fallback. */
export function authorMetaDescription(
  author: Pick<BlogAuthor, "name" | "role" | "bio" | "meta_description">,
): string {
  if (author.meta_description?.trim()) return author.meta_description.trim();
  if (author.bio?.trim()) return author.bio.trim().slice(0, 300);
  const role = author.role?.trim();
  return role
    ? `Articles and insights by ${author.name}, ${role} at MunchReach.`
    : `Articles and insights by ${author.name} on the MunchReach blog.`;
}

/** Canonical URL: custom value (made absolute) or the profile's own URL. */
export function authorCanonicalUrl(author: Pick<BlogAuthor, "slug" | "canonical_url">): string {
  if (author.canonical_url?.trim()) return absoluteUrl(author.canonical_url.trim());
  return absoluteUrl(authorProfilePath(author.slug));
}

/** Social links that actually have values — empty profiles never render icons. */
export function authorSocialLinks(
  author: Pick<BlogAuthor, "linkedin_url" | "x_url" | "public_email" | "show_email" | "website_url">,
): { kind: "linkedin" | "x" | "email" | "website"; href: string; label: string }[] {
  const links: { kind: "linkedin" | "x" | "email" | "website"; href: string; label: string }[] = [];
  if (author.linkedin_url?.trim()) {
    links.push({ kind: "linkedin", href: author.linkedin_url.trim(), label: "LinkedIn profile" });
  }
  if (author.x_url?.trim()) {
    links.push({ kind: "x", href: author.x_url.trim(), label: "X (Twitter) profile" });
  }
  if (author.public_email?.trim() && author.show_email !== false) {
    links.push({ kind: "email", href: `mailto:${author.public_email.trim()}`, label: "Email" });
  }
  if (author.website_url?.trim()) {
    links.push({ kind: "website", href: author.website_url.trim(), label: "Personal website" });
  }
  return links;
}

/** Google ProfilePage structured data with Person as mainEntity. */
export function authorProfileJsonLd(author: BlogAuthor): Record<string, unknown> {
  const url = absoluteUrl(authorProfilePath(author.slug));
  const sameAs = [author.linkedin_url, author.x_url, author.website_url]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v));

  const person: Record<string, unknown> = {
    "@type": "Person",
    name: author.name,
    url,
    description: authorMetaDescription(author),
  };
  if (author.avatar_url) person.image = absoluteUrl(author.avatar_url);
  if (author.role?.trim()) person.jobTitle = author.role.trim();
  if (author.company?.trim()) person.worksFor = { "@type": "Organization", name: author.company.trim() };
  if (sameAs.length) person.sameAs = sameAs;

  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url,
    name: authorSeoTitle(author),
    description: authorMetaDescription(author),
    mainEntity: person,
  };
}

/** Person reference for BlogPosting/Article schema on posts by this author. */
export function authorPersonRef(author: Pick<BlogAuthor, "name" | "slug">): Record<string, unknown> {
  return {
    "@type": "Person",
    name: author.name,
    url: absoluteUrl(authorProfilePath(author.slug)),
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim()) && value.trim().length <= 200;
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
