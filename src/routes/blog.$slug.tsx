import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { ArrowRight, ChevronRight, Clock, Linkedin, Link2, Twitter } from "lucide-react";
import { toast } from "sonner";

import {
  ArticleBody,
  HtmlArticleBody,
  TableOfContents,
  parseArticle,
  parseHtmlFaq,
  parseHtmlToc,
} from "@/components/blog/ArticleBody";
import { CoverImage, PostCard } from "@/components/blog/BlogCards";
import { MarketingLayout, Section } from "@/components/site/MarketingPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CONTENT_TYPE_LABELS, formatBlogDate, initials } from "@/lib/blog-model";
import { getBlogPost } from "@/lib/blog.functions";
import { NewsletterCard } from "@/components/blog/NewsletterCard";
import { SITE_URL, absoluteUrl, breadcrumbJsonLd, NOINDEX_META } from "@/lib/seo";

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    const result = await getBlogPost({ data: { slug: params.slug } });
    if (!result.post && result.redirectTo) {
      throw redirect({ to: "/blog/$slug", params: { slug: result.redirectTo }, replace: true });
    }
    if (!result.post) throw notFound();
    return result;
  },
  head: ({ params, loaderData }) => {
    const post = loaderData?.post;
    if (!post) {
      return { meta: [{ title: "Article — MunchReach Blog" }, NOINDEX_META] };
    }
    const title = post.seo_title || `${post.title} — MunchReach Blog`;
    const description = post.meta_description || post.excerpt || post.subtitle;
    const path = `/blog/${params.slug}`;
    const url = absoluteUrl(path);
    const canonical = post.canonical_url ? absoluteUrl(post.canonical_url) : url;
    const image = post.og_image_url || post.cover_image_url;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        ...(post.author ? [{ name: "author", content: post.author.name }] : []),
        ...(image
          ? [
              { property: "og:image", content: absoluteUrl(image) },
              { name: "twitter:image", content: absoluteUrl(image) },
            ]
          : []),
      ],
      links: [{ rel: "canonical", href: canonical }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            mainEntityOfPage: { "@type": "WebPage", "@id": url },
            url,
            headline: post.title,
            description,
            articleSection: post.category?.name,
            keywords: post.tags.join(", "),
            datePublished: post.published_at,
            dateModified: post.updated_at,
            author: post.author ? { "@type": "Person", name: post.author.name } : undefined,
            publisher: { "@type": "Organization", name: "MunchReach", url: SITE_URL },
            ...(image ? { image: absoluteUrl(image) } : {}),
          }),
        },
        breadcrumbJsonLd([
          { name: "Blog", path: "/blog" },
          ...(post.category
            ? [{ name: post.category.name, path: `/blog/category/${post.category.slug}` }]
            : []),
          { name: post.title, path },
        ]),
        ...(faqs.length
          ? [
              {
                type: "application/ld+json",
                children: JSON.stringify({
                  "@context": "https://schema.org",
                  "@type": "FAQPage",
                  mainEntity: faqs.map((faq) => ({
                    "@type": "Question",
                    name: faq.question,
                    acceptedAnswer: { "@type": "Answer", text: faq.answer },
                  })),
                }),
              },
            ]
          : []),
      ],
    };
  },

  notFoundComponent: () => (
    <MarketingLayout>
      <Section title="Article not found" description="That article does not exist or is no longer published.">
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
      <Section title="Article unavailable" description="We could not load this article. Please try again shortly.">
        <div />
      </Section>
    </MarketingLayout>
  ),
  component: ArticlePage,
});

