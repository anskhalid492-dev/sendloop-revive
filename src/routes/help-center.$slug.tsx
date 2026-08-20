import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Clock, CalendarDays, ThumbsDown, ThumbsUp } from "lucide-react";

import { MarketingLayout, metaFor } from "@/components/site/MarketingPage";
import { ArticleBody, TableOfContents, parseArticle } from "@/components/blog/ArticleBody";
import { Button } from "@/components/ui/button";
import {
  articleNeighbours,
  categoryName,
  formatUpdated,
  getArticle,
  readingMinutes,
  relatedArticles,
} from "@/lib/help-center-content";

export const Route = createFileRoute("/help-center/$slug")({
  loader: ({ params }) => {
    const article = getArticle(params.slug);
    if (!article) throw notFound();
    return { article };
  },
  head: ({ params, loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Article not found — MunchReach Help Center" }, { name: "robots", content: "noindex" }] };
    }
    const { article } = loaderData;
    return metaFor(
      `${article.title} | MunchReach Help Center`,
      article.description,
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
  const { article } = Route.useLoaderData();
  const sections = parseArticle(article.content);
  const { previous, next } = articleNeighbours(article.slug);
  const related = relatedArticles(article);

  return (
    <MarketingLayout>
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
          <ArticleBody sections={sections} />
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
          <TableOfContents sections={sections} />
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
