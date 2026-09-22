import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, ImageIcon, Loader2, RefreshCcw, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  BUG_STATUSES,
  BUG_STATUS_LABEL,
  BUG_STATUS_STYLE,
  bugStatusOf,
} from "@/lib/bug-report-model";
import {
  getAdminBugScreenshotUrl,
  listAdminBugReports,
  updateAdminBugReport,
  type AdminBugReport,
} from "@/lib/admin-support.functions";

function timeOf(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

/** Staff queue for customer-submitted bug reports. */
export function BugReportsPanel() {
  const queryClient = useQueryClient();
  const fetchBugs = useServerFn(listAdminBugReports);
  const signScreenshot = useServerFn(getAdminBugScreenshotUrl);
  const update = useServerFn(updateAdminBugReport);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState<AdminBugReport | null>(null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);

  const filters = { search: search.trim() || undefined, status };
  const bugs = useQuery({
    queryKey: ["admin-bugs", filters],
    queryFn: () => fetchBugs({ data: filters }),
  });

  const setStatusOf = useMutation({
    mutationFn: (input: { id: string; status: (typeof BUG_STATUSES)[number] }) =>
      update({ data: input }),
    onSuccess: () => {
      toast.success("Bug status updated");
      queryClient.invalidateQueries({ queryKey: ["admin-bugs"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not update the status"),
  });

  async function openBug(bug: AdminBugReport) {
    setOpen(bug);
    setShotUrl(null);
    if (!bug.screenshot_path) return;
    try {
      const result = await signScreenshot({ data: { path: bug.screenshot_path } });
      setShotUrl(result.url ?? null);
    } catch {
      setShotUrl(null);
    }
  }

  const rows = bugs.data ?? [];

  return (
    <div className="space-y-4">
      <div className="surface-card flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search bug details…"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {BUG_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {BUG_STATUS_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["admin-bugs"] })}
        >
          <RefreshCcw className="mr-2 size-4" /> Refresh
        </Button>
      </div>

      <div className="surface-card overflow-x-auto p-0">
        {bugs.isLoading ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading bug reports…
          </p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No bug reports match these filters.</p>
        ) : (
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5">User</th>
                <th className="px-4 py-2.5">Workspace</th>
                <th className="px-4 py-2.5">Details</th>
                <th className="px-4 py-2.5">Screenshot</th>
                <th className="px-4 py-2.5">Submitted</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((bug) => {
                const value = bugStatusOf(bug.status);
                return (
                  <tr key={bug.id} className="border-b border-border/40 align-top">
                    <td className="px-4 py-3">
                      <span className="block font-medium">{bug.customer_name ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">
                        {bug.customer_email ?? "unknown"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{bug.workspace_name ?? "—"}</td>
                    <td className="max-w-[22rem] px-4 py-3">
                      <span className="line-clamp-2 break-words">{bug.details}</span>
                    </td>
                    <td className="px-4 py-3">
                      {bug.screenshot_path ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <ImageIcon className="size-3.5" /> Yes
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {timeOf(bug.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={cn(BUG_STATUS_STYLE[value])}>
                        {BUG_STATUS_LABEL[value]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="outline" size="sm" onClick={() => void openBug(bug)}>
                        Open
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={!!open} onOpenChange={(next) => (next ? null : setOpen(null))}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bug report</DialogTitle>
            <DialogDescription>
              {open?.customer_email ?? "unknown"}
              {open?.workspace_name ? ` · ${open.workspace_name}` : ""} ·{" "}
              {timeOf(open?.created_at ?? null)}
            </DialogDescription>
          </DialogHeader>

          {open ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Details</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">{open.details}</p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Screenshot</p>
                {!open.screenshot_path ? (
                  <p className="mt-1 text-sm text-muted-foreground">No screenshot attached.</p>
                ) : shotUrl ? (
                  <div className="mt-2 space-y-2">
                    <img
                      src={shotUrl}
                      alt="Reported screenshot"
                      className="max-h-80 w-full rounded-lg border border-border object-contain"
                    />
                    <Button asChild variant="outline" size="sm">
                      <a href={shotUrl} download={open.screenshot_name ?? "screenshot"}>
                        <Download className="mr-2 size-4" /> Download
                      </a>
                    </Button>
                  </div>
                ) : (
                  <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Preparing the image…
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                <Select
                  value={bugStatusOf(open.status)}
                  onValueChange={(next) => {
                    setOpen({ ...open, status: next });
                    setStatusOf.mutate({ id: open.id, status: next as (typeof BUG_STATUSES)[number] });
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BUG_STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {BUG_STATUS_LABEL[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {setStatusOf.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
