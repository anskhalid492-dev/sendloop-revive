import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  CRM_STAGES,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_STYLES,
  leadName,
} from "@/lib/lead-model";
import {
  addLeadNote,
  addLeadTask,
  deleteLeadNote,
  getLeadDetail,
  setLeadTaskCompleted,
  updateLead,
} from "@/lib/leads.functions";
import { REPLY_SENTIMENT_LABELS } from "@/lib/reply-model";
import { cn } from "@/lib/utils";


function fmt(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function LeadDetailSheet({
  leadId,
  workspaceId,
  onOpenChange,
}: {
  leadId: string | null;
  workspaceId: string | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const detailFn = useServerFn(getLeadDetail);
  const updateFn = useServerFn(updateLead);
  const noteFn = useServerFn(addLeadNote);
  const deleteNoteFn = useServerFn(deleteLeadNote);
  const taskFn = useServerFn(addLeadTask);
  const toggleTaskFn = useServerFn(setLeadTaskCompleted);

  const [note, setNote] = useState("");
  const [task, setTask] = useState("");
  const [taskDue, setTaskDue] = useState("");

  const detail = useQuery({
    queryKey: ["lead-detail", leadId],
    queryFn: () => detailFn({ data: { id: leadId! } }),
    enabled: Boolean(leadId),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["lead-detail", leadId] });
    void queryClient.invalidateQueries({ queryKey: ["leads"] });
  };

  const setField = useMutation({
    mutationFn: (patch: { status?: string; crm_stage?: string }) =>
      updateFn({ data: { id: leadId!, patch } }),
    onSuccess: () => {
      toast.success("Lead updated");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveNote = useMutation({
    mutationFn: () =>
      noteFn({ data: { leadId: leadId!, workspaceId: workspaceId!, body: note.trim() } }),
    onSuccess: () => {
      setNote("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeNote = useMutation({
    mutationFn: (id: string) => deleteNoteFn({ data: { id } }),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  const saveTask = useMutation({
    mutationFn: () =>
      taskFn({
        data: {
          leadId: leadId!,
          workspaceId: workspaceId!,
          title: task.trim(),
          ...(taskDue ? { dueAt: taskDue } : {}),
        },
      }),
    onSuccess: () => {
      setTask("");
      setTaskDue("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleTask = useMutation({
    mutationFn: (vars: { id: string; completed: boolean }) => toggleTaskFn({ data: vars }),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  const lead = detail.data?.lead;
  const d = detail.data;

  return (
    <Sheet open={Boolean(leadId)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{lead ? leadName(lead) || lead.email : "Lead"}</SheetTitle>
        </SheetHeader>

        {detail.isLoading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : detail.isError ? (
          <div className="p-4">
            <p className="text-sm text-muted-foreground">
              {(detail.error as Error)?.message ?? "Could not load this lead."}
            </p>
            <Button className="mt-3" onClick={() => void detail.refetch()}>
              Retry
            </Button>
          </div>
        ) : lead && d ? (
          <div className="space-y-5 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  LEAD_STATUS_STYLES[lead.status] ?? "bg-muted text-muted-foreground",
                )}
              >
                {LEAD_STATUS_LABELS[lead.status] ?? lead.status}
              </span>
              {(lead.tags ?? []).map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-muted-foreground">Status</Label>
                <Select
                  value={lead.status}
                  onValueChange={(value) => setField.mutate({ status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-muted-foreground">CRM stage</Label>
                <Select
                  value={lead.crm_stage || "none"}
                  onValueChange={(value) => setField.mutate({ crm_stage: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRM_STAGES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Tabs defaultValue="contact">
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="contact">Contact</TabsTrigger>
                <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
                <TabsTrigger value="replies">
                  Replies{d.replies.length ? ` (${d.replies.length})` : ""}
                </TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
                <TabsTrigger value="tasks">Tasks</TabsTrigger>
              </TabsList>


              <TabsContent value="contact" className="space-y-4 pt-4">
                <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                  <Row label="Email" value={lead.email} />
                  <Row label="Phone" value={lead.phone} />
                  <Row label="Company" value={lead.company} />
                  <Row label="Job title" value={lead.job_title} />
                  <Row label="Website" value={lead.website} />
                  <Row label="LinkedIn" value={lead.linkedin_url} />
                  <Row label="City" value={lead.city} />
                  <Row label="State" value={lead.state} />
                  <Row label="Country" value={lead.country} />
                  <Row label="Created" value={fmt(lead.created_at)} />
                  <Row label="Last activity" value={fmt(lead.last_activity_at)} />
                </dl>
                {Object.keys(lead.custom_fields ?? {}).length > 0 ? (
                  <div>
                    <p className="mb-2 text-xs uppercase text-muted-foreground">Custom fields</p>
                    <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                      {Object.entries(lead.custom_fields).map(([key, value]) => (
                        <Row key={key} label={key} value={value} />
                      ))}
                    </dl>
                  </div>
                ) : null}
              </TabsContent>

              <TabsContent value="campaigns" className="space-y-2 pt-4">
                {d.campaigns.length === 0 ? (
                  <Empty text="This lead is not in any campaign yet." />
                ) : (
                  d.campaigns.map((row) => (
                    <div key={row.id} className="rounded-lg border border-border p-3 text-sm">
                      <p className="font-medium">{row.campaigns?.name ?? "Campaign"}</p>
                      <p className="text-muted-foreground">
                        Step {row.current_step + 1} · {row.status} · last sent {fmt(row.last_sent_at)}
                      </p>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="replies" className="space-y-2 pt-4">
                {d.replies.length === 0 ? (
                  <Empty text="No replies from this lead yet." />
                ) : (
                  d.replies.map((r) => (
                    <div key={r.id} className="rounded-lg border border-border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{r.from_email}</p>
                        <span className="text-xs text-muted-foreground">{fmt(r.received_at)}</span>
                      </div>
                      <p className="text-muted-foreground">{r.subject ?? "—"}</p>
                      {r.body ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm">{r.body}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {REPLY_SENTIMENT_LABELS[r.sentiment] ?? r.sentiment}
                        </Badge>
                        {r.campaigns?.name ? (
                          <span className="text-xs text-muted-foreground">{r.campaigns.name}</span>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>


              <TabsContent value="activity" className="space-y-2 pt-4">
                {d.activities.length === 0 ? (
                  <Empty text="No email activity recorded yet." />
                ) : (
                  d.activities.map((a) => (
                    <div key={a.id} className="rounded-lg border border-border p-3 text-sm">
                      <p className="font-medium capitalize">{a.type.replace(/_/g, " ")}</p>
                      {a.detail ? <p className="text-muted-foreground">{a.detail}</p> : null}
                      <p className="text-xs text-muted-foreground">{fmt(a.created_at)}</p>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="notes" className="space-y-3 pt-4">
                <Textarea
                  value={note}
                  maxLength={4000}
                  placeholder="Add a note about this lead"
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={!note.trim() || !workspaceId || saveNote.isPending}
                  onClick={() => saveNote.mutate()}
                >
                  {saveNote.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Save note
                </Button>
                {d.notes.map((n) => (
                  <div key={n.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="whitespace-pre-wrap">{n.body}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete note"
                        onClick={() => removeNote.mutate(n.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{fmt(n.created_at)}</p>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="tasks" className="space-y-3 pt-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={task}
                    maxLength={200}
                    placeholder="Follow up with…"
                    onChange={(e) => setTask(e.target.value)}
                  />
                  <Input
                    type="date"
                    value={taskDue}
                    className="sm:w-44"
                    onChange={(e) => setTaskDue(e.target.value)}
                  />
                  <Button
                    disabled={!task.trim() || !workspaceId || saveTask.isPending}
                    onClick={() => saveTask.mutate()}
                  >
                    Add
                  </Button>
                </div>
                {d.tasks.length === 0 ? (
                  <Empty text="No tasks for this lead." />
                ) : (
                  d.tasks.map((t) => (
                    <label
                      key={t.id}
                      className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm"
                    >
                      <Checkbox
                        checked={t.completed}
                        onCheckedChange={(value) =>
                          toggleTask.mutate({ id: t.id, completed: Boolean(value) })
                        }
                      />
                      <span className={cn(t.completed && "text-muted-foreground line-through")}>
                        {t.title}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {t.due_at ? fmt(t.due_at) : ""}
                      </span>
                    </label>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className="truncate">{value || "—"}</dd>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{text}</p>;
}
