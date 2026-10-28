/**
 * Renderer for Help Center articles.
 *
 * The article format is markdown-lite, authored in src/lib/help-center/articles:
 *   "## Heading", "### Sub-heading", "- bullet", "1. step",
 *   "![alt text](/image.png)", inline **bold**, `code`, [links](/path).
 *
 * Answer engines (AI Overviews, ChatGPT, Perplexity) extract from real
 * semantic HTML, so headings keep a strict h2 → h3 hierarchy, lists stay
 * lists, and every image carries descriptive alt text.
 */
import { Link } from "@tanstack/react-router";
import { Camera } from "lucide-react";
import type { ReactNode } from "react";
import { safeHelpUrl } from "@/lib/help-center-cms";

export type HelpBlock =
  | { kind: "h3"; id: string; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "image"; src: string; alt: string; placeholder: boolean };

export type HelpSection = {
  id: string;
  heading: string;
  blocks: HelpBlock[];
  /** Sub-headings, for a nested table of contents. */
  subheadings: { id: string; text: string }[];
};

export function slugifyHeading(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const IMAGE_RE = /^!\[([^\]]*)\]\(([^)]+)\)$/;

export function parseHelpArticle(content: string): HelpSection[] {
  const sections: HelpSection[] = [];
  let current: HelpSection = { id: "intro", heading: "", blocks: [], subheadings: [] };
  sections.push(current);

  let list: { kind: "ul" | "ol"; items: string[] } | null = null;

  const flushList = () => {
    if (list) {
      current.blocks.push({ kind: list.kind, items: list.items });
      list = null;
    }
  };

  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }

    if (line.startsWith("## ")) {
      flushList();
      const heading = line.slice(3).trim();
      current = { id: slugifyHeading(heading), heading, blocks: [], subheadings: [] };
      sections.push(current);
      continue;
    }

    if (line.startsWith("### ")) {
      flushList();
      const text = line.slice(4).trim();
      const id = slugifyHeading(text);
      current.blocks.push({ kind: "h3", id, text });
      current.subheadings.push({ id, text });
      continue;
    }

    const image = IMAGE_RE.exec(line);
    if (image) {
      flushList();
      const src = (image[2] ?? "").trim();
      current.blocks.push({
        kind: "image",
        alt: (image[1] ?? "").trim(),
        src,
        placeholder: src.startsWith("placeholder:"),
      });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const item = line.replace(/^[-*]\s+/, "");
      if (list?.kind === "ul") list.items.push(item);
      else {
        flushList();
        list = { kind: "ul", items: [item] };
      }
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const item = line.replace(/^\d+[.)]\s+/, "");
      if (list?.kind === "ol") list.items.push(item);
      else {
        flushList();
        list = { kind: "ol", items: [item] };
      }
      continue;
    }

    flushList();
    current.blocks.push({ kind: "p", text: line });
  }
  flushList();

  return sections.filter((s) => s.heading || s.blocks.length > 0);
}

