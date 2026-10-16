import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Building2, Globe, Linkedin, Mail, MapPin, Twitter } from "lucide-react";

import { HtmlArticleBody } from "@/components/blog/ArticleBody";
import { PostCard } from "@/components/blog/BlogCards";
import { MarketingLayout, Section } from "@/components/site/MarketingPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  authorCanonicalUrl,
  authorMetaDescription,
  authorProfileJsonLd,
  authorProfilePath,
  authorSeoTitle,
  authorSocialLinks,
} from "@/lib/blog-author";
import { initials, type BlogAuthor } from "@/lib/blog-model";
import { getBlogAuthor } from "@/lib/blog.functions";
import { absoluteUrl, breadcrumbJsonLd, NOINDEX_META } from "@/lib/seo";

const PAGE_SIZE = 9;

export const Route = createFileRoute("/blog/author/$slug")({
  loader: async ({ params }) => {
    const result = await getBlogAuthor({ data: { slug: params.slug } });
    if (!result.author) throw notFound();
    return result;
  },
  head: ({ params, loaderData }) => {
    const author = loaderData?.author;
    if (!author) {
      return { meta: [{ title: "Author — MunchReach Blog" }, NOINDEX_META] };
    }
    const title = authorSeoTitle(author);
    const description = authorMetaDescription(author);
    const url = absoluteUrl(authorProfilePath(params.slug));
    const canonical = authorCanonicalUrl(author);
    const image = author.og_image_url || author.avatar_url;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "profile" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        ...(author.noindex ? [NOINDEX_META] : []),
        ...(image
          ? [
              { property: "og:image", content: absoluteUrl(image) },
              { name: "twitter:image", content: absoluteUrl(image) },
            ]
          : []),
      ],
      links: [{ rel: "canonical", href: canonical }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(authorProfileJsonLd(author)) },
        breadcrumbJsonLd([
          { name: "Blog", path: "/blog" },
          { name: author.name, path: authorProfilePath(params.slug) },
        ]),
      ],
    };
  },
  notFoundComponent: () => (
    <MarketingLayout>
      <Section title="Author not found" description="That author profile does not exist.">
        <div className="text-center">
          <Button asChild>
            <Link to="/blog">Back to the blog</Link>
          </Button>
        </div>
      </Section>
    </MarketingLayout>
  ),
  errorComponent: () => (
    <MarketingLayout>
      <Section title="Author unavailable" description="Please try again shortly.">
        <div />
      </Section>
    </MarketingLayout>
  ),
  component: AuthorPage,
});

function SocialIcon({ kind }: { kind: "linkedin" | "x" | "email" | "website" }) {
  if (kind === "linkedin") return <Linkedin className="size-4" />;
  if (kind === "x") return <Twitter className="size-4" />;
  if (kind === "email") return <Mail className="size-4" />;
  return <Globe className="size-4" />;
}

function SocialLinks({ author, size = "icon" }: { author: BlogAuthor; size?: "icon" | "sm" }) {
  const links = authorSocialLinks(author);
  if (!links.length) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {links.map((link) => (
        <Button key={link.kind} variant="outline" size={size} asChild>
          <a
            href={link.href}
            aria-label={link.label}
            {...(link.kind === "email" ? {} : { target: "_blank", rel: "noopener noreferrer" })}
          >
            <SocialIcon kind={link.kind} />
            {size === "sm" ? <span className="ml-1.5">{link.label}</span> : null}
          </a>
        </Button>
      ))}
    </div>
  );
}

