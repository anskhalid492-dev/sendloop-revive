/**
 * Plain-text campaign body -> HTML email body.
 *
 * Shared by the dispatcher and the test-send path so a "[Test]" email is byte
 * for byte the same rendering the recipient gets. Everything is escaped first;
 * links are re-introduced afterwards from the escaped text only, so no author
 * content can inject markup.
 */

export function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** href value for an already HTML-escaped URL (quotes stay escaped). */
function hrefFor(escapedUrl: string): string {
  return escapedUrl.replace(/&#39;/g, "%27");
}

const URL_RE = /(https?:\/\/[^\s<)"']+[^\s<)"'.,;:!?])/g;

/**
 * Turn URLs inside already-escaped text into clickable anchors, and render
 * `Unsubscribe: <url>` footers as a single `<a>Unsubscribe</a>` link.
 */
export function linkifyEmailHtml(escaped: string): string {
  const withFooter = escaped.replace(
    /(Unsubscribe|Opt[- ]?out)\s*:\s*(https?:\/\/[^\s<)"']+)/gi,
    (_m, label: string, url: string) =>
      `<a href="${hrefFor(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`,
  );
  // Linkify only text outside the anchors just generated; re-running URL_RE
  // over the whole string would match the URL inside the href attribute and
  // nest a second anchor, corrupting the markup.
  return withFooter
    .split(/(<a [^]*?<\/a>)/)
    .map((segment) =>
      segment.startsWith("<a ")
        ? segment
        : segment.replace(URL_RE, (url) => {
            return `<a href="${hrefFor(url)}" target="_blank" rel="noopener noreferrer">${url}</a>`;
          }),
    )
    .join("");
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${linkifyEmailHtml(escapeEmailHtml(part)).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Full HTML document used for outgoing campaign emails. */
export function campaignBodyHtml(text: string): string {
  const content = paragraphs(text) || `<p>${linkifyEmailHtml(escapeEmailHtml(text))}</p>`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#111827;">${content}</div></body></html>`;
}
