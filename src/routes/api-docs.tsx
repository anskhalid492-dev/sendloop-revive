/**
 * MunchReach API documentation portal.
 *
 * Every endpoint, event and error shown here is declared in
 * `src/lib/api-reference.ts`, which mirrors the handlers under
 * `src/routes/api/public/*`. Nothing on this page is invented.
 */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Menu, Search, X } from "lucide-react";

import { MarketingLayout, metaFor } from "@/components/site/MarketingPage";
import { CodeBlock, CopyButton, EndpointCard, MethodBadge } from "@/components/docs/ApiDocsUI";
import { V1ResourceSection } from "@/components/docs/V1DocsUI";
import { V1_BASE_PATH, V1_ERROR_CODES, V1_RESOURCES } from "@/lib/api/v1/catalog";
import { cn } from "@/lib/utils";
import {
  API_BASE_URL,
  API_GROUPS,
  API_VERSION,
  NOT_YET_PUBLIC,
  OUTBOUND_EVENTS,
} from "@/lib/api-reference";

export const Route = createFileRoute("/api-docs")({
  head: () =>
    metaFor(
      "Cold Email API for Outreach Automation | MunchReach",
      "Connect MunchReach to your workflow with our outreach API and build custom automations around campaigns, leads, and email activity.",
      "/api-docs",
    ),
  component: ApiDocs,
});

type NavItem = { id: string; label: string; children?: { id: string; label: string }[] };

const NAV: NavItem[] = [
  { id: "overview", label: "Overview" },
  { id: "authentication", label: "Authentication" },
  { id: "getting-started", label: "Getting started" },
  {
    id: "api-v1",
    label: "API v1",
    children: V1_RESOURCES.map((r) => ({ id: r.id, label: r.title })),
  },
  {
    id: "reference",
    label: "Legacy endpoints",
    children: API_GROUPS.map((g) => ({ id: g.id, label: g.title })),
  },
  {
    id: "resources",
    label: "Resources",
    children: [
      { id: "webhooks", label: "Webhooks" },
      { id: "errors", label: "API errors" },
      { id: "rate-limits", label: "Rate limits & usage" },
      { id: "coverage", label: "Coverage & changelog" },
    ],
  },
];

/** Everything the search box can match, mapped to the anchor it scrolls to. */
type SearchEntry = { id: string; label: string; hint: string };

const SEARCH_INDEX: SearchEntry[] = [
  ...NAV.flatMap((n) => [
    { id: n.id, label: n.label, hint: "Section" },
    ...(n.children ?? []).map((c) => ({ id: c.id, label: c.label, hint: "Section" })),
  ]),
  ...API_GROUPS.flatMap((g) =>
    g.endpoints.map((e) => ({
      id: e.id,
      label: `${e.method} ${e.path}`,
      hint: `${g.title} · ${e.title}`,
    })),
  ),
  ...API_GROUPS.flatMap((g) =>
    g.endpoints.flatMap((e) =>
      e.params.map((p) => ({ id: e.id, label: p.name, hint: `Parameter · ${e.title}` })),
    ),
  ),
  ...API_GROUPS.flatMap((g) =>
    g.endpoints.flatMap((e) =>
      e.errors.map((err) => ({
        id: e.id,
        label: `${err.status} — ${err.meaning}`,
        hint: `Error · ${e.title}`,
      })),
    ),
  ),
  ...V1_RESOURCES.flatMap((r) =>
    r.operations.map((op) => ({
      id: op.id,
      label: `${op.method} ${V1_BASE_PATH}${op.path}`,
      hint: `API v1 · ${op.summary}`,
    })),
  ),
  ...OUTBOUND_EVENTS.map((ev) => ({ id: "webhooks", label: ev.name, hint: "Webhook event" })),
];

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  history.replaceState(null, "", `#${id}`);
}

