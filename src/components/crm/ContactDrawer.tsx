import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addCrmNote,
  addCrmTask,
  archiveCrmContact,
  deleteCrmContact,
  getCrmContact,
  moveCrmContact,
  setCrmTaskDone,
  upsertCrmContact,
} from "@/lib/crm.functions";
import { contactName, stageColor, type CrmStage } from "@/lib/crm-model";

function when(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type Props = {
  contactId: string | null;
  stages: CrmStage[];
  onClose: () => void;
};

export function ContactDrawer({ contactId, stages, onClose }: Props) {
  const queryClient = useQueryClient();
  const fetchContact = useServerFn(getCrmContact);
  const saveContact = useServerFn(upsertCrmContact);
  const move = useServerFn(moveCrmContact);
  const note = useServerFn(addCrmNote);
  const task = useServerFn(addCrmTask);
  const taskDone = useServerFn(setCrmTaskDone);
  const archive = useServerFn(archiveCrmContact);
  const remove = useServerFn(deleteCrmContact);

  const detail = useQuery({
    queryKey: ["crm-contact", contactId],
    queryFn: () => fetchContact({ data: { id: contactId! } }),
    enabled: Boolean(contactId),
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const [noteBody, setNoteBody] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");

  const d = detail.data;
  const contact = d?.contact;

  useEffect(() => {
    if (!contact) return;
    setForm({
      firstName: contact.first_name ?? "",
      lastName: contact.last_name ?? "",
      email: contact.email,
      phone: contact.phone ?? "",
      company: contact.company ?? "",
      jobTitle: contact.job_title ?? "",
      website: contact.website ?? "",
      city: contact.city ?? "",
      country: contact.country ?? "",
      leadSource: contact.lead_source ?? "",
      dealValue: contact.deal_value != null ? String(contact.deal_value) : "",
      tags: (contact.tags ?? []).join(", "),
    });
  }, [contact?.id, contact]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["crm-contact", contactId] });
    void queryClient.invalidateQueries({ queryKey: ["crm-contacts"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!contact) return;
      await saveContact({
        data: {
          id: contact.id,
          workspaceId: contact.workspace_id,
          email: form["email"]!.trim(),
          firstName: form["firstName"],
          lastName: form["lastName"],
          phone: form["phone"],
          company: form["company"],
          jobTitle: form["jobTitle"],
          website: form["website"],
          city: form["city"],
          country: form["country"],
          leadSource: form["leadSource"],
          dealValue: form["dealValue"] ? Number(form["dealValue"]) : null,
          tags: (form["tags"] ?? "")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        },
      });
    },
    onSuccess: () => {
      toast.success("Contact saved");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={Boolean(contactId)} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        {detail.isLoading || !d || !contact ? (
          <div className="space-y-3 pt-8">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="space-y-1 text-left">
              <SheetTitle className="text-xl">{contactName(contact)}</SheetTitle>
              <p className="text-sm text-muted-foreground">
                {contact.job_title ? `${contact.job_title} · ` : ""}
                {contact.company ?? contact.email}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Select
                  value={contact.stage_id ?? ""}
                  onValueChange={async (stageId) => {
                    try {
                      await move({ data: { leadId: contact.id, stageId } });
                      refresh();
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <SelectTrigger className="h-8 w-[190px]">
                    <SelectValue placeholder="Stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(contact.tags ?? []).map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </SheetHeader>

            <Tabs defaultValue="overview" className="mt-6">
              <TabsList className="w-full">
                <TabsTrigger value="overview" className="flex-1">
                  Overview
                </TabsTrigger>
                <TabsTrigger value="activity" className="flex-1">
                  Activity
                </TabsTrigger>
                <TabsTrigger value="tasks" className="flex-1">
                  Tasks &amp; notes
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6 pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["firstName", "First name"],
                    ["lastName", "Last name"],
                    ["email", "Email"],
                    ["phone", "Phone"],
                    ["company", "Company"],
                    ["jobTitle", "Job title"],
                    ["website", "Website"],
                    ["city", "City"],
                    ["country", "Country"],
                    ["leadSource", "Lead source"],
                    ["dealValue", "Deal value"],
                    ["tags", "Tags (comma separated)"],
                  ].map(([key, label]) => (
                    <div key={key} className="space-y-1.5">
                      <Label className="text-xs">{label}</Label>
                      <Input
                        value={form[key!] ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, [key!]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => save.mutate()} disabled={save.isPending}>
                    {save.isPending ? "Saving…" : "Save changes"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      await archive({ data: { id: contact.id, archived: true } });
                      toast.success("Contact archived");
                      refresh();
                      onClose();
                    }}
                  >
                    Archive
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    onClick={async () => {
                      await remove({ data: { id: contact.id } });
                      toast.success("Contact deleted");
                      refresh();
                      onClose();
                    }}
                  >
                    Delete
                  </Button>
                </div>

                <Separator />
                <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                  <p>Created: {when(contact.created_at)}</p>
                  <p>Last activity: {when(contact.last_activity_at)}</p>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Campaigns</h4>
                  {d.campaigns.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Not in any campaign yet.</p>
                  ) : (
                    d.campaigns.map((c) => (
                      <div
                        key={c.campaign_id}
                        className="rounded-lg border border-border/60 p-3 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">{c.campaign_name}</span>
                          <Badge variant="outline">{c.status}</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          Step {c.current_step ?? 0} · {c.sent} sent · {c.replies} replies
                        </p>
                        <p className="text-muted-foreground">
                          Last email {when(c.last_email_at)} · Next {when(c.next_email_at)}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Conversations</h4>
                  {d.conversations.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No replies yet.</p>
                  ) : (
                    d.conversations.map((c) => (
                      <Link
                        key={c.id}
                        to="/inbox"
                        search={{ conversation: c.id }}
                        className="block rounded-lg border border-border/60 p-3 text-xs hover:border-primary/50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium text-foreground">{c.subject}</span>
                          <Badge variant={c.unread ? "default" : "outline"}>{c.status}</Badge>
                        </div>
                        <p className="mt-1 truncate text-muted-foreground">
                          {c.last_preview ?? "No preview"}
                        </p>
                        <p className="text-muted-foreground">
                          {c.mailbox ?? "—"} · {c.campaign_name ?? "No campaign"} ·{" "}
                          {when(c.last_message_at)}
                        </p>
                      </Link>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="activity" className="pt-4">
                {d.timeline.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No activity yet.
                  </p>
                ) : (
                  <ol className="space-y-3">
                    {d.timeline.map((item) => (
                      <li key={item.id} className="flex gap-3">
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                            item.kind === "note" ? "bg-amber-500" : "bg-primary"
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="text-sm">{item.detail || item.type}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.type.replace(/_/g, " ")} · {when(item.at)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </TabsContent>

              <TabsContent value="tasks" className="space-y-6 pt-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">New task</h4>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      className="flex-1"
                      placeholder="Follow up with…"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                    />
                    <Input
                      type="datetime-local"
                      className="w-[210px]"
                      value={taskDue}
                      onChange={(e) => setTaskDue(e.target.value)}
                    />
                    <Button
                      disabled={!taskTitle.trim()}
                      onClick={async () => {
                        await task({
                          data: {
                            leadId: contact.id,
                            title: taskTitle.trim(),
                            dueAt: taskDue ? new Date(taskDue).toISOString() : null,
                          },
                        });
                        setTaskTitle("");
                        setTaskDue("");
                        refresh();
                      }}
                    >
                      Add
                    </Button>
                  </div>
                  <div className="space-y-2 pt-2">
                    {d.tasks.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No tasks yet.</p>
                    ) : (
                      d.tasks.map((t) => (
                        <label
                          key={t.id}
                          className="flex items-center gap-3 rounded-lg border border-border/60 p-3 text-sm"
                        >
                          <Checkbox
                            checked={t.completed}
                            onCheckedChange={async (checked) => {
                              await taskDone({ data: { id: t.id, completed: Boolean(checked) } });
                              refresh();
                            }}
                          />
                          <span className={t.completed ? "line-through opacity-60" : ""}>
                            {t.title}
                          </span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {t.due_at ? when(t.due_at) : "No due date"}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Notes</h4>
                  <Textarea
                    rows={3}
                    placeholder="Add a note…"
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                  />
                  <Button
                    size="sm"
                    disabled={!noteBody.trim()}
                    onClick={async () => {
                      await note({ data: { leadId: contact.id, body: noteBody.trim() } });
                      setNoteBody("");
                      refresh();
                    }}
                  >
                    Save note
                  </Button>
                  <div className="space-y-2 pt-2">
                    {d.notes.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No notes yet.</p>
                    ) : (
                      d.notes.map((n) => (
                        <div key={n.id} className="rounded-lg border border-border/60 p-3 text-sm">
                          <p className="whitespace-pre-wrap">{n.body}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {when(n.created_at)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="pt-6">
              <span
                className={`inline-flex items-center gap-2 text-xs text-muted-foreground`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    stageColor(
                      stages.find((s) => s.id === contact.stage_id)?.color ?? "slate",
                    ).dot
                  }`}
                />
                {stages.find((s) => s.id === contact.stage_id)?.name ?? "No stage"}
              </span>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
