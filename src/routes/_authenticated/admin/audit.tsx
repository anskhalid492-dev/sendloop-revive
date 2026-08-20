import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listAdminChangeLog } from "@/lib/plans-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  component: AdminChangeLogPage,
});

const FILTERS = [
  { value: "all", label: "All changes" },
  { value: "plan", label: "Plans" },
  { value: "plan_feature", label: "Features" },
  { value: "subscription", label: "Subscriptions" },
  { value: "credits", label: "Credits" },
];

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

type ChangeRow = {
  id: string;
  at: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  actorId: string;
  actorEmail: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  changes: Record<string, { before: unknown; after: unknown }>;
};

function AdminChangeLogPage() {
  const fetchLog = useServerFn(listAdminChangeLog);
  const [targetType, setTargetType] = useState("all");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["admin-change-log", targetType, search],
    queryFn: () => fetchLog({ data: { targetType, search } }),
  });

  const rows = (q.data ?? []) as unknown as ChangeRow[];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Change audit log</h2>
        <p className="text-sm text-muted-foreground">
          Every plan, feature, subscription and credit change with before/after values, the acting
          admin and the affected workspace.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={targetType === f.value ? "default" : "outline"}
            onClick={() => setTargetType(f.value)}
          >
            {f.label}
          </Button>
        ))}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search action, admin, workspace…"
          className="h-9 w-64"
        />
      </div>

      {q.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : q.error ? (
        <p className="text-sm text-destructive">{(q.error as Error).message}</p>
      ) : (
        <div className="surface-card divide-y divide-border/40">
          {rows.map((row) => {
            const changes = Object.entries(row.changes ?? {});
            return (
              <div key={row.id} className="space-y-2 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{row.targetType}</Badge>
                  <span className="font-mono text-xs">{row.action}</span>
                  <span className="font-medium">{row.targetLabel ?? row.targetId ?? "—"}</span>
                  {row.workspaceName ? (
                    <span className="text-muted-foreground">· {row.workspaceName}</span>
                  ) : null}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {row.actorEmail ?? row.actorId} · {new Date(row.at).toLocaleString()}
                  </span>
                </div>
                {changes.length ? (
                  <div className="overflow-x-auto rounded-lg border border-border/50">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-medium">Field</th>
                          <th className="px-3 py-1.5 text-left font-medium">Before</th>
                          <th className="px-3 py-1.5 text-left font-medium">After</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changes.map(([field, value]) => (
                          <tr key={field} className="border-t border-border/40">
                            <td className="px-3 py-1.5 font-mono">{field}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">
                              {formatValue(value.before)}
                            </td>
                            <td className="px-3 py-1.5 font-medium">{formatValue(value.after)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No field-level changes recorded.</p>
                )}
              </div>
            );
          })}
          {rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No admin changes recorded yet.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
