import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, FileText, Mail, Search } from "lucide-react";
import { toast } from "sonner";

import { HorizontalPostCard, PostCard, CoverImage, AuthorLine } from "@/components/blog/BlogCards";
import { CtaBlock, FaqBlock, MarketingLayout, Section, metaFor } from "@/components/site/MarketingPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONTENT_TYPE_LABELS, initials, type BlogPost } from "@/lib/blog-model";
import { getBlogIndex, listBlogPosts, subscribeToNewsletter } from "@/lib/blog.functions";

const faqs = [
  {
    q: "How often do you publish new articles?",
    a: "New long-form guides and articles are published regularly, with shorter tactical notes in between. Subscribe to the newsletter to get them by email.",
  },
  {
    q: "Do these tactics only work with Sendloop?",
    a: "No. Almost everything here is platform-agnostic. Where a Sendloop feature is referenced it is called out, so the underlying tactic still applies elsewhere.",
  },
  {
    q: "Can I contribute a guest article or case study?",
    a: "We occasionally publish practitioner interviews and case studies from agencies and in-house teams. Send a short pitch through the contact page.",
  },
  {
    q: "Are the templates free to use?",
    a: "Yes. Every template published on the blog and in the template library can be copied and adapted for your own outreach.",
  },
];

const PAGE_SIZE = 12;

export const Route = createFileRoute("/blog/")({
  loader: () => getBlogIndex(),
  head: () =>
    metaFor(
      "Sendloop Blog — Cold Email, Deliverability & Outbound Growth",
      "Practical strategies, guides, templates and insights to help you send better cold emails, improve deliverability and generate more conversations.",
      "/blog",
      faqs,
    ),
  errorComponent: () => (
    <MarketingLayout>
      <Section title="Blog unavailable" description="We could not load articles right now. Please try again shortly.">
        <div />
      </Section>
    </MarketingLayout>
  ),
  component: BlogPage,
});

