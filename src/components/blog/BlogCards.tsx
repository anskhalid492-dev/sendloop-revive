import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  CONTENT_TYPE_LABELS,
  coverGradient,
  formatBlogDate,
  initials,
  type BlogAuthor,
  type BlogPost,
} from "@/lib/blog-model";

export function CoverImage({
  post,
  className = "",
}: {
  post: Pick<BlogPost, "slug" | "title" | "cover_image_url">;
  className?: string;
}) {
  if (post.cover_image_url) {
    return (
      <img
        src={post.cover_image_url}
        alt={post.title}
        loading="lazy"
        className={`size-full object-cover transition-transform duration-500 group-hover:scale-105 ${className}`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`size-full transition-transform duration-500 group-hover:scale-105 ${className}`}
      style={{ backgroundImage: coverGradient(post.slug) }}
    >
      <div className="flex size-full items-center justify-center bg-black/10 p-6 text-center">
        <span className="text-balance text-sm font-semibold text-white/90 sm:text-base">{post.title}</span>
      </div>
    </div>
  );
}

export function AuthorLine({
  author,
  date,
  minutes,
}: {
  author: BlogAuthor | null;
  date: string | null;
  minutes: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {author ? (
        <span className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary/12 text-[10px] font-semibold text-primary">
            {author.avatar_url ? (
              <img src={author.avatar_url} alt={author.name} className="size-7 rounded-full object-cover" />
            ) : (
              initials(author.name)
            )}
          </span>
          <span className="font-medium text-foreground">{author.name}</span>
        </span>
      ) : null}
      {date ? <span>{formatBlogDate(date)}</span> : null}
      <span className="flex items-center gap-1">
        <Clock className="size-3" />
        {minutes} min read
      </span>
    </div>
  );
}

export function PostCard({ post }: { post: BlogPost }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">
      <Link to="/blog/$slug" params={{ slug: post.slug }} className="block aspect-[16/9] overflow-hidden">
        <CoverImage post={post} />
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {post.category ? (
            <span className="text-xs font-semibold tracking-wide text-primary uppercase">{post.category.name}</span>
          ) : null}
          <Badge variant="secondary" className="text-[10px]">
            {CONTENT_TYPE_LABELS[post.content_type]}
          </Badge>
        </div>
        <h3 className="text-lg leading-snug font-semibold tracking-tight">
          <Link to="/blog/$slug" params={{ slug: post.slug }} className="hover:text-primary">
            {post.title}
          </Link>
        </h3>
        <p className="line-clamp-3 text-sm text-muted-foreground">{post.excerpt || post.subtitle}</p>
        <div className="mt-auto space-y-3 pt-2">
          <AuthorLine author={post.author} date={post.published_at} minutes={post.reading_minutes} />
          <Link
            to="/blog/$slug"
            params={{ slug: post.slug }}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary"
          >
            Read Article
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </article>
  );
}

export function HorizontalPostCard({ post }: { post: BlogPost }) {
  return (
    <article className="group grid gap-4 overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md sm:grid-cols-[220px_1fr]">
      <Link
        to="/blog/$slug"
        params={{ slug: post.slug }}
        className="aspect-[16/9] overflow-hidden sm:aspect-auto sm:h-full"
      >
        <CoverImage post={post} />
      </Link>
      <div className="flex flex-col gap-2 p-5 sm:pl-0">
        <span className="text-xs font-semibold tracking-wide text-primary uppercase">
          {post.category?.name ?? CONTENT_TYPE_LABELS[post.content_type]}
        </span>
        <h3 className="text-lg font-semibold tracking-tight">
          <Link to="/blog/$slug" params={{ slug: post.slug }} className="hover:text-primary">
            {post.title}
          </Link>
        </h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">{post.excerpt || post.subtitle}</p>
        <div className="mt-auto pt-2">
          <AuthorLine author={post.author} date={post.published_at} minutes={post.reading_minutes} />
        </div>
      </div>
    </article>
  );
}
