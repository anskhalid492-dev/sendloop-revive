import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { MarketingLayout, PageHero, Section, metaFor } from "@/components/site/MarketingPage";
import { listPublicSubprocessors } from "@/lib/trust-center.functions";
import { SUBPROCESSOR_STATUS_LABEL } from "@/lib/trust-center-model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/subprocessors")({
  head: () =>
    metaFor(
      "Subprocessors — MunchReach",
      "The third-party providers MunchReach uses to deliver the platform, what each one processes and where they are located.",
      "/subprocessors",
    ),
  component: SubprocessorsPage,
});

const statusStyle: Record<string, string> = {
  active: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  planned: "border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  retired: "border-border bg-muted text-muted-foreground",
};

function SubprocessorsPage() {
  const fetchList = useServerFn(listPublicSubprocessors);
  const { data = [], isLoading } = useQuery({
    queryKey: ["public-subprocessors"],
    queryFn: () => fetchList({}),
  });

  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Legal"
        title="MunchReach"
        highlight="Subprocessors"
        description="MunchReach uses a small number of infrastructure providers to run the platform. Only providers we actually use are listed here."
      />

      <Section>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading providers…</p>
        ) : data.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
            No subprocessors are currently published.
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-2xl border border-border md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Provider</th>
                    <th className="px-4 py-3 font-medium">Service</th>
                    <th className="px-4 py-3 font-medium">Purpose</th>
                    <th className="px-4 py-3 font-medium">Data processed</th>
                    <th className="px-4 py-3 font-medium">Location</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.map((s) => (
                    <tr key={s.id} className="align-top">
                      <td className="px-4 py-4 font-medium">{s.provider}</td>
                      <td className="px-4 py-4 text-muted-foreground">{s.service}</td>
                      <td className="px-4 py-4 text-muted-foreground">{s.purpose}</td>
                      <td className="px-4 py-4 text-muted-foreground">{s.data_processed}</td>
                      <td className="px-4 py-4 text-muted-foreground">{s.location}</td>
                      <td className="px-4 py-4">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                            statusStyle[s.status] ?? statusStyle["retired"],
                          )}
                        >
                          {SUBPROCESSOR_STATUS_LABEL[s.status] ?? s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="grid gap-4 md:hidden">
              {data.map((s) => (
                <div key={s.id} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-base font-semibold">{s.provider}</h2>
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                        statusStyle[s.status] ?? statusStyle["retired"],
                      )}
                    >
                      {SUBPROCESSOR_STATUS_LABEL[s.status] ?? s.status}
                    </span>
                  </div>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div>
                      <dt className="text-xs uppercase text-muted-foreground">Service</dt>
                      <dd>{s.service}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-muted-foreground">Purpose</dt>
                      <dd className="text-muted-foreground">{s.purpose}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-muted-foreground">Data processed</dt>
                      <dd className="text-muted-foreground">{s.data_processed}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-muted-foreground">Location</dt>
                      <dd className="text-muted-foreground">{s.location}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="mt-8 max-w-3xl text-sm text-muted-foreground">
          This list is maintained by the MunchReach team and updated before a new provider begins
          processing customer data. Questions about a provider? Email support@munchreach.com or see
          the <a className="text-primary hover:underline" href="/dpa">Data Processing Agreement</a>.
        </p>
      </Section>
    </MarketingLayout>
  );
}
