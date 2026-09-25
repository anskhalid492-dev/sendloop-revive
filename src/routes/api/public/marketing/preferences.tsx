import { createFileRoute } from "@tanstack/react-router";

import { parseMarketingToken } from "@/lib/marketing/unsubscribe.server";

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>${esc(title)} — MunchReach</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#eef3f8;color:#0f172a">
<div style="max-width:520px;margin:10vh auto;background:#fff;border:1px solid #e2e9f1;border-radius:16px;overflow:hidden">
<div style="height:4px;background:#44A6DD"></div>
<div style="padding:24px 32px;border-bottom:1px solid #eef2f6"><img src="https://munchreach.com/brand/munchreach-logo.png" alt="MunchReach" style="height:32px"/></div>
<div style="padding:28px 32px"><h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>${body}</div>
</div></body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

const p = (t: string) => `<p style="font-size:15px;line-height:1.6;margin:0 0 16px;color:#475569">${t}</p>`;
const button = (token: string, action: string, label: string) =>
  `<form method="post" style="display:inline-block;margin:0 8px 8px 0"><input type="hidden" name="token" value="${esc(token)}"/><input type="hidden" name="action" value="${action}"/><button type="submit" style="padding:12px 22px;border:0;border-radius:10px;background:${action === "unsubscribe" ? "#0f172a" : "#44A6DD"};color:#fff;font-size:15px;font-weight:600;cursor:pointer">${label}</button></form>`;

export const Route = createFileRoute("/api/public/marketing/preferences")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        const target = parseMarketingToken(token);
        if (!target) return page("Invalid link", p("This preferences link is not valid."), 400);
        return page(
          "Email preferences",
          p(`Manage MunchReach marketing email for <strong>${esc(target.email)}</strong>. Account, billing and support messages are not affected.`) +
            button(token, "unsubscribe", "Unsubscribe from marketing email") +
            button(token, "resubscribe", "Keep receiving updates"),
        );
      },
      POST: async ({ request }) => {
        const form = new URLSearchParams(await request.text());
        const token = form.get("token") ?? "";
        const target = parseMarketingToken(token);
        if (!target) return page("Invalid link", p("This preferences link is not valid."), 400);
        try {
          const { suppressEmail, resubscribeEmail } = await import("@/lib/marketing/subscribers.server");
          if (form.get("action") === "resubscribe") {
            await resubscribeEmail(target.email);
            return page("You're subscribed", p("You'll keep receiving MunchReach updates."));
          }
          await suppressEmail({ email: target.email, reason: "unsubscribe", source: "preferences" });
          return page("You're unsubscribed", p("You will no longer receive MunchReach marketing email."));
        } catch (error) {
          console.error("[marketing-preferences] failed", error);
          return page("Something went wrong", p("Please try again in a few minutes."), 500);
        }
      },
    },
  },
});
