import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Clock,
  FileText,
  Flame,
  LifeBuoy,
  Mailbox,
  MessageCircle,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import { MarketingLayout, Section, metaFor } from "@/components/site/MarketingPage";
import { Button } from "@/components/ui/button";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listPublicHelpArticles } from "@/lib/help-center-cms.functions";
import {
  HELP_CATEGORIES,
  categoryName,
  formatUpdated,
  readingMinutes,
  searchArticles,
  type HelpArticle,
} from "@/lib/help-center-content";

const articlesQuery = queryOptions({ queryKey: ["public-help-articles"], queryFn: () => listPublicHelpArticles(), staleTime: 0 });

export const Route = createFileRoute("/help-center/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(articlesQuery),
  head: () =>
    metaFor(
      "MunchReach Help Center — Guides & Answers",
      "Guides for campaigns, leads, mailboxes, AI personalization, Claude, warmup, the inbox, analytics, API, billing and troubleshooting.",
      "/help-center",
    ),
  component: HelpCenter,
});

function ArticleCard({ article }: { article: HelpArticle }) {
  return (
    <Link
      to="/help-center/$slug"
      params={{ slug: article.slug }}
      className="surface-card group flex h-full flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-primary/50"
    >
      <span className="text-xs font-semibold tracking-wide text-primary uppercase">
        {categoryName(article.category)}
      </span>
      <h3 className="mt-2 text-base font-semibold transition-colors group-hover:text-primary">
        {article.title}
      </h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
        {article.description}
      </p>
      <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" />
          {readingMinutes(article.content)} min read
        </span>
        <span aria-hidden="true">·</span>
        <span>Updated {formatUpdated(article.updated)}</span>
      </div>
    </Link>
  );
}

const relatedResources = [
  { to: "/cold-email-templates" as const, label: "Cold Email Templates", text: "A full sequence you can copy: opener, bump, proof and breakup.", icon: FileText },
  { to: "/deliverability-guide" as const, label: "Deliverability Guide", text: "Mailbox health, warmup, list quality and volume pacing.", icon: ShieldCheck },
  { to: "/product/campaigns" as const, label: "Campaigns", text: "Sequences, schedules, stop rules and launch readiness.", icon: Send },
  { to: "/product/warmup" as const, label: "Warmup", text: "How MunchReach ramps a mailbox before campaign traffic.", icon: Flame },
  { to: "/product/email-accounts" as const, label: "Email Accounts", text: "Connect mailboxes and monitor sending health.", icon: Mailbox },
  { to: "/docs" as const, label: "Documentation", text: "Reference documentation for how MunchReach works.", icon: Sparkles },
];