function BlogPage() {
  const data = Route.useLoaderData();
  const search = useServerFn(listBlogPosts);
  const subscribe = useServerFn(subscribeToNewsletter);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [email, setEmail] = useState("");
  const [subscribing, setSubscribing] = useState(false);

  const trimmed = query.trim();

  const searchQuery = useQuery({
    queryKey: ["blog-search", trimmed, category],
    queryFn: () => search({ data: { search: trimmed, category, limit: 24, offset: 0 } }),
    enabled: trimmed.length > 1,
  });

  const filtered = useMemo(() => {
    if (trimmed.length > 1) return (searchQuery.data?.posts ?? []) as BlogPost[];
    if (category === "all") return data.posts;
    return data.posts.filter((p) => p.category?.slug === category);
  }, [trimmed, searchQuery.data, category, data.posts]);

  const shown = trimmed.length > 1 ? filtered : filtered.slice(0, visible);

  const onSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubscribing(true);
    try {
      const res = await subscribe({ data: { email: email.trim(), source: "blog" } });
      if (res.ok) {
        toast.success(res.message);
        setEmail("");
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Could not subscribe right now. Please try again.");
    } finally {
      setSubscribing(false);
    }
  };

  const featured = data.featured;

  return (
    <MarketingLayout>
      {/* Hero + search */}
      <section className="border-b border-border/60 bg-secondary/30 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary uppercase">
            Sendloop Blog
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Cold Email, Deliverability &amp; Outbound Growth
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Practical strategies, guides, templates and insights to help you send better cold emails, improve
            deliverability, and generate more conversations.
          </p>
          <div className="relative mx-auto mt-8 max-w-xl">
            <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search articles..."
              aria-label="Search articles"
              className="h-12 rounded-full pl-11"
            />
          </div>
        </div>
      </section>

      {/* Featured article */}
      {featured && trimmed.length < 2 ? (
        <Section>
          <article className="group grid overflow-hidden rounded-3xl border border-border bg-card lg:grid-cols-2">
            <Link
              to="/blog/$slug"
              params={{ slug: featured.slug }}
              className="aspect-[16/10] overflow-hidden lg:aspect-auto lg:h-full"
            >
              <CoverImage post={featured} />
            </Link>
            <div className="flex flex-col justify-center gap-4 p-8 lg:p-12">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="uppercase">Featured</Badge>
                {featured.category ? (
                  <span className="text-xs font-semibold tracking-wide text-primary uppercase">
                    {featured.category.name}
                  </span>
                ) : null}
                <Badge variant="secondary" className="text-[10px]">
                  {CONTENT_TYPE_LABELS[featured.content_type]}
                </Badge>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                <Link to="/blog/$slug" params={{ slug: featured.slug }} className="hover:text-primary">
                  {featured.title}
                </Link>
              </h2>
              <p className="text-muted-foreground">{featured.excerpt || featured.subtitle}</p>
              <AuthorLine
                author={featured.author}
                date={featured.published_at}
                minutes={featured.reading_minutes}
              />
              <div>
                <Button asChild size="lg" className="mt-2">
                  <Link to="/blog/$slug" params={{ slug: featured.slug }}>
                    Read Article
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </article>
        </Section>
      ) : null}

      {/* Categories + latest articles */}
      <Section muted>
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
            {[{ slug: "all", name: "All" }, ...data.categories].map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => {
                  setCategory(c.slug);
                  setVisible(PAGE_SIZE);
                }}
                className={
                  category === c.slug
                    ? "rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                    : "rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                }
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {trimmed.length > 1 ? `Search results for "${trimmed}"` : "Latest from Sendloop"}
          </h2>

          {shown.length === 0 ? (
            <div className="surface-card mt-8 p-10 text-center">
              <h3 className="text-lg font-semibold">No results found</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Nothing matched that search. Try a broader term such as “deliverability”, “follow-up” or
                “templates”, or clear the search to browse every article.
              </p>
              <Button
                variant="outline"
                className="mt-5"
                onClick={() => {
                  setQuery("");
                  setCategory("all");
                }}
              >
                Clear search
              </Button>
            </div>
          ) : (
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}

          {trimmed.length < 2 && filtered.length > 0 ? (
            <div className="mt-10 flex flex-col items-center gap-3">
              <p className="text-sm text-muted-foreground">
                Showing {shown.length} of {filtered.length} articles
              </p>
              {visible < filtered.length ? (
                <Button variant="outline" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                  Load More
                  <ArrowRight className="size-4" />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </Section>

      {/* Popular guides */}
      {data.guides.length ? (
        <Section title="Popular Guides" description="Long-form playbooks covering an entire topic end to end.">
          <div className="grid gap-5 lg:grid-cols-2">
            {data.guides.map((guide) => (
              <HorizontalPostCard key={guide.id} post={guide} />
            ))}
          </div>
        </Section>
      ) : null}

      {/* Templates */}
      <Section
        muted
        title="Cold Email Templates"
        description="Ready-to-use cold email templates for different industries, offers and outreach situations."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            "Cold Email Templates",
            "Follow-Up Templates",
            "Breakup Email Templates",
            "Agency Outreach Templates",
            "SaaS Outreach Templates",
            "Recruiting Templates",
          ].map((name) => (
            <Link
              key={name}
              to="/cold-email-templates"
              className="group surface-card flex items-center gap-3 p-5 transition-colors hover:border-primary/40"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                <FileText className="size-5" />
              </span>
              <span className="text-sm font-medium">{name}</span>
              <ArrowRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Button asChild size="lg" variant="outline">
            <Link to="/cold-email-templates">
              Browse Templates
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </Section>

      {/* Authors */}
      {data.authors.length ? (
        <Section title="Authors / Contributors" description="The people writing about outbound at Sendloop.">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.authors.map((author) => (
              <Link
                key={author.id}
                to="/blog/author/$slug"
                params={{ slug: author.slug }}
                className="surface-card flex flex-col gap-3 p-6 transition-colors hover:border-primary/40"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
                  {author.avatar_url ? (
                    <img src={author.avatar_url} alt={author.name} className="size-12 rounded-full object-cover" />
                  ) : (
                    initials(author.name)
                  )}
                </span>
                <div>
                  <p className="font-semibold">{author.name}</p>
                  <p className="text-xs text-muted-foreground">{author.role}</p>
                </div>
                <p className="text-sm text-muted-foreground">{author.bio}</p>
                <p className="mt-auto text-xs text-muted-foreground">
                  {author.post_count} {author.post_count === 1 ? "article" : "articles"}
                </p>
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Newsletter */}
      <Section muted>
        <div className="surface-card mx-auto flex max-w-2xl flex-col items-center gap-4 p-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/12 text-primary">
            <Mail className="size-6" />
          </span>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Get Better at Cold Email</h2>
          <p className="max-w-lg text-sm text-muted-foreground">
            Get practical cold email strategies, deliverability tips and proven outreach ideas delivered to your
            inbox.
          </p>
          <form className="mt-2 flex w-full max-w-md flex-col gap-2 sm:flex-row" onSubmit={onSubscribe}>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email address"
              aria-label="Your email address"
              className="h-11"
            />
            <Button type="submit" className="h-11 shrink-0" disabled={subscribing}>
              {subscribing ? "Subscribing…" : "Subscribe"}
              <ArrowRight className="size-4" />
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">No spam. Unsubscribe anytime.</p>
        </div>
      </Section>

      <Section>
        <FaqBlock faqs={faqs} />
      </Section>

      <CtaBlock
        title="Put these tactics to work"
        description="Create a workspace, connect your provider and launch a campaign built on what already works."
        cta="Start for Free"
      />
    </MarketingLayout>
  );
}
