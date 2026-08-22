import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  adminLeadRetentionOverview,
  adminRunLeadRetention,
} from "@/lib/lead-retention.functions";

function fmt(value: string) {
  return new Date(value).toLocaleString();
}

export function LeadRetentionPanel() {
  const queryClient = useQueryClient();
  const load = useServerFn(adminLeadRetentionOverview);
  const runNow = useServerFn(adminRunLeadRetention);

  const overview = useQuery({
    queryKey: ["admin-lead-retention"],
    queryFn: () => load(),
    refetchOnWindowFocus: true,
  });

  const run = useMutation({
    mutationFn: () => runNow({ data: {} }),
    onSuccess: (result) => {
      toast.success(`Cleanup finished — ${result.deleted} contact(s) removed`);
      void queryClient.invalidateQueries({ queryKey: ["admin-lead-retention"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = overview.data;
  const runs = data?.runs ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Lead retention — 60 days</CardTitle>
          <CardDescription>
            Stored contacts are deleted automatically 60 days after import. Campaign history,
            messages, replies, analytics and billing records are kept. Runs nightly in the
            background.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? "Running…" : "Run cleanup now"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Retention window" value={`${data?.retentionDays ?? 60} days`} />
          <Stat label="Expiring in 7 days" value={String(data?.expiringSoon ?? 0)} />
          <Stat label="Awaiting next run" value={String(data?.expiredPending ?? 0)} />
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead className="text-right">Deleted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                    {overview.isLoading ? "Loading cleanup log…" : "No cleanup runs recorded yet."}
                  </TableCell>
                </TableRow>
              ) : (
                runs.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {fmt(row.started_at)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.workspace_name ?? (row.workspace_id ? row.workspace_id.slice(0, 8) : "—")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.deleted_count}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === "error" ? "destructive" : "secondary"}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                      {row.error ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
