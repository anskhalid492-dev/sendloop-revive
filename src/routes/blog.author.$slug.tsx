import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { PostCard } from "@/components/blog/BlogCards";
import { MarketingLayout, Section } from "@/components/site/MarketingPage";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/blog-model";
import { getBlogAuthor } from "@/lib/blog.functions";
import { absoluteUrl } from "@/lib/seo";

export const Route = createFileRoute("/blog/author/$slug")({
  loader: async ({ params }) => {
    const result = await getBlogAuthor({ data: { slug: params.slug } });
    if (!result.author) throw notFound();
    return result;
  },
  head: ({ params, loaderData }) => {
    const author = loaderData?.author;
    const title = `${author?.name ?? "Author"} — MunchReach Blog`;
    const description = author?.bio || `Articles written by ${author?.name ?? "our team"} on the MunchReach blog.`;
    const path = `/blog/author/${params.slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "profile" },
        { property: "og:url", content: absoluteUrl(path) },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: absoluteUrl(path) }],
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

function AuthorPage() {
  const { author, posts } = Route.useLoaderData();
  if (!author) return null;

  return (
    <MarketingLayout>
      <Section>
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          <span className="flex size-20 items-center justify-center rounded-full bg-primary/12 text-lg font-semibold text-primary">
            {author.avatar_url ? (
              <img src={author.avatar_url} alt={author.name} className="size-20 rounded-full object-cover" />
            ) : (
              initials(author.name)
            )}
          </span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{author.name}</h1>
            <p className="text-sm text-muted-foreground">{author.role}</p>
          </div>
          {author.bio ? <p className="text-muted-foreground">{author.bio}</p> : null}
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
        {posts.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted-foreground">No published articles yet.</p>
        ) : null}

        <div className="mt-10 text-center">
          <Button variant="outline" asChild>
            <Link to="/blog">Browse all articles</Link>
          </Button>
        </div>
      </Section>
    </MarketingLayout>
  );
}
