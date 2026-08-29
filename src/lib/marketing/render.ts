/**
 * Marketing email rendering.
 *
 * Templates are authored in a small, safe block syntax rather than raw HTML:
 * every value that reaches the output is escaped, so subscriber data and
 * admin-authored copy can never inject markup or script into a sent email.
 *
 * Every marketing email — without exception — gets a footer carrying the
 * unsubscribe link. `renderMarketingEmail` is the only renderer the send
 * engine uses, which is what makes that guarantee structural.
 */

export type RenderVariables = Record<string, string | null | undefined>;

export type RenderInput = {
  subject: string;
  previewText?: string;
  body: string;
  variables?: RenderVariables;
  unsubscribeUrl: string;
  preferencesUrl?: string;
  footerAddress?: string;
  brandName?: string;
};

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s) links survive; anything else collapses to '#'. */
export function safeUrl(value: string): string {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : "#";
}

const VARIABLE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

/** Substitutes `{{variable}}` placeholders; unknown variables render empty. */
export function applyVariables(input: string, variables: RenderVariables = {}): string {
  return input.replace(VARIABLE, (_match, name: string) => {
    const value = variables[name.toLowerCase()];
    return value === null || value === undefined ? "" : String(value);
  });
}

/** Variable names referenced by a template — powers the editor's variable hints. */
export function extractVariables(input: string): string[] {
  const found = new Set<string>();
  for (const match of input.matchAll(VARIABLE)) found.add(match[1]!.toLowerCase());
  return [...found].sort();
}

type Block =
  | { type: "h1" | "h2" | "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "button"; label: string; url: string }
  | { type: "divider" };

export function parseBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "p", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push({ type: "list", items: [...list] });
      list = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    if (line.startsWith("::button ")) {
      flushParagraph();
      flushList();
      const [label, url] = line.slice("::button ".length).split("|");
      blocks.push({ type: "button", label: (label ?? "Open").trim(), url: (url ?? "").trim() });
      continue;
    }
    if (line === "---") {
      flushParagraph();
      flushList();
      blocks.push({ type: "divider" });
      continue;
    }
    if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "h2", text: line.slice(3).trim() });
      continue;
    }
    if (line.startsWith("# ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "h1", text: line.slice(2).trim() });
      continue;
    }
    if (line.startsWith("- ")) {
      flushParagraph();
      list.push(line.slice(2).trim());
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

const STYLES = {
  body: "margin:0;padding:0;background-color:#f5f6f8;",
  wrap: "width:100%;background-color:#f5f6f8;padding:32px 12px;",
  card:
    "max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:14px;padding:32px;" +
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c2333;",
  h1: "margin:0 0 16px;font-size:24px;line-height:1.3;font-weight:700;color:#111827;",
  h2: "margin:24px 0 10px;font-size:18px;line-height:1.4;font-weight:600;color:#111827;",
  p: "margin:0 0 16px;font-size:15px;line-height:1.65;color:#374151;",
  li: "margin:0 0 8px;font-size:15px;line-height:1.6;color:#374151;",
  button:
    "display:inline-block;padding:12px 22px;border-radius:10px;background-color:#111827;" +
    "color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;",
  divider: "border:0;border-top:1px solid #e5e7eb;margin:24px 0;",
  footer:
    "max-width:600px;margin:16px auto 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI'," +
    "Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#6b7280;text-align:center;",
  footerLink: "color:#6b7280;text-decoration:underline;",
  preheader: "display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;",
};

function blocksToHtml(blocks: Block[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "h1":
          return `<h1 style="${STYLES.h1}">${escapeHtml(block.text)}</h1>`;
        case "h2":
          return `<h2 style="${STYLES.h2}">${escapeHtml(block.text)}</h2>`;
        case "p":
          return `<p style="${STYLES.p}">${escapeHtml(block.text)}</p>`;
        case "list":
          return `<ul style="margin:0 0 16px;padding-left:20px;">${block.items
            .map((item) => `<li style="${STYLES.li}">${escapeHtml(item)}</li>`)
            .join("")}</ul>`;
        case "button":
          return `<p style="margin:8px 0 20px;"><a href="${escapeHtml(
            safeUrl(block.url),
          )}" style="${STYLES.button}">${escapeHtml(block.label)}</a></p>`;
        case "divider":
          return `<hr style="${STYLES.divider}" />`;
      }
    })
    .join("\n");
}

function blocksToText(blocks: Block[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "h1":
        case "h2":
          return block.text;
        case "p":
          return block.text;
        case "list":
          return block.items.map((item) => `- ${item}`).join("\n");
        case "button":
          return `${block.label}: ${safeUrl(block.url)}`;
        case "divider":
          return "---";
      }
    })
    .join("\n\n");
}

/**
 * Renders a marketing email to HTML and plain text.
 *
 * The unsubscribe footer is appended here and cannot be suppressed by a
 * template, a campaign or an automation.
 */
export function renderMarketingEmail(input: RenderInput): RenderedEmail {
  const vars = input.variables ?? {};
  const subject = applyVariables(input.subject, vars).trim();
  const blocks = parseBlocks(applyVariables(input.body, vars));
  const brand = input.brandName ?? "MunchReach";
  const preview = applyVariables(input.previewText ?? "", vars);
  const unsubscribeUrl = safeUrl(input.unsubscribeUrl);
  const preferencesUrl = input.preferencesUrl ? safeUrl(input.preferencesUrl) : null;

  const footerLinks = [
    `<a href="${escapeHtml(unsubscribeUrl)}" style="${STYLES.footerLink}">Unsubscribe</a>`,
    preferencesUrl
      ? `<a href="${escapeHtml(preferencesUrl)}" style="${STYLES.footerLink}">Email preferences</a>`
      : null,
  ]
    .filter(Boolean)
    .join(" &nbsp;·&nbsp; ");

  const html = [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width,initial-scale=1" />',
    `<title>${escapeHtml(subject)}</title></head>`,
    `<body style="${STYLES.body}">`,
    preview ? `<div style="${STYLES.preheader}">${escapeHtml(preview)}</div>` : "",
    `<div style="${STYLES.wrap}"><div style="${STYLES.card}">`,
    blocksToHtml(blocks),
    "</div>",
    `<div style="${STYLES.footer}">`,
    `<p style="margin:0 0 6px;">You are receiving this because you subscribed to ${escapeHtml(
      brand,
    )} updates.</p>`,
    `<p style="margin:0 0 6px;">${footerLinks}</p>`,
    input.footerAddress ? `<p style="margin:0;">${escapeHtml(input.footerAddress)}</p>` : "",
    "</div></div></body></html>",
  ]
    .filter(Boolean)
    .join("\n");

  const text = [
    blocksToText(blocks),
    "",
    "---",
    `You are receiving this because you subscribed to ${brand} updates.`,
    `Unsubscribe: ${unsubscribeUrl}`,
    preferencesUrl ? `Email preferences: ${preferencesUrl}` : null,
    input.footerAddress ?? null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { subject, html, text };
}

/** Headers every marketing send must carry (one-click unsubscribe, RFC 8058). */
export function marketingHeaders(unsubscribeUrl: string, listId: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${safeUrl(unsubscribeUrl)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    "List-Id": listId,
    Precedence: "bulk",
  };
}
