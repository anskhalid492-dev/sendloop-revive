/**
 * Rendering for the Public API v1 reference.
 *
 * Everything here is driven by `src/lib/api/v1/catalog.ts`, so the portal can
 * only describe operations the router actually serves.
 */
import { useMemo, useState } from "react";

import { CodeBlock, CopyButton } from "@/components/docs/ApiDocsUI";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/lib/api-reference";
import { V1_BASE_PATH, type V1Operation, type V1Resource } from "@/lib/api/v1/catalog";

const METHOD_STYLES: Record<string, string> = {
  GET: "bg-primary/10 text-primary",
  POST: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  PATCH: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  DELETE: "bg-destructive/10 text-destructive",
};

export function V1MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide",
        METHOD_STYLES[method] ?? "bg-muted text-muted-foreground",
      )}
    >
      {method}
    </span>
  );
}

const TABS = ["cURL", "JavaScript", "Python"] as const;

function examplesFor(op: V1Operation) {
  const path = `${V1_BASE_PATH}${op.path}`
    .replace("{campaign_id}", "CAMPAIGN_ID")
    .replace("{contact_id}", "CONTACT_ID")
    .replace("{mailbox_id}", "MAILBOX_ID")
    .replace("{webhook_id}", "WEBHOOK_ID")
    .replace("{step_id}", "STEP_ID")
    .replace("{action}", "launch");
  const url = `${API_BASE_URL}${path}`;
  const body = op.requestBody;

  const curl = [
    `curl -X ${op.method} "${url}"`,
    `  -H "Authorization: Bearer $MUNCHREACH_API_KEY"`,
    ...(body ? [`  -H "Content-Type: application/json"`] : []),
    ...(op.idempotent ? [`  -H "x-idempotency-key: $(uuidgen)"`] : []),
    ...(body ? [`  -d '${body}'`] : []),
  ].join(" \\\n");

  const js = `const response = await fetch("${url}", {
  method: "${op.method}",
  headers: {
    Authorization: \`Bearer \${process.env.MUNCHREACH_API_KEY}\`,${
      body ? `\n    "Content-Type": "application/json",` : ""
    }${op.idempotent ? `\n    "x-idempotency-key": crypto.randomUUID(),` : ""}
  },${body ? `\n  body: JSON.stringify(${body}),` : ""}
});

const payload = await response.json();
console.log(response.status, payload);`;

  const python = `import os, requests

response = requests.${op.method.toLowerCase()}(
    "${url}",
    headers={"Authorization": f"Bearer {os.environ['MUNCHREACH_API_KEY']}"},${
      body ? `\n    json=${body.replace(/true/g, "True").replace(/false/g, "False")},` : ""
    }
)

print(response.status_code, response.text)`;

  return { curl, js, python, url };
}

export function V1OperationCard({ operation }: { operation: V1Operation }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("cURL");
  const examples = useMemo(() => examplesFor(operation), [operation]);
  const code =
    tab === "cURL" ? examples.curl : tab === "JavaScript" ? examples.js : examples.python;

  return (
    <article
      id={operation.id}
      className="scroll-mt-28 rounded-2xl border border-border/70 bg-card p-5 sm:p-6"
    >
      <header>
        <h4 className="text-base font-semibold tracking-tight">{operation.summary}</h4>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-2">
          <V1MethodBadge method={operation.method} />
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-foreground/90">
            {V1_BASE_PATH}
            {operation.path}
          </code>
          <CopyButton value={examples.url} label="Copy URL" />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {operation.description}
        </p>
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md border border-border/60 px-2 py-0.5 text-muted-foreground">
          Scope:{" "}
          <code className="font-mono text-foreground/90">
            {operation.scope ?? "any valid key"}
          </code>
        </span>
        {operation.idempotent ? (
          <span className="rounded-md border border-border/60 px-2 py-0.5 text-muted-foreground">
            Accepts <code className="font-mono text-foreground/90">x-idempotency-key</code>
          </span>
        ) : null}
      </div>

      {operation.params?.length ? (
        <section className="mt-5">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Parameters
          </h5>
          <div className="mt-2 overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">In</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {operation.params.map((p) => (
                  <tr key={`${p.in}-${p.name}`} className="border-t border-border/60">
                    <td className="px-3 py-2 font-mono text-xs text-primary">{p.name}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{p.in}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.type}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {operation.requestBody ? (
        <section className="mt-5">
          <CodeBlock code={operation.requestBody} caption="Request body" />
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
        <CodeBlock code={operation.responseExample} caption="Example response" />
      </section>

      <p className="mt-4 text-[11px] text-muted-foreground">
        Implementation: <code className="font-mono">{operation.source}</code>
      </p>
    </article>
  );
}

export function V1ResourceSection({ resource }: { resource: V1Resource }) {
  return (
    <div id={resource.id} className="scroll-mt-24 pt-10">
      <h3 className="text-lg font-semibold tracking-tight">{resource.title}</h3>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{resource.summary}</p>
      <div className="mt-4 space-y-5">
        {resource.operations.map((op) => (
          <V1OperationCard key={op.id} operation={op} />
        ))}
      </div>
    </div>
  );
}
