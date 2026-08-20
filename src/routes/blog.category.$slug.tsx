import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { PostCard } from "@/components/blog/BlogCards";
import { MarketingLayout, Section } from "@/components/site/MarketingPage";
import { Button } from "@/components/ui/button";
import { getBlogCategory } from "@/lib/blog.functions";

export const Route = createFileRoute("/blog/category/$slug")({
  loader: async ({ params }) => {
    const result = await getBlogCategory({ data: { slug: params.slug } });
    if (!result.category) throw notFound();
    return result;
  },
  head: ({ params, loaderData }) => {
    const name = loaderData?.category?.name ?? "Category";
    const title = `${name} Articles — MunchReach Blog`;
    const description =
      loaderData?.category?.description || `Articles, guides and templates about ${name.toLowerCase()}.`;
    const path = `/blog/category/${params.slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: path },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: path }],
    };
  },
  notFoundComponent: () => (
    <MarketingLayout>
      <Section title="Category not found" description="That category does not exist.">
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
      <Section title="Category unavailable" description="Please try again shortly.">
        <div />
      </Section>
    </MarketingLayout>
  ),
  component: CategoryPage,
});

function CategoryPage() {
  const { category, posts } = Route.useLoaderData();
  return (
    <MarketingLayout>
      <Section title={category?.name ?? "Category"} {...(category?.description ? { description: category.description } : {})}>
        {posts.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">No published articles in this category yet.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
        <div className="mt-10 text-center">
          <Button variant="outline" asChild>
            <Link to="/blog">Browse all articles</Link>
          </Button>
        </div>
      </Section>
    </MarketingLayout>
  );
}
