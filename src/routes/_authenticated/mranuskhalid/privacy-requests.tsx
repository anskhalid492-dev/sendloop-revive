import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminListPrivacyRequests,
  adminUpdatePrivacyRequest,
} from "@/lib/trust-center.functions";
import {
  PRIVACY_REQUEST_STATUSES,
  PRIVACY_REQUEST_TYPE_LABEL,
  PRIVACY_STATUS_LABEL,
} from "@/lib/trust-center-model";

export const Route = createFileRoute("/_authenticated/mranuskhalid/privacy-requests")({
  head: () => ({
    meta: [
      { title: "Privacy Requests — MunchReach Admin" },
      {
        name: "description",
        content: "Review and action data removal and privacy requests submitted from the website.",
      },
    ],
  }),
  component: AdminPrivacyRequestsPage,
});

function AdminPrivacyRequestsPage() {
  const qc = useQueryClient();
  const list = useServerFn(adminListPrivacyRequests);
  const update = useServerFn(adminUpdatePrivacyRequest);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<string>("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-privacy-requests"],
    queryFn: () => list({}),
  });

  const mutation = useMutation({
    mutationFn: (input: { id: string; status: string; adminNotes: string }) =>
      update({
        data: {
          id: input.id,
          status: input.status as (typeof PRIVACY_REQUEST_STATUSES)[number],
          adminNotes: input.adminNotes,
        },
      }),
    onSuccess: () => {
      toast.success("Request updated");
      void qc.invalidateQueries({ queryKey: ["admin-privacy-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visible = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const openCount = rows.filter((r) => r.status === "new" || r.status === "in_review").length;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Privacy requests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Submissions from /remove-my-data. {openCount} open request
            {openCount === 1 ? "" : "s"}.
          </p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {PRIVACY_REQUEST_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {PRIVACY_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">No requests in this view.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {visible.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border/70 bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {PRIVACY_REQUEST_TYPE_LABEL[r.request_type] ?? r.request_type}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {r.name} · {r.email}
                    {r.company ? ` · ${r.company}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Received {new Date(r.created_at).toLocaleString()}
                    {r.handled_at ? ` · handled ${new Date(r.handled_at).toLocaleString()}` : ""}
                  </p>
                </div>
                <Badge variant="outline">{PRIVACY_STATUS_LABEL[r.status] ?? r.status}</Badge>
              </div>

              {r.details ? (
                <p className="mt-3 whitespace-pre-line rounded-lg bg-muted/40 p-3 text-sm">
                  {r.details}
                </p>
              ) : null}

              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <div className="space-y-1.5">
                  <label
                    htmlFor={`notes-${r.id}`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Internal notes
                  </label>
                  <Textarea
                    id={`notes-${r.id}`}
                    rows={2}
                    value={notes[r.id] ?? r.admin_notes ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {PRIVACY_REQUEST_STATUSES.filter((s) => s !== r.status).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={s === "completed" ? "default" : "outline"}
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate({
                          id: r.id,
                          status: s,
                          adminNotes: notes[r.id] ?? r.admin_notes ?? "",
                        })
                      }
                    >
                      {PRIVACY_STATUS_LABEL[s]}
                    </Button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