function AuthorPage() {
  const { author, posts } = Route.useLoaderData();
  const [shown, setShown] = useState(PAGE_SIZE);
  if (!author) return null;

  const visiblePosts = posts.slice(0, shown);
  const hasAbout =
    author.full_bio?.trim() || author.experience?.trim() || author.certifications?.trim() || author.languages?.trim();
  const hasTags = (author.expertise?.length ?? 0) > 0 || (author.topics?.length ?? 0) > 0;
  const hasContact = authorSocialLinks(author).length > 0;

  return (
    <MarketingLayout>
      {/* Hero */}
      <div className="border-b border-border/60 bg-secondary/30">
        {author.cover_image_url ? (
          <div className="h-40 w-full overflow-hidden sm:h-56">
            <img src={author.cover_image_url} alt="" className="size-full object-cover" />
          </div>
        ) : null}
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-12 text-center sm:px-6">
          <span className="flex size-24 items-center justify-center rounded-full border border-border bg-primary/12 text-2xl font-semibold text-primary sm:size-28">
            {author.avatar_url ? (
              <img
                src={author.avatar_url}
                alt={author.name}
                className="size-24 rounded-full object-cover sm:size-28"
              />
            ) : (
              initials(author.name)
            )}
          </span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{author.name}</h1>
            {author.role ? <p className="mt-1 text-sm font-medium text-primary">{author.role}</p> : null}
          </div>
          {author.introduction ? (
            <p className="max-w-xl text-muted-foreground">{author.introduction}</p>
          ) : author.bio ? (
            <p className="max-w-xl text-muted-foreground">{author.bio}</p>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {author.location ? (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" /> {author.location}
              </span>
            ) : null}
            {author.company ? (
              <span className="flex items-center gap-1">
                <Building2 className="size-3.5" /> {author.company}
              </span>
            ) : null}
          </div>
          <SocialLinks author={author} />
        </div>
      </div>

      {/* About */}
      {hasAbout ? (
        <Section title={`About ${author.name}`}>
          <div className="mx-auto max-w-3xl space-y-8">
            {author.full_bio?.trim() ? (
              <div className="text-base leading-relaxed text-foreground/90">
                <HtmlArticleBody html={author.full_bio} />
              </div>
            ) : null}
            {author.featured_quote?.trim() ? (
              <blockquote className="border-l-2 border-primary pl-4 text-lg text-foreground/80 italic">
                “{author.featured_quote.trim()}”
              </blockquote>
            ) : null}
            {author.experience?.trim() ? (
              <div>
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Experience</h3>
                <p className="mt-2 leading-relaxed whitespace-pre-line text-foreground/90">{author.experience}</p>
              </div>
            ) : null}
            {author.certifications?.trim() ? (
              <div>
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  Certifications & credentials
                </h3>
                <p className="mt-2 leading-relaxed whitespace-pre-line text-foreground/90">{author.certifications}</p>
              </div>
            ) : null}
            {author.languages?.trim() ? (
              <div>
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Languages</h3>
                <p className="mt-2 text-foreground/90">{author.languages}</p>
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}

      {/* Expertise & topics */}
      {hasTags ? (
        <Section muted title="Expertise & Topics">
          <div className="mx-auto max-w-3xl space-y-6">
            {author.expertise?.length ? (
              <div>
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  Areas of expertise
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {author.expertise.map((tag) => (
                    <Badge key={tag} variant="secondary" className="px-3 py-1 text-sm">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {author.topics?.length ? (
              <div>
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Writes about</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {author.topics.map((tag) => (
                    <Badge key={tag} variant="outline" className="px-3 py-1 text-sm">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}

      {/* Articles */}
      <Section muted title={`Articles by ${author.name}`}>
        {visiblePosts.length ? (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {visiblePosts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
            {shown < posts.length ? (
              <div className="mt-10 text-center">
                <Button variant="outline" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                  Load more articles
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {author.name} hasn't published any articles yet — check back soon.
          </p>
        )}
      </Section>

      {/* CTA */}
      {hasContact ? (
        <Section>
          <div className="surface-card mx-auto flex max-w-3xl flex-col items-center gap-4 p-8 text-center">
            <h2 className="text-xl font-semibold">Connect with {author.name}</h2>
            <SocialLinks author={author} size="sm" />
          </div>
        </Section>
      ) : null}

      <div className="pb-12 text-center">
        <Button variant="outline" asChild>
          <Link to="/blog">Browse all articles</Link>
        </Button>
      </div>
    </MarketingLayout>
  );
}
