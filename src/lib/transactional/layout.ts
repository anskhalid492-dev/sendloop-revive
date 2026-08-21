/**
 * Branded transactional email layout.
 *
 * One responsive, mobile-friendly HTML shell shared by every MunchReach
 * transactional template, plus a plain-text generator so every email ships
 * both parts. Table-based markup and inline styles only — email clients
 * ignore external CSS.
 */

export const BRAND = {
  name: "MunchReach",
  color: "#44A6DD",
  colorDark: "#2F8CC0",
  ink: "#0F172A",
  muted: "#5b6b7c",
  support: "support@munchreach.com",
  site: "https://munchreach.com",
  /** Absolute URL — email clients cannot resolve bundled or relative assets. */
  logoUrl: "https://munchreach.com/brand/munchreach-logo.png",
};

export type EmailBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "callout"; text: string }
  | { kind: "button"; label: string; url: string };

export type LayoutInput = {
  heading: string;
  preheader?: string;
  blocks: EmailBlock[];
  /** One line explaining why the recipient received this email. */
  reason: string;
};

function blockHtml(block: EmailBlock): string {
  switch (block.kind) {
    case "paragraph":
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${BRAND.ink}">${block.text}</p>`;
    case "list":
      return `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.7;color:${BRAND.ink}">${block.items
        .map((item) => `<li style="margin:0 0 6px">${item}</li>`)
        .join("")}</ul>`;
    case "callout":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td style="background:#f1f7fb;border-left:3px solid ${BRAND.color};border-radius:6px;padding:14px 16px;font-size:14px;line-height:1.6;color:${BRAND.ink}">${block.text}</td></tr></table>`;
    case "button":
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="border-radius:8px;background:${BRAND.color}"><a href="${block.url}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${block.label}</a></td></tr></table>`;
  }
}

/** Renders the branded HTML shell. Tokens inside blocks are left untouched. */
export function renderEmailLayout(input: LayoutInput): string {
  const preheader = input.preheader
    ? `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${input.preheader}</div>`
    : "";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${input.heading}</title>
</head>
<body style="margin:0;padding:0;background:#f5f7fa;-webkit-font-smoothing:antialiased">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:28px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e6ecf2;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      <tr><td style="padding:22px 28px;border-bottom:1px solid #eef2f6">
        <span style="font-size:18px;font-weight:700;letter-spacing:-0.2px;color:${BRAND.ink}">Munch<span style="color:${BRAND.color}">Reach</span></span>
      </td></tr>
      <tr><td style="padding:28px 28px 8px">
        <h1 style="margin:0 0 14px;font-size:21px;line-height:1.3;font-weight:700;color:${BRAND.ink}">${input.heading}</h1>
        ${input.blocks.map(blockHtml).join("\n        ")}
      </td></tr>
      <tr><td style="padding:8px 28px 26px">
        <hr style="border:none;border-top:1px solid #eef2f6;margin:0 0 16px">
        <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${BRAND.muted}">${input.reason}</p>
        <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.muted}">
          Need help? <a href="{{support_url}}" style="color:${BRAND.color};text-decoration:none">Visit the help center</a> or reply to this email.<br>
          ${BRAND.name} · <a href="{{dashboard_url}}" style="color:${BRAND.muted};text-decoration:underline">Dashboard</a> ·
          <a href="https://munchreach.com/privacy" style="color:${BRAND.muted};text-decoration:underline">Privacy</a> ·
          <a href="https://munchreach.com/terms" style="color:${BRAND.muted};text-decoration:underline">Terms</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/** Plain-text fallback derived from the same blocks. */
export function renderEmailText(input: LayoutInput): string {
  const lines: string[] = [input.heading, ""];
  for (const block of input.blocks) {
    if (block.kind === "paragraph" || block.kind === "callout") lines.push(stripTags(block.text), "");
    if (block.kind === "list") {
      for (const item of block.items) lines.push(`- ${stripTags(item)}`);
      lines.push("");
    }
    if (block.kind === "button") lines.push(`${block.label}: ${block.url}`, "");
  }
  lines.push(input.reason, `Help center: {{support_url}}`, `${BRAND.name}`);
  return lines.join("\n");
}

export function stripTags(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Best-effort plain text for admin-authored HTML that has no text part. */
export function htmlToText(html: string): string {
  return stripTags(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<head[\s\S]*?<\/head>/gi, "")
      .replace(/<\/(p|div|h1|h2|h3|li|tr)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- "),
  )
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, all) => line.length > 0 || all[index - 1]?.length)
    .join("\n")
    .trim();
}