/** Inline markdown: **bold**, `code`, [text](/path). */
export function inline(text: string, keyPrefix = ""): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = re.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const key = `${keyPrefix}-${index}`;
    index += 1;

    if (match[1]) {
      nodes.push(
        <strong key={key} className="font-semibold text-foreground">
          {match[1]}
        </strong>,
      );
    } else if (match[2]) {
      nodes.push(
        <code key={key} className="rounded bg-secondary px-1.5 py-0.5 text-[0.85em]">
          {match[2]}
        </code>,
      );
    } else if (match[3] && match[4]) {
      const href = match[4];
      if (!safeHelpUrl(href)) {
        nodes.push(match[3]);
        cursor = match.index + match[0].length;
        continue;
      }
      nodes.push(
        href.startsWith("/") ? (
          <Link key={key} to={href} className="text-primary underline-offset-4 hover:underline">
            {match[3]}
          </Link>
        ) : (
          <a
            key={key}
            href={href}
            rel="noopener noreferrer"
            target="_blank"
            className="text-primary underline-offset-4 hover:underline"
          >
            {match[3]}
          </a>
        ),
      );
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function Figure({ block }: { block: Extract<HelpBlock, { kind: "image" }> }) {
  if (block.placeholder) {
    const label = block.src.replace(/^placeholder:/, "").trim();
    return (
      <figure className="my-6">
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-secondary/40 px-6 py-10 text-center">
          <Camera className="size-5 text-primary" aria-hidden="true" />
          <p className="text-sm font-semibold">Screenshot placeholder</p>
          <p className="max-w-md text-xs text-muted-foreground">{label}</p>
        </div>
        <figcaption className="mt-2 text-xs text-muted-foreground">{block.alt}</figcaption>
      </figure>
    );
  }
  if (!safeHelpUrl(block.src)) return null;
  return (
    <figure className="my-6">
      <img
        src={block.src}
        alt={block.alt}
        loading="lazy"
        className="w-full rounded-xl border border-border bg-card"
      />
      <figcaption className="mt-2 text-xs text-muted-foreground">{block.alt}</figcaption>
    </figure>
  );
}

function Blocks({ blocks, sectionId }: { blocks: HelpBlock[]; sectionId: string }) {
  return (
    <>
      {blocks.map((block, i) => {
        const key = `${sectionId}-${i}`;
        if (block.kind === "h3") {
          return (
            <h3 key={key} id={block.id} className="mt-6 scroll-mt-28 text-lg font-semibold tracking-tight">
              {block.text}
            </h3>
          );
        }
        if (block.kind === "p") {
          return (
            <p key={key} className="mt-3 leading-relaxed text-muted-foreground">
              {inline(block.text, key)}
            </p>
          );
        }
        if (block.kind === "image") return <Figure key={key} block={block} />;

        const items = block.items.map((item, j) => (
          <li key={`${key}-${j}`} className="leading-relaxed">
            {inline(item, `${key}-${j}`)}
          </li>
        ));
        return block.kind === "ul" ? (
          <ul key={key} className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
            {items}
          </ul>
        ) : (
          <ol key={key} className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
            {items}
          </ol>
        );
      })}
    </>
  );
}

/** The summary box answer engines lift verbatim. */
export function TldrBox({ points }: { points: string[] }) {
  if (!points.length) return null;
  return (
    <aside
      aria-label="Summary"
      className="rounded-xl border border-primary/30 bg-primary/5 p-5 sm:p-6"
    >
      <p className="text-xs font-semibold tracking-wide text-primary uppercase">TL;DR</p>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
        {points.map((point, i) => (
          <li key={i}>{inline(point, `tldr-${i}`)}</li>
        ))}
      </ul>
    </aside>
  );
}

export function QuickAnswer({ text }: { text: string }) {
  if (!text) return null;
  return (
    <section className="mt-8" aria-label="Quick answer">
      <h2 id="quick-answer" className="scroll-mt-28 text-2xl font-bold tracking-tight">
        Quick answer
      </h2>
      <p className="mt-3 leading-relaxed">{inline(text, "quick-answer")}</p>
    </section>
  );
}

export function HelpArticleBody({ sections }: { sections: HelpSection[] }) {
  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-28">
          {section.heading ? (
            <h2 className="text-2xl font-bold tracking-tight">{section.heading}</h2>
          ) : null}
          <Blocks blocks={section.blocks} sectionId={section.id} />
        </section>
      ))}
    </div>
  );
}

export function HelpTableOfContents({
  sections,
  extra = [],
}: {
  sections: HelpSection[];
  extra?: { id: string; text: string }[];
}) {
  const withHeadings = sections.filter((s) => s.heading);
  if (!withHeadings.length && !extra.length) return null;
  return (
    <nav aria-label="Table of contents" className="surface-card p-5">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        On this page
      </p>
      <ol className="mt-3 space-y-2 text-sm">
        {extra.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`} className="text-muted-foreground transition-colors hover:text-primary">
              {item.text}
            </a>
          </li>
        ))}
        {withHeadings.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} className="text-muted-foreground transition-colors hover:text-primary">
              {s.heading}
            </a>
            {s.subheadings.length > 0 ? (
              <ul className="mt-1.5 space-y-1.5 pl-4 text-xs">
                {s.subheadings.map((sub) => (
                  <li key={sub.id}>
                    <a
                      href={`#${sub.id}`}
                      className="text-muted-foreground transition-colors hover:text-primary"
                    >
                      {sub.text}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}
