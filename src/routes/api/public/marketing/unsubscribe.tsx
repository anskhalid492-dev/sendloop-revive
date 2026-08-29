import { createFileRoute } from "@tanstack/react-router";

import { parseMarketingToken } from "@/lib/marketing/unsubscribe.server";

function page(title: string, message: string, status: number): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title} — MunchReach</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#ffffff;color:#0f172a">
<div style="max-width:520px;margin:12vh auto;padding:32px;border:1px solid #e2e8f0;border-radius:16px">
<h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
<p style="font-size:15px;line-height:1.6;margin:0;color:#475569">${message}</p>
</div></body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

async function unsubscribe(token: string | null): Promise<Response> {
  if (!token) return page("Invalid link", "This unsubscribe link is missing its token.", 400);
  const target = parseMarketingToken(token);
  if (!target) return page("Invalid link", "This unsubscribe link is not valid or has expired.", 400);

  try {
    const { suppressEmail } = await import("@/lib/marketing/subscribers.server");
    await suppressEmail({ email: target.email, reason: "unsubscribe", source: "link" });
  } catch (error) {
    console.error("[marketing-unsubscribe] failed", error);
    return page(
      "Something went wrong",
      "We could not process your request right now. Please try again in a few minutes.",
      500,
    );
  }

  return page(
    "You're unsubscribed",
    "You will no longer receive MunchReach marketing email. Account, billing and support messages still reach you.",
    200,
  );
}

export const Route = createFileRoute("/api/public/marketing/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => unsubscribe(new URL(request.url).searchParams.get("token")),
      POST: async ({ request }) => {
        const url = new URL(request.url);
        let token = url.searchParams.get("token");
        if (!token) {
          const body = await request.text();
          token = new URLSearchParams(body).get("token");
        }
        return unsubscribe(token);
      },
    },
  },
});
