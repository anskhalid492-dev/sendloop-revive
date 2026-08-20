import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { ContactDrawer } from "@/components/crm/ContactDrawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useCrmRealtime } from "@/hooks/useCrmRealtime";
import {
  createCrmStage,
  deleteCrmStage,
  listCrmContacts,
  listCrmStages,
  moveCrmContact,
  moveCrmContacts,
  updateCrmStage,
  upsertCrmContact,
} from "@/lib/crm.functions";
import { contactName, stageColor, STAGE_COLORS, type CrmContact } from "@/lib/crm-model";

export const Route = createFileRoute("/_authenticated/crm")({
  head: () => ({
    meta: [
      { title: "CRM Pipeline — MunchReach" },
      {
        name: "description",
        content:
          "Track every prospect from first touch to closed won with a live pipeline connected to your campaigns and inbox.",
      },
      { property: "og:title", content: "CRM Pipeline — MunchReach" },
      {
        property: "og:description",
        content: "A live sales pipeline wired to your campaigns, replies and tasks.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CrmPage,
});

const SORTS = [
  { id: "activity", label: "Recently active" },
  { id: "created", label: "Recently added" },
  { id: "reply", label: "Last reply" },
  { id: "task", label: "Next task" },
] as const;

function relative(value: string | null) {
  if (!value) return "No activity yet";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function CrmPage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? null;
  const queryClient = useQueryClient();

  const fetchStages = useServerFn(listCrmStages);
  const fetchContacts = useServerFn(listCrmContacts);
  const move = useServerFn(moveCrmContact);
  const moveMany = useServerFn(moveCrmContacts);
  const addStage = useServerFn(createCrmStage);
  const editStage = useServerFn(updateCrmStage);
  const removeStage = useServerFn(deleteCrmStage);
  const saveContact = useServerFn(upsertCrmContact);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("activity");
  const [tag, setTag] = useState("all");
  const [source, setSource] = useState("all");
  const [openContact, setOpenContact] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkStage, setBulkStage] = useState<string>("");
  const [dropStage, setDropStage] = useState<string | null>(null);
  const [newStageOpen, setNewStageOpen] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("slate");
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [newContact, setNewContact] = useState({ email: "", first: "", last: "", company: "" });

  const stagesQuery = useQuery({
    queryKey: ["crm-stages", workspaceId],
    queryFn: () => fetchStages({ data: { workspaceId: workspaceId! } }),
    enabled: Boolean(workspaceId),
  });

  const contactsQuery = useQuery({
    queryKey: ["crm-contacts", workspaceId, search],
    queryFn: () =>
      fetchContacts({
        data: { workspaceId: workspaceId!, ...(search.trim() ? { search: search.trim() } : {}) },
      }),
    enabled: Boolean(workspaceId),
  });

  useCrmRealtime(workspaceId);

  const stages = stagesQuery.data ?? [];
  const allContacts = contactsQuery.data?.contacts ?? [];

  const tags = useMemo(
    () => [...new Set(allContacts.flatMap((c) => c.tags ?? []))].sort(),
    [allContacts],
  );
  const sources = useMemo(
    () => [...new Set(allContacts.map((c) => c.lead_source).filter(Boolean))].sort() as string[],
    [allContacts],
  );

  const contacts = useMemo(() => {
    const filtered = allContacts.filter(
      (c) =>
        (tag === "all" || (c.tags ?? []).includes(tag)) &&
        (source === "all" || c.lead_source === source),
    );
    const key = (c: CrmContact) =>
      sort === "created"
        ? c.created_at
        : sort === "reply"
          ? (c.lastReplyAt ?? "")
          : sort === "task"
            ? (c.nextTaskAt ?? "")
            : (c.last_activity_at ?? c.created_at);
    return [...filtered].sort((a, b) => (sort === "task" ? 1 : -1) * (key(a) < key(b) ? 1 : -1));
  }, [allContacts, tag, source, sort]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["crm-contacts"] });
    void queryClient.invalidateQueries({ queryKey: ["crm-stages"] });
  };

  async function drop(stageId: string) {
    const leadId = dragging;
    setDragging(null);
    setDropStage(null);
    if (!leadId) return;
    try {
      await move({ data: { leadId, stageId } });
      invalidate();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  const loading = stagesQuery.isLoading || contactsQuery.isLoading;

  return (
    <AppShell
      title="CRM"
      description="Every prospect, reply and follow-up in one live pipeline"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search name, email, company or title"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tag} onValueChange={setTag}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setNewStageOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Stage
          </Button>
          <Button onClick={() => setNewContactOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Contact
          </Button>
        </div>

        {selected.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2">
            <span className="text-sm font-medium">{selected.length} selected</span>
            <Select value={bulkStage} onValueChange={setBulkStage}>
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue placeholder="Move to stage" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!bulkStage}
              onClick={async () => {
                try {
                  const res = await moveMany({ data: { leadIds: selected, stageId: bulkStage } });
                  toast.success(`Moved ${res.moved} contact(s)`);
                  setSelected([]);
                  setBulkStage("");
                  invalidate();
                } catch (error) {
                  toast.error((error as Error).message);
                }
              }}
            >
              Move
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        ) : null}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-72 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {stages.map((stage) => {
              const items = contacts.filter((c) => c.stage_id === stage.id);
              const value = items.reduce((sum, c) => sum + (c.deal_value ?? 0), 0);
              const color = stageColor(stage.color);
              return (
                <section
                  key={stage.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropStage(stage.id);
                  }}
                  onDragLeave={() => setDropStage((s) => (s === stage.id ? null : s))}
                  onDrop={() => void drop(stage.id)}
                  className={`w-[288px] shrink-0 rounded-xl border p-3 transition-colors ${
                    dropStage === stage.id
                      ? "border-primary bg-primary/5"
                      : "border-border/60 bg-card/60"
                  }`}
                >
                  <header className="flex items-center gap-2 px-1">
                    <span className={`h-2.5 w-2.5 rounded-full ${color.dot}`} />
                    <input
                      className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none focus:underline"
                      defaultValue={stage.name}
                      onBlur={async (e) => {
                        const name = e.target.value.trim();
                        if (!name || name === stage.name) return;
                        await editStage({ data: { id: stage.id, name } });
                        invalidate();
                      }}
                    />
                    <Badge variant="secondary">{items.length}</Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground"
                      onClick={async () => {
                        const fallback = stages.find((s) => s.id !== stage.id);
                        try {
                          await removeStage({
                            data: { id: stage.id, moveToStageId: fallback?.id ?? null },
                          });
                          invalidate();
                        } catch (error) {
                          toast.error((error as Error).message);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </header>
                  <p className="px-1 pt-1 text-xs text-muted-foreground">
                    {value > 0 ? `${value.toLocaleString()} in pipeline` : "No value set"}
                  </p>

                  <div className="mt-3 space-y-2">
                    {items.map((c) => (
                      <article
                        key={c.id}
                        draggable
                        onDragStart={() => setDragging(c.id)}
                        onDragEnd={() => setDragging(null)}
                        onClick={() => setOpenContact(c.id)}
                        className={`cursor-pointer rounded-lg border border-border/60 bg-background p-3 shadow-sm transition hover:border-primary/50 ${
                          dragging === c.id ? "opacity-50" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className="pt-0.5"
                            onClick={(e) => e.stopPropagation()}
                            role="presentation"
                          >
                            <Checkbox
                              checked={selected.includes(c.id)}
                              onCheckedChange={(checked) =>
                                setSelected((prev) =>
                                  checked ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                                )
                              }
                              aria-label={`Select ${contactName(c)}`}
                            />
                          </span>
                          <p className="flex-1 truncate text-sm font-medium">{contactName(c)}</p>
                          {c.unreadReplies > 0 ? (
                            <Badge className="shrink-0">{c.unreadReplies} new</Badge>
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.company ?? c.email}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          {(c.tags ?? []).slice(0, 3).map((t) => (
                            <Badge key={t} variant="outline" className="text-[10px]">
                              {t}
                            </Badge>
                          ))}
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{relative(c.last_activity_at)}</span>
                          {c.openTasks > 0 ? <span>{c.openTasks} task(s)</span> : null}
                        </div>
                      </article>
                    ))}
                    {items.length === 0 ? (
                      <p className="py-8 text-center text-xs text-muted-foreground">
                        No contacts yet
                      </p>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <ContactDrawer
        contactId={openContact}
        stages={stages}
        onClose={() => setOpenContact(null)}
      />

      <Dialog open={newStageOpen} onOpenChange={setNewStageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New stage</DialogTitle>
            <DialogDescription>Stages are shared across your workspace.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={newStageName} onChange={(e) => setNewStageName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <Select value={newStageColor} onValueChange={setNewStageColor}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_COLORS.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!newStageName.trim() || !workspaceId}
              onClick={async () => {
                await addStage({
                  data: {
                    workspaceId: workspaceId!,
                    name: newStageName.trim(),
                    color: newStageColor,
                  },
                });
                setNewStageName("");
                setNewStageOpen(false);
                invalidate();
              }}
            >
              Create stage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newContactOpen} onOpenChange={setNewContactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New contact</DialogTitle>
            <DialogDescription>
              Contacts are matched on email, so importing the same person twice never duplicates
              them.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Email</Label>
              <Input
                value={newContact.email}
                onChange={(e) => setNewContact((c) => ({ ...c, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>First name</Label>
              <Input
                value={newContact.first}
                onChange={(e) => setNewContact((c) => ({ ...c, first: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Last name</Label>
              <Input
                value={newContact.last}
                onChange={(e) => setNewContact((c) => ({ ...c, last: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Company</Label>
              <Input
                value={newContact.company}
                onChange={(e) => setNewContact((c) => ({ ...c, company: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!newContact.email.trim() || !workspaceId}
              onClick={async () => {
                try {
                  const result = await saveContact({
                    data: {
                      workspaceId: workspaceId!,
                      email: newContact.email.trim(),
                      firstName: newContact.first,
                      lastName: newContact.last,
                      company: newContact.company,
                      ...(stages[0] ? { stageId: stages[0].id } : {}),
                    },
                  });
                  toast.success(result.created ? "Contact created" : "Existing contact updated");
                  setNewContact({ email: "", first: "", last: "", company: "" });
                  setNewContactOpen(false);
                  invalidate();
                } catch (error) {
                  toast.error((error as Error).message);
                }
              }}
            >
              Save contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