function HelpCenter() {
  const { data: HELP_ARTICLES } = useSuspenseQuery(articlesQuery);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const searching = query.trim().length > 0 || category !== "all";
  const results = useMemo(() => searchArticles(query, category, HELP_ARTICLES), [query, category, HELP_ARTICLES]);

  const popular = HELP_ARTICLES.filter((a) => a.popular);
  const gettingStarted = HELP_ARTICLES.filter((a) => a.gettingStarted);
  const recent = [...HELP_ARTICLES].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 6);

  function clearSearch() {
    setQuery("");
    setCategory("all");
  }

  return (
    <MarketingLayout>
      <section className="hero-glow relative overflow-hidden border-b border-border/60">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium tracking-wide text-primary uppercase">
            <LifeBuoy className="size-3.5" /> Help Center
          </span>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
            How can we <span className="text-gradient">help?</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            {HELP_ARTICLES.length} articles across {HELP_CATEGORIES.length} topics — campaigns,
            leads, mailboxes, AI personalization, deliverability, the API and billing.
          </p>

          <div className="relative mt-8">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search MunchReach help articles..."
              aria-label="Search MunchReach help articles"
              className="h-14 w-full rounded-xl border border-border bg-card pr-12 pl-12 text-sm outline-none transition-colors focus:border-primary"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
            <span>Try:</span>
            {["warmup", "CSV import", "Claude", "spam", "API key", "invoice"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setQuery(s)}
                className="rounded-full border border-border bg-card px-2.5 py-1 transition-colors hover:border-primary/50 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </section>

      <Section muted>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory("all")}
            className={
              category === "all"
                ? "rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
                : "rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            }
          >
            All topics
          </button>
          {HELP_CATEGORIES.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => setCategory(c.slug)}
              className={
                category === c.slug
                  ? "rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
                  : "rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              }
            >
              {c.name}
            </button>
          ))}
        </div>

        {searching ? (
          <div className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {results.length} {results.length === 1 ? "article" : "articles"}
                {query.trim() ? ` for “${query.trim()}”` : ""}
                {category !== "all" ? ` in ${categoryName(category)}` : ""}
              </p>
              <Button size="sm" variant="ghost" onClick={clearSearch} className="gap-2">
                <X className="size-4" /> Clear search
              </Button>
            </div>

            {results.length ? (
              <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {results.map((a) => (
                  <ArticleCard key={a.slug} article={a} />
                ))}
              </div>
            ) : (
              <div className="surface-card mt-6 flex flex-col items-center gap-3 p-12 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-primary/12 text-primary">
                  <Search className="size-6" />
                </span>
                <h2 className="text-xl font-semibold">No articles found</h2>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Nothing matched that search. Clear it to browse every article, or contact support
                  and a human will answer within one business day.
                </p>
                <div className="mt-2 flex flex-wrap justify-center gap-3">
                  <Button onClick={clearSearch}>Clear search</Button>
                  <Button variant="outline" asChild>
                    <Link to="/contact">Contact support</Link>
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {HELP_CATEGORIES.map((c) => {
              const count = HELP_ARTICLES.filter((a) => a.category === c.slug).length;
              return (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => setCategory(c.slug)}
                  className="surface-card group p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-semibold transition-colors group-hover:text-primary">
                      {c.name}
                    </h2>
                    <span className="rounded-full bg-primary/12 px-2 py-0.5 text-xs font-medium text-primary">
                      {count}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{c.description}</p>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      {!searching ? (
        <>
          <Section title="Popular articles" description="The questions our support team gets most.">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {popular.map((a) => (
                <ArticleCard key={a.slug} article={a} />
              ))}
            </div>
          </Section>

          <Section title="Getting started" description="New to MunchReach? Start here." muted>
            <div className="grid gap-4 md:grid-cols-3">
              {gettingStarted.map((a) => (
                <ArticleCard key={a.slug} article={a} />
              ))}
            </div>
          </Section>

          <Section title="Recently updated">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {recent.map((a) => (
                <ArticleCard key={a.slug} article={a} />
              ))}
            </div>
          </Section>

          <Section title="Browse all articles" muted>
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {HELP_ARTICLES.map((a) => (
                <Link
                  key={a.slug}
                  to="/help-center/$slug"
                  params={{ slug: a.slug }}
                  className="flex flex-col gap-1 border-b border-border/70 px-5 py-4 transition-colors last:border-b-0 hover:bg-secondary/50 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    <span className="rounded-full bg-secondary px-2.5 py-0.5">
                      {categoryName(a.category)}
                    </span>
                    <span>{readingMinutes(a.content)} min</span>
                    <ArrowRight className="size-4" />
                  </div>
                </Link>
              ))}
            </div>
          </Section>
        </>
      ) : null}

      <Section title="Related resources">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {relatedResources.map((r) => (
            <Link
              key={r.to}
              to={r.to}
              className="surface-card group flex h-full flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-primary/50"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <r.icon className="size-5" />
              </span>
              <h3 className="mt-4 font-semibold transition-colors group-hover:text-primary">
                {r.label}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{r.text}</p>
            </Link>
          ))}
        </div>
      </Section>

      <Section muted>
        <div className="surface-card mx-auto flex max-w-3xl flex-col items-center gap-3 p-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/12 text-primary">
            <MessageCircle className="size-6" />
          </span>
          <h2 className="text-2xl font-bold tracking-tight">Can't find what you need?</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Our support team is made up of people who run cold email themselves — not a scripted
            ticket queue. Reach out and get a real answer within one business day.
          </p>
          <Button asChild className="mt-2">
            <Link to="/contact">Contact support</Link>
          </Button>
        </div>
      </Section>
    </MarketingLayout>
  );
}
