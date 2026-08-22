/**
 * Presentation pieces for the API documentation portal.
 *
 * These components only render the data declared in `src/lib/api-reference.ts`;
 * they never describe behaviour of their own, so the docs cannot drift away
 * from the endpoints that actually exist.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";
import { API_BASE_URL, type Endpoint, type HttpMethod } from "@/lib/api-reference";

export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string | undefined;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          /* clipboard unavailable — nothing to report to the reader */
        }
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background/80 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground",
        className,
      )}
      aria-label={copied ? "Copied" : label}
    >
      {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

const METHOD_STYLES: Record<HttpMethod, string> = {
  GET: "bg-primary/10 text-primary",
  POST: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  OPTIONS: "bg-muted text-muted-foreground",
};

export function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide",
        METHOD_STYLES[method],
      )}
    >
      {method}
    </span>
  );
}

export function CodeBlock({ code, caption }: { code: string; caption?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-muted/40">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {caption ?? "Example"}
        </span>
        <CopyButton value={code} />
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-xs leading-relaxed">
        <code className="font-mono text-foreground/90">{code}</code>
      </pre>
    </div>
  );
}

/** Builds runnable examples straight from the endpoint declaration. */
function buildExamples(e: Endpoint) {
  const pathWithPlaceholders = e.path
    .replace("{slug}", "zapier")
    .replace("{token}", "YOUR_WEBHOOK_TOKEN")
    .replace("{job}", "run-campaigns")
    .replace("{path}", "posts/cover.png");
  const needsToken = e.params.some((p) => p.where === "query" && p.name === "token");
  const url = `${API_BASE_URL}${pathWithPlaceholders}${needsToken ? "?token=YOUR_API_TOKEN" : ""}`;
  const signed = e.params.some((p) => p.name === "x-sendloop-signature");
  const body = e.requestBody;

  const curl = [
    `curl -X ${e.method} "${url}"`,
    ...(body ? [`  -H "Content-Type: application/json"`] : []),
    ...(signed ? [`  -H "x-sendloop-signature: YOUR_SIGNATURE"`] : []),
    ...(body ? [`  -H "x-idempotency-key: YOUR_IDEMPOTENCY_KEY"`] : []),
    ...(body ? [`  -d '${body}'`] : []),
  ].join(" \\\n");

  const js = body
    ? `const response = await fetch("${url}", {
  method: "${e.method}",
  headers: {
    "Content-Type": "application/json",${signed ? `\n    "x-sendloop-signature": "YOUR_SIGNATURE",` : ""}
    "x-idempotency-key": "YOUR_IDEMPOTENCY_KEY",
  },
  body: JSON.stringify(${body}),
});

const data = await response.json();
console.log(response.status, data);`
    : `const response = await fetch("${url}", { method: "${e.method}" });
console.log(response.status, await response.text());`;

  const python = body
    ? `import requests

response = requests.${e.method.toLowerCase()}(
    "${url}",
    headers={
        "Content-Type": "application/json",${signed ? `\n        "x-sendloop-signature": "YOUR_SIGNATURE",` : ""}
        "x-idempotency-key": "YOUR_IDEMPOTENCY_KEY",
    },
    json=${body.replace(/true/g, "True").replace(/false/g, "False")},
)

print(response.status_code, response.json())`
    : `import requests

response = requests.${e.method.toLowerCase()}("${url}")
print(response.status_code, response.text)`;

  return { url, curl, js, python };
}

const TABS = ["cURL", "JavaScript", "Python"] as const;

export function EndpointCard({ endpoint }: { endpoint: Endpoint }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("cURL");
  const examples = useMemo(() => buildExamples(endpoint), [endpoint]);
  const code = tab === "cURL" ? examples.curl : tab === "JavaScript" ? examples.js : examples.python;

  const grouped = {
    path: endpoint.params.filter((p) => p.where === "path"),
    query: endpoint.params.filter((p) => p.where === "query"),
    header: endpoint.params.filter((p) => p.where === "header"),
    body: endpoint.params.filter((p) => p.where === "body"),
  };

  return (
    <article
      id={endpoint.id}
      className="scroll-mt-28 rounded-2xl border border-border/70 bg-card p-5 sm:p-6"
    >
      <header>
        <h3 className="text-lg font-semibold tracking-tight">{endpoint.title}</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-2">
          <MethodBadge method={endpoint.method} />
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-foreground/90">
            {endpoint.path}
          </code>
          <CopyButton value={`${API_BASE_URL}${endpoint.path}`} label="Copy URL" />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{endpoint.description}</p>
      </header>

      <section className="mt-4 rounded-xl border border-border/60 bg-background/60 p-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Authentication
        </h4>
        <p className="mt-1 text-sm text-foreground/90">{endpoint.auth}</p>
      </section>

      {(["path", "query", "header", "body"] as const).map((where) =>
        grouped[where].length ? (
          <section key={where} className="mt-5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {where === "body" ? "Request body fields" : `${where} parameters`}
            </h4>
            <div className="mt-2 overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Required</th>
                    <th className="px-3 py-2 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[where].map((p) => (
                    <tr key={p.name} className="border-t border-border/60">
                      <td className="px-3 py-2 font-mono text-xs text-primary">{p.name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.type}</td>
                      <td className="px-3 py-2 text-xs">{p.required ? "Required" : "Optional"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null,
      )}

      {endpoint.requestBody ? (
        <section className="mt-5">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Request body
          </h4>
          <CodeBlock code={endpoint.requestBody} caption="JSON" />
        </section>
      ) : null}

      <section className="mt-5">
        <div className="mb-2 flex flex-wrap items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                tab === t
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <CodeBlock code={code} caption={`Example request · ${tab}`} />
      </section>

      <section className="mt-4">
        <CodeBlock code={endpoint.responseExample} caption="Example response" />
      </section>

      {endpoint.errors.length ? (
        <section className="mt-5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Error responses
          </h4>
          <div className="mt-2 grid gap-2">
            {endpoint.errors.map((err) => (
              <div
                key={`${err.status}-${err.body}`}
                className="rounded-xl border border-border/60 bg-background/60 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-destructive/10 px-2 py-0.5 font-mono text-[11px] font-bold text-destructive">
                    {err.status}
                  </span>
                  <code className="overflow-x-auto font-mono text-xs text-muted-foreground">
                    {err.body}
                  </code>
                </div>
                <p className="mt-1.5 text-sm text-foreground/90">{err.meaning}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{err.action}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {endpoint.notes?.length ? (
        <ul className="mt-5 space-y-1.5 text-sm text-muted-foreground">
          {endpoint.notes.map((n) => (
            <li key={n} className="flex gap-2">
              <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {endpoint.needsReview ? (
        <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-foreground/90">
          <strong className="font-semibold">Not fully documented: </strong>
          {endpoint.needsReview}
        </p>
      ) : null}

      <p className="mt-4 text-[11px] text-muted-foreground">
        Implementation: <code className="font-mono">{endpoint.source}</code>
      </p>
    </article>
  );
}