function ArticlePage() {
  const { post, related } = Route.useLoaderData();
  if (!post) return null;
  const isHtml = (post as any).content_format === "html";
  const sections = isHtml ? parseHtmlToc(post.content) : parseArticle(post.content);

  const share = (network: "x" | "linkedin" | "copy") => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (network === "copy") {
      void navigator.clipboard.writeText(url);
      toast.success("Link copied");
      return;
    }
    const target =
      network === "x"
        ? `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(post.title)}`
        : `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    window.open(target, "_blank", "noopener,noreferrer");
  };

  return (
    <MarketingLayout>
      <article>
        <div className="border-b border-border/60 bg-secondary/30 py-10">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <Link to="/blog" className="hover:text-foreground">
                Blog
              </Link>
              {post.category ? (
                <>
                  <ChevronRight className="size-3" />
                  <Link
                    to="/blog/category/$slug"
                    params={{ slug: post.category.slug }}
                    className="hover:text-foreground"
                  >
                    {post.category.name}
                  </Link>
                </>
              ) : null}
              <ChevronRight className="size-3" />
              <span className="text-foreground">{post.title}</span>
            </nav>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {post.category ? (
                <span className="text-xs font-semibold tracking-wide text-primary uppercase">
                  {post.category.name}
                </span>
              ) : null}
              <Badge variant="secondary" className="text-[10px]">
                {CONTENT_TYPE_LABELS[post.content_type]}
              </Badge>
            </div>

            <h1 className="mt-3 text-4xl font-bold tracking-tight text-balance sm:text-5xl">{post.title}</h1>
            {post.subtitle ? <p className="mt-4 text-lg text-muted-foreground">{post.subtitle}</p> : null}

            <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {post.author ? (
                <Link
                  to="/blog/author/$slug"
                  params={{ slug: post.author.slug }}
                  className="flex items-center gap-3 hover:text-foreground"
                >
                  <span className="flex size-10 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">
                    {post.author.avatar_url ? (
                      <img
                        src={post.author.avatar_url}
                        alt={post.author.name}
                        className="size-10 rounded-full object-cover"
                      />
                    ) : (
                      initials(post.author.name)
                    )}
                  </span>
                  <span className="text-left">
                    <span className="block font-medium text-foreground">{post.author.name}</span>
                    <span className="block text-xs">{post.author.role}</span>
                  </span>
                </Link>
              ) : null}
              <span>Published {formatBlogDate(post.published_at)}</span>
              <span>Updated {formatBlogDate(post.updated_at)}</span>
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" />
                {post.reading_minutes} min read
              </span>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <div className="aspect-[16/8] overflow-hidden rounded-2xl border border-border">
                <CoverImage post={post} />
              </div>

              <div className="mt-8 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Share</span>
                <Button variant="outline" size="icon" aria-label="Share on X" onClick={() => share("x")}>
                  <Twitter className="size-4" />
                </Button>
                <Button variant="outline" size="icon" aria-label="Share on LinkedIn" onClick={() => share("linkedin")}>
                  <Linkedin className="size-4" />
                </Button>
                <Button variant="outline" size="icon" aria-label="Copy link" onClick={() => share("copy")}>
                  <Link2 className="size-4" />
                </Button>
              </div>

              <div className="mt-8 lg:hidden">
                <TableOfContents sections={sections} />
              </div>

              <div className="mt-8">
                {isHtml ? <HtmlArticleBody html={post.content} /> : <ArticleBody sections={sections} />}
              </div>

              <div className="surface-card mt-12 flex flex-col items-start gap-4 p-8 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Ready to improve your cold email campaigns?</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Set up your domain, warm your mailboxes and launch a sequence in MunchReach.
                  </p>
                </div>
                <Button asChild size="lg">
                  <Link to="/signup">
                    Start for Free
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>

              {post.tags.length ? (
                <div className="mt-8 flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>

            <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
              <div className="hidden lg:block">
                <TableOfContents sections={sections} />
              </div>
              {related.length ? (
                <div className="surface-card p-5">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Related Articles
                  </p>
                  <ul className="mt-3 space-y-3 text-sm">
                    {related.map((r) => (
                      <li key={r.id}>
                        <Link
                          to="/blog/$slug"
                          params={{ slug: r.slug }}
                          className="font-medium transition-colors hover:text-primary"
                        >
                          {r.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">{r.reading_minutes} min read</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <NewsletterCard source="article" compact />
            </aside>
          </div>
        </div>

        {related.length ? (
          <Section muted title="You May Also Like">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((r) => (
                <PostCard key={r.id} post={r} />
              ))}
            </div>
          </Section>
        ) : null}
      </article>
    </MarketingLayout>
  );
}
