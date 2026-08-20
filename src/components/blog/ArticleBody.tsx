/** Minimal renderer for the markdown-lite article format (## headings + paragraphs). */

export type ArticleSection = { id: string; heading: string; paragraphs: string[] };

export function parseArticle(content: string): ArticleSection[] {
  const sections: ArticleSection[] = [];
  let current: ArticleSection | null = null;
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("## ")) {
      const heading = line.slice(3).trim();
      current = { id: slugify(heading), heading, paragraphs: [] };
      sections.push(current);
    } else if (current) {
      current.paragraphs.push(line);
    } else {
      current = { id: "intro", heading: "", paragraphs: [line] };
      sections.push(current);
    }
  }
  return sections;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function ArticleBody({ sections }: { sections: ArticleSection[] }) {
  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-28">
          {section.heading ? (
            <h2 className="text-2xl font-bold tracking-tight">{section.heading}</h2>
          ) : null}
          {section.paragraphs.map((p, i) => (
            <p key={i} className="mt-3 leading-relaxed text-muted-foreground">
              {p}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}

export function TableOfContents({ sections }: { sections: ArticleSection[] }) {
  const withHeadings = sections.filter((s) => s.heading);
  if (!withHeadings.length) return null;
  return (
    <nav aria-label="Table of contents" className="surface-card p-5">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Table of Contents</p>
      <ol className="mt-3 space-y-2 text-sm">
        {withHeadings.map((s, i) => (
          <li key={s.id}>
            <a href={`#${s.id}`} className="text-muted-foreground transition-colors hover:text-primary">
              {i + 1}. {s.heading}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Table of contents entries extracted from an HTML body's h2/h3 tags. */
export function parseHtmlToc(html: string): ArticleSection[] {
  const sections: ArticleSection[] = [];
  const re = /<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const attrs = match[1] ?? "";
    const heading = (match[2] ?? "").replace(/<[^>]+>/g, "").trim();
    if (!heading) continue;
    const idAttr = /id="([^"]+)"/i.exec(attrs);
    sections.push({ id: idAttr?.[1] ?? slugify(heading), heading, paragraphs: [] });
  }
  return sections;
}

/**
 * Renders rich-text posts authored in the admin CMS. Content is written by
 * platform admins only, so it is rendered as-is with editor styling.
 */
export function HtmlArticleBody({ html }: { html: string }) {
  return (
    <div
      className="prose prose-neutral dark:prose-invert max-w-none prose-headings:scroll-mt-28 prose-a:text-primary"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
