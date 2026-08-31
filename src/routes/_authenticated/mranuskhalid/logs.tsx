import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listSystemLogs } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/mranuskhalid/logs")({
  component: AdminLogsPage,
});

function AdminLogsPage() {
  const fetchLogs = useServerFn(listSystemLogs);
  const q = useQuery({ queryKey: ["admin-logs"], queryFn: () => fetchLogs() });

  if (q.isLoading) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const rows = q.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Logs</h2>
        <p className="text-sm text-muted-foreground">
          Provider tests, mailbox errors and failed sends.
        </p>
      </div>
      <div className="surface-card divide-y divide-border/40">
        {rows.map((e, i) => (
          <div key={`${e.source}-${i}`} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
            <span
              className={
                e.level === "error"
                  ? "rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
                  : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
              }
            >
              {e.level}
            </span>
            <span className="font-mono text-xs text-muted-foreground">{e.source}</span>
            <span className="flex-1 min-w-40">{e.message}</span>
            <span className="text-xs text-muted-foreground">
              {e.at ? new Date(e.at).toLocaleString() : ""}
            </span>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No system events recorded.
          </p>
        ) : null}
      </div>
    </div>
  );
}