function DocSearch({ onJump }: { onJump: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const seen = new Set<string>();
    return SEARCH_INDEX.filter((entry) => {
      const key = `${entry.id}:${entry.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return `${entry.label} ${entry.hint}`.toLowerCase().includes(q);
    }).slice(0, 8);
  }, [query]);

  return (
    <div className="relative">
      <label htmlFor="api-docs-search" className="sr-only">
        Search the API documentation
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        id="api-docs-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search endpoints, parameters, events, error codes…"
        className="w-full rounded-xl border border-border/70 bg-card py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary/50"
      />
      {results.length ? (
        <ul className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          {results.map((r) => (
            <li key={`${r.id}-${r.label}`}>
              <button
                type="button"
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                onClick={() => {
                  setQuery("");
                  onJump(r.id);
                }}
              >
                <span className="font-mono text-xs text-foreground">{r.label}</span>
                <span className="text-[11px] text-muted-foreground">{r.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? "");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

function SidebarNav({
  active,
  onJump,
}: {
  active: string;
  onJump: (id: string) => void;
}) {
  return (
    <nav aria-label="Documentation" className="space-y-4 text-sm">
      {NAV.map((item) => (
        <div key={item.id}>
          <button
            type="button"
            onClick={() => onJump(item.id)}
            className={cn(
              "w-full rounded-md px-2 py-1.5 text-left font-medium transition-colors",
              active === item.id
                ? "bg-primary/10 text-primary"
                : "text-foreground/80 hover:bg-muted/60",
            )}
          >
            {item.label}
          </button>
          {item.children ? (
            <div className="mt-1 space-y-0.5 border-l border-border/70 pl-3">
              {item.children.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => onJump(child.id)}
                  className={cn(
                    "block w-full rounded-md px-2 py-1 text-left text-[13px] transition-colors",
                    active === child.id
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {child.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </nav>
  );
}

function DocSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border/60 py-10 first:border-t-0">
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ApiDocs() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const sectionIds = useMemo(
    () => NAV.flatMap((n) => [n.id, ...(n.children ?? []).map((c) => c.id)]),
    [],
  );
  const active = useActiveSection(sectionIds);

  const jump = (id: string) => {
    setMobileNavOpen(false);
    scrollToId(id);
  };

  return (
    <MarketingLayout>
      <header className="border-b border-border/60 bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
          <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            Developers
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">MunchReach API</h1>
          <p className="mt-3 max-w-2xl text-base text-muted-foreground">
            Build powerful integrations with the MunchReach API.
          </p>

          <dl className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border/70 bg-card p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Version
              </dt>
              <dd className="mt-1 font-mono text-sm">{API_VERSION}</dd>
            </div>
            <div className="rounded-xl border border-border/70 bg-card p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Base URL
              </dt>
              <dd className="mt-1 flex items-center gap-2">
                <code className="min-w-0 truncate font-mono text-sm">{API_BASE_URL}</code>
                <CopyButton value={API_BASE_URL} />
              </dd>
            </div>
            <div className="rounded-xl border border-border/70 bg-card p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Authentication
              </dt>
              <dd className="mt-1 text-sm text-muted-foreground">
                Per-connection tokens and HMAC signatures over HTTPS
              </dd>
            </div>
          </dl>

          <div className="mt-6 max-w-2xl">
            <DocSearch onJump={jump} />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-10 px-4 sm:px-6">
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto py-10 pr-2">
            <SidebarNav active={active} onJump={jump} />
          </div>
        </aside>

        <div className="min-w-0 flex-1 pb-16">
          <div className="sticky top-16 z-20 -mx-4 border-b border-border/60 bg-background/95 px-4 py-2 backdrop-blur lg:hidden">
            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-border/70 px-3 py-1.5 text-sm font-medium"
              aria-expanded={mobileNavOpen}
            >
              {mobileNavOpen ? <X className="size-4" /> : <Menu className="size-4" />}
              Documentation menu
            </button>
            {mobileNavOpen ? (
              <div className="max-h-[60vh] overflow-y-auto py-3">
                <SidebarNav active={active} onJump={jump} />
              </div>
            ) : null}
          </div>

          <DocSection
            id="overview"
            title="Overview"
            description="The MunchReach API is plain JSON over HTTPS. It is organised around the flows that cross a workspace boundary: bringing leads in, triggering automations, receiving delivery events, and pushing events out to the tools you already use."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {API_GROUPS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => jump(g.id)}
                  className="rounded-2xl border border-border/70 bg-card p-4 text-left transition-colors hover:border-primary/40"
                >
                  <h3 className="text-sm font-semibold">{g.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{g.summary}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {g.endpoints.length} endpoint{g.endpoints.length === 1 ? "" : "s"}
                  </p>
                </button>
              ))}
            </div>
          </DocSection>

          <DocSection
            id="authentication"
            title="Authentication"
            description="MunchReach does not issue a single account-wide REST key today. Each entry point carries its own credential, and every credential is scoped to exactly one workspace resource."
          >
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-card p-5">
                <h3 className="text-sm font-semibold">Connection tokens (leads)</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Connect an integration in <strong>Settings → Integrations</strong>. MunchReach
                  generates an inbound URL that already contains the token. The token identifies one
                  connection, so a request can only ever write into that workspace. Tokens are at
                  least 16 characters.
                </p>
                <div className="mt-3">
                  <CodeBlock
                    caption="Token in the query string"
                    code={`POST ${API_BASE_URL}/api/public/integrations/zapier?token=YOUR_API_TOKEN
Content-Type: application/json`}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 bg-card p-5">
                <h3 className="text-sm font-semibold">Signed requests (automations & webhooks)</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Automation webhooks and the referral billing webhook accept an HMAC-SHA256 hex
                  digest of the raw request body in the <code className="font-mono">x-sendloop-signature</code>{" "}
                  header. Sign the exact bytes you transmit — re-serialising JSON changes the digest.
                </p>
                <div className="mt-3">
                  <CodeBlock
                    caption="Node.js signature"
                    code={`import { createHmac } from "node:crypto";

const body = JSON.stringify({ email: "ada@example.com" });
const signature = createHmac("sha256", process.env.MUNCHREACH_SIGNING_SECRET)
  .update(body)
  .digest("hex");

await fetch("${API_BASE_URL}/api/public/automations/YOUR_WEBHOOK_TOKEN", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-sendloop-signature": signature },
  body,
});`}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 bg-card p-5">
                <h3 className="text-sm font-semibold">Security recommendations</h3>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  <li>Store tokens and signing secrets server-side; never ship them in browser code.</li>
                  <li>Always call the API over HTTPS.</li>
                  <li>Send an <code className="font-mono">x-idempotency-key</code> so a retry cannot duplicate work.</li>
                  <li>Disable a connection in the dashboard to revoke its token immediately.</li>
                  <li>Use one connection per external system so you can revoke them independently.</li>
                </ul>
              </div>
            </div>
          </DocSection>

          <DocSection
            id="getting-started"
            title="Getting started"
            description="Send your first lead into a workspace in three steps."
          >
            <ol className="space-y-3 text-sm">
              {[
                "Open Settings → Integrations and connect Zapier, Make, Google Sheets or a generic webhook.",
                "Copy the inbound URL. It already contains the connection token.",
                "POST a JSON body with at least an email field. The response is 200 with { \"ok\": true }.",
              ].map((step, i) => (
                <li key={step} className="flex gap-3 rounded-xl border border-border/70 bg-card p-4">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4">
              <CodeBlock
                caption="First request"
                code={`curl -X POST "${API_BASE_URL}/api/public/integrations/zapier?token=YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "x-idempotency-key: YOUR_IDEMPOTENCY_KEY" \\
  -d '{"email":"ada@example.com","first_name":"Ada","company":"Example Inc"}'`}
              />
            </div>
          </DocSection>

          <section id="api-v1" className="scroll-mt-24 border-t border-border/60 pt-10">
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">API v1</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              The production REST API. Create a key in{" "}
              <strong>Settings → Developer API</strong>, send it as{" "}
              <code className="font-mono">Authorization: Bearer mr_live_…</code>, and every request
              is scoped to that key&rsquo;s workspace. The machine-readable spec lives at{" "}
              <code className="font-mono">{`${V1_BASE_PATH}/openapi.json`}</code>.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-card p-4">
                <h3 className="text-sm font-semibold">Conventions</h3>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  <li>JSON in, JSON out. Successes return a <code className="font-mono">data</code> object.</li>
                  <li>Lists are cursor-paginated with <code className="font-mono">limit</code> and <code className="font-mono">cursor</code>.</li>
                  <li>Writes accept <code className="font-mono">x-idempotency-key</code> and are replay-safe for 24 hours.</li>
                  <li>Rate limits are per key; <code className="font-mono">429</code> responses carry <code className="font-mono">Retry-After</code>.</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-border/70 bg-card p-4">
                <h3 className="text-sm font-semibold">Error codes</h3>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {V1_ERROR_CODES.map((err) => (
                    <li key={err.code}>
                      <code className="font-mono text-xs text-primary">{err.status}</code>{" "}
                      <code className="font-mono text-xs">{err.code}</code> — {err.meaning}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-6">
              <CodeBlock
                caption="Verify your key"
                code={`curl "${API_BASE_URL}${V1_BASE_PATH}/me" \\
  -H "Authorization: Bearer $MUNCHREACH_API_KEY"`}
              />
            </div>

            {V1_RESOURCES.map((resource) => (
              <V1ResourceSection key={resource.id} resource={resource} />
            ))}
          </section>

          <section id="reference" className="scroll-mt-24 border-t border-border/60 pt-10">
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Legacy endpoints</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Older, single-purpose endpoints that predate API v1. They keep working unchanged —
              use them for existing Zapier or Make connections, and API v1 for anything new.
            </p>

            {API_GROUPS.map((group) => (
              <div key={group.id} id={group.id} className="scroll-mt-24 pt-10">
                <h3 className="text-lg font-semibold tracking-tight">{group.title}</h3>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{group.summary}</p>
                <div className="mt-4 space-y-5">
                  {group.endpoints.map((e) => (
                    <EndpointCard key={e.id} endpoint={e} />
                  ))}
                </div>
              </div>
            ))}
          </section>

          <div id="resources" className="scroll-mt-24" />

          <DocSection
            id="webhooks"
            title="Webhooks"
            description="MunchReach delivers events to the webhook URL or CRM stored on a connection. Payloads are POSTed as JSON; Slack connections receive a formatted message instead."
          >
            <div className="space-y-4">
              {OUTBOUND_EVENTS.map((ev) => (
                <div key={ev.name} className="rounded-2xl border border-border/70 bg-card p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-sm text-primary">{ev.name}</code>
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 text-[11px] font-semibold",
                        ev.status === "live"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {ev.status === "live" ? "Emitted today" : "Declared, not emitted yet"}
                    </span>
                    <CopyButton value={ev.name} label="Copy event" className="ml-auto" />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{ev.when}</p>
                  <div className="mt-3">
                    <CodeBlock code={ev.payload} caption="Example payload" />
                  </div>
                </div>
              ))}

              <div className="rounded-2xl border border-border/70 bg-card p-5">
                <h3 className="text-sm font-semibold">Delivery, retries and idempotency</h3>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  <li>Deliveries are POSTed with a 10 second timeout. Any 2xx counts as accepted.</li>
                  <li>
                    Each attempt is written to the integration event log with its status and message,
                    and the connection is marked <code className="font-mono">error</code> when a
                    delivery fails.
                  </li>
                  <li>
                    Events carry an idempotency key where one is available (for example{" "}
                    <code className="font-mono">reply:&lt;conversation&gt;:&lt;timestamp&gt;</code>),
                    so store it and ignore repeats.
                  </li>
                  <li>
                    Inbound webhooks you send to MunchReach are verified before processing and are
                    safe to retry.
                  </li>
                </ul>
              </div>
            </div>
          </DocSection>

          <DocSection
            id="errors"
            title="API errors"
            description="Errors are returned as JSON with an error field. These are the statuses the public endpoints actually return."
          >
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Example body</th>
                    <th className="px-3 py-2 font-medium">Meaning</th>
                    <th className="px-3 py-2 font-medium">What to do</th>
                  </tr>
                </thead>
                <tbody>
                  {API_GROUPS.flatMap((g) =>
                    g.endpoints.flatMap((e) =>
                      e.errors.map((err) => ({ ...err, endpoint: e })),
                    ),
                  ).map((row) => (
                    <tr key={`${row.endpoint.id}-${row.status}-${row.body}`} className="border-t border-border/60 align-top">
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs font-bold text-primary">{row.status}</span>
                        <div className="mt-1 flex items-center gap-1">
                          <MethodBadge method={row.endpoint.method} />
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{row.body}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.meaning}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DocSection>

          <DocSection
            id="rate-limits"
            title="Rate limits & usage"
            description="API v1 keys are rate limited per key, per minute. The default is 120 requests per minute and is shown on each key in Settings → Developer API."
          >
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                Automation webhook bodies are capped at 100,000 characters; larger payloads return{" "}
                <code className="font-mono">413</code>.
              </li>
              <li>Outbound webhook deliveries time out after 10 seconds.</li>
              <li>
                Sending volume is governed by your plan entitlements (emails and leads), not by the
                API. Current usage is shown on the billing page in your dashboard.
              </li>
              <li>
                Treat any <code className="font-mono">5xx</code> as retryable and use exponential
                backoff with a stable idempotency key.
              </li>
            </ul>
          </DocSection>

          <DocSection
            id="coverage"
            title="Coverage & changelog"
            description="What the public API does not cover yet, so you can plan around it."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-card p-5">
                <h3 className="text-sm font-semibold">Dashboard-only today</h3>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  {NOT_YET_PUBLIC.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  These run through the authenticated application rather than a public HTTP
                  endpoint, so no REST documentation is published for them yet.
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-card p-5">
                <h3 className="text-sm font-semibold">Changelog</h3>
                <div className="mt-2 space-y-3 text-sm text-muted-foreground">
                  <p>
                    <span className="font-mono text-xs text-foreground">{API_VERSION}</span> — First
                    published reference: leads, automations, email delivery, billing webhooks, media
                    and scheduler endpoints, plus the outbound integration events.
                  </p>
                </div>
              </div>
            </div>
          </DocSection>
        </div>
      </div>
    </MarketingLayout>
  );
}
