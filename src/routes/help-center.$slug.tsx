import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Clock, CalendarDays, ThumbsDown, ThumbsUp } from "lucide-react";

import { MarketingLayout, metaFor } from "@/components/site/MarketingPage";
import {
  HelpArticleBody,
  HelpTableOfContents,
  QuickAnswer,
  TldrBox,
  parseHelpArticle,
} from "@/components/help/HelpArticleBody";
import { Button } from "@/components/ui/button";
import {
  articleNeighbours,
  categoryName,
  formatUpdated,
  readingMinutes,
  relatedArticles,
} from "@/lib/help-center-content";
import { listPublicHelpArticles } from "@/lib/help-center-cms.functions";

export const Route = createFileRoute("/help-center/$slug")({
  loader: async ({ params }) => {
    const articles = await listPublicHelpArticles();
    const article = articles.find((a) => a.slug === params.slug);
    if (!article) throw notFound();
    return { article, articles };
  },
  head: ({ params, loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Article not found — MunchReach Help Center" }, { name: "robots", content: "noindex" }] };
    }
    const { article } = loaderData;
    return metaFor(
      article.seoTitle ?? `${article.title} — MunchReach Help`,
      article.metaDescription ?? article.description.slice(0, 150),
      `/help-center/${params.slug}`,
    );
  },
  notFoundComponent: ArticleNotFound,
  component: ArticlePage,
});

function ArticleNotFound() {
  return (
    <MarketingLayout>
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">Article not found</h1>
        <p className="mt-3 text-muted-foreground">
          That help article does not exist or has been renamed.
        </p>
        <Button asChild className="mt-6">
          <Link to="/help-center">Back to the Help Center</Link>
        </Button>
      </div>
    </MarketingLayout>
  );
}

function Helpful({ slug }: { slug: string }) {
  const [vote, setVote] = useState<"yes" | "no" | null>(null);

  function record(value: "yes" | "no") {
    setVote(value);
    try {
      window.localStorage.setItem(`sendloop:help-feedback:${slug}`, value);
    } catch {
      // Storage can be unavailable (private mode); the vote still shows in the UI.
    }
  }

  return (
    <div className="surface-card mt-12 flex flex-col items-center gap-3 p-6 text-center">
      <p className="text-sm font-semibold">Was this article helpful?</p>
      {vote ? (
        <p className="text-sm text-muted-foreground">
          {vote === "yes"
            ? "Thanks — glad it helped."
            : "Thanks for the signal. "}
          {vote === "no" ? (
            <Link to="/contact" className="text-primary underline-offset-4 hover:underline">
              Tell support what was missing
            </Link>
          ) : null}
        </p>
      ) : (
        <div className="flex gap-3">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => record("yes")}>
            <ThumbsUp className="size-4" /> Yes
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => record("no")}>
            <ThumbsDown className="size-4" /> No
          </Button>
        </div>
      )}
    </div>
  );
}

function ArticlePage() {
  const { article, articles } = Route.useLoaderData();
  const sections = parseHelpArticle(article.content);
  const { previous, next } = articleNeighbours(article.slug, articles);
  const related = relatedArticles(article, 4, articles);
  const faqs = article.faqs ?? [];

  const jsonLd: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: article.title,
      description: article.metaDescription ?? article.description,
      dateModified: article.updated,
      inLanguage: "en",
      mainEntityOfPage: `https://munchreach.com/help-center/${article.slug}`,
      publisher: { "@type": "Organization", name: "MunchReach" },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Help Center", item: "/help-center" },
        { "@type": "ListItem", position: 2, name: categoryName(article.category) },
        { "@type": "ListItem", position: 3, name: article.title, item: `/help-center/${article.slug}` },
      ],
    },
  ];
  if (faqs.length > 0) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.q,
        acceptedAnswer: { "@type": "Answer", text: faq.a },
      })),
    });
  }

  return (
    <MarketingLayout>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <div className="border-b border-border/60 bg-secondary/30">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Link to="/help-center" className="transition-colors hover:text-foreground">
              Help Center
            </Link>
            <span aria-hidden="true">/</span>
            <span className="text-primary">{categoryName(article.category)}</span>
            <span aria-hidden="true">/</span>
            <span className="text-foreground">{article.title}</span>
          </nav>
          <h1 className="mt-5 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl">
            {article.title}
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">{article.description}</p>
          <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" /> Updated {formatUpdated(article.updated)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" /> {readingMinutes(article.content)} min read
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <article className="max-w-[68ch]">
          {article.tldr?.length ? <TldrBox points={article.tldr} /> : null}
          {article.quickAnswer ? <QuickAnswer text={article.quickAnswer} /> : null}
          <div className={article.tldr?.length || article.quickAnswer ? "mt-8" : ""}>
            <HelpArticleBody sections={sections} />
          </div>
          <Helpful slug={article.slug} />

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {previous ? (
              <Link
                to="/help-center/$slug"
                params={{ slug: previous.slug }}
                className="surface-card group p-5 transition-colors hover:border-primary/50"
              >
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ArrowLeft className="size-3.5" /> Previous
                </span>
                <p className="mt-2 text-sm font-medium transition-colors group-hover:text-primary">
                  {previous.title}
                </p>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                to="/help-center/$slug"
                params={{ slug: next.slug }}
                className="surface-card group p-5 text-right transition-colors hover:border-primary/50"
              >
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  Next <ArrowRight className="size-3.5" />
                </span>
                <p className="mt-2 text-sm font-medium transition-colors group-hover:text-primary">
                  {next.title}
                </p>
              </Link>
            ) : null}
          </div>

          {faqs.length > 0 ? (
            <section className="mt-12">
              <h2 className="text-lg font-semibold">Frequently asked questions</h2>
              <dl className="mt-4 space-y-4">
                {faqs.map((faq) => (
                  <div key={faq.q} className="surface-card p-5">
                    <dt className="text-sm font-semibold">{faq.q}</dt>
                    <dd className="mt-2 text-sm text-muted-foreground">{faq.a}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <section className="mt-12">
            <h2 className="text-lg font-semibold">Related articles</h2>
            <div className="mt-4 grid gap-3">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  to="/help-center/$slug"
                  params={{ slug: r.slug }}
                  className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{r.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {categoryName(r.category)}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </section>
        </article>

        <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          <HelpTableOfContents
            sections={sections}
            extra={article.quickAnswer ? [{ id: "quick-answer", text: "Quick answer" }] : []}
          />
          <div className="surface-card p-5">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Keep reading
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link to="/deliverability-guide" className="text-muted-foreground transition-colors hover:text-primary">
                  Deliverability guide
                </Link>
              </li>
              <li>
                <Link to="/cold-email-templates" className="text-muted-foreground transition-colors hover:text-primary">
                  Cold email templates
                </Link>
              </li>
              <li>
                <Link to="/docs" className="text-muted-foreground transition-colors hover:text-primary">
                  Documentation
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-muted-foreground transition-colors hover:text-primary">
                  Contact support
                </Link>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </MarketingLayout>
  );
}
