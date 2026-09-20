import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  cancelLeadImport,
  listLeadImportJobs,
  retryLeadImport,
} from "@/lib/lead-import.functions";
import {
  LEAD_IMPORT_STATUS_LABELS,
  importProgressLabel,
  importProgressPercent,
  isLeadImportActive,
  type LeadImportJob,
} from "@/lib/lead-import";

/**
 * Shows imports that are still running (or just finished) so a customer who
 * navigated away can come back and see where their file got to.
 */
export function ImportProgressPanel({ workspaceId }: { workspaceId: string | undefined }) {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listLeadImportJobs);
  const cancelFn = useServerFn(cancelLeadImport);
  const retryFn = useServerFn(retryLeadImport);

  const jobs = useQuery({
    queryKey: ["lead-import-jobs", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const result = await listFn({ data: { workspaceId: workspaceId!, limit: 5 } });
      return (result.jobs ?? []) as LeadImportJob[];
    },
    refetchInterval: (query) => {
      const rows = (query.state.data as LeadImportJob[] | undefined) ?? [];
      return rows.some((job) => isLeadImportActive(job.status)) ? 3000 : false;
    },
  });

  const visible = (jobs.data ?? []).filter((job) => {
    if (isLeadImportActive(job.status)) return true;
    const finished = job.finished_at ? Date.parse(job.finished_at) : 0;
    return finished > 0 && Date.now() - finished < 10 * 60 * 1000;
  });

  const importedTotal = visible.reduce((sum, job) => sum + job.imported_rows, 0);

  // New leads land continuously, so the table refreshes as the job advances.
  useEffect(() => {
    if (visible.length === 0) return;
    void queryClient.invalidateQueries({ queryKey: ["leads"] });
    void queryClient.invalidateQueries({ queryKey: ["lead-lists"] });
  }, [importedTotal, visible.length, queryClient]);

  const cancel = useMutation({
    mutationFn: async (jobId: string) => cancelFn({ data: { jobId } }),
    onSuccess: () => {
      toast.success("Import cancelled");
      void jobs.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const retry = useMutation({
    mutationFn: async (jobId: string) => retryFn({ data: { jobId } }),
    onSuccess: () => {
      toast.success("Import resumed");
      void jobs.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (visible.length === 0) return null;

  return (
    <div className="space-y-3">
      {visible.map((job) => {
        const active = isLeadImportActive(job.status);
        const failed = job.status === "failed" || job.status === "cancelled";
        return (
          <div key={job.id} className="space-y-2 rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              {active ? (
                <Loader2 className="size-4 animate-spin text-primary" />
              ) : failed ? (
                <AlertTriangle className="size-4 text-destructive" />
              ) : (
                <CheckCircle2 className="size-4 text-primary" />
              )}
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{job.file_name}</p>
              <span className="text-xs text-muted-foreground">
                {LEAD_IMPORT_STATUS_LABELS[job.status]}
              </span>
              {active ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(job.id)}
                >
                  <X className="mr-1 size-3.5" />
                  Cancel
                </Button>
              ) : null}
              {failed ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={retry.isPending}
                  onClick={() => retry.mutate(job.id)}
                >
                  <RotateCcw className="mr-1 size-3.5" />
                  Resume
                </Button>
              ) : null}
            </div>
            <Progress value={importProgressPercent(job)} />
            <p className="text-xs text-muted-foreground">
              {importProgressLabel(job)} · {job.imported_rows.toLocaleString()} imported ·{" "}
              {job.duplicate_rows.toLocaleString()} duplicate ·{" "}
              {job.invalid_rows.toLocaleString()} invalid
            </p>
            {job.error_message ? (
              <p className="text-xs text-destructive">{job.error_message}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
