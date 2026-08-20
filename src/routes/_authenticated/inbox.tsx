import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCheck, Inbox as InboxIcon, Menu, PenSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { CONVERSATION_STATUSES, type InboxFolder } from "@/lib/inbox-model";
import {
  deleteDraft,
  getInboxCounts,
  getInboxFacets,
  listConversations,
  listDrafts,
  markAllConversationsRead,
} from "@/lib/inbox.functions";
import { ComposeDialog, type ComposeSeed } from "@/components/inbox/ComposeDialog";
import { ConversationList } from "@/components/inbox/ConversationList";
import { ConversationView } from "@/components/inbox/ConversationView";
import { InboxSidebar } from "@/components/inbox/InboxSidebar";
import { useInboxRealtime } from "@/hooks/useInboxRealtime";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({
    meta: [
      { title: "Unified Inbox — Sendloop" },
      {
        name: "description",
        content:
          "Every cold email reply from your managed mailboxes in one shared, searchable Sendloop inbox.",
      },
      { property: "og:title", content: "Unified Inbox — Sendloop" },
      {
        property: "og:description",
        content:
          "Every cold email reply from your managed mailboxes in one shared, searchable Sendloop inbox.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { conversation?: string | undefined } => ({
    conversation: typeof search["conversation"] === "string" ? search["conversation"] : undefined,
  }),
  component: Page,
});

type Filters = {
  statuses: string[];
  campaignIds: string[];
  accountIds: string[];
  tags: string[];
  assignedTo: string | null;
  unreadOnly: boolean;
  fromDate: string;
  toDate: string;
};

const EMPTY_FILTERS: Filters = {
  statuses: [],
  campaignIds: [],
  accountIds: [],
  tags: [],
  assignedTo: null,
  unreadOnly: false,
  fromDate: "",
  toDate: "",
};

function Page() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? null;
  const queryClient = useQueryClient();

  const fetchList = useServerFn(listConversations);
  const fetchCounts = useServerFn(getInboxCounts);
  const fetchFacets = useServerFn(getInboxFacets);
  const markAllRead = useServerFn(markAllConversationsRead);
  const fetchDrafts = useServerFn(listDrafts);
  const removeDraft = useServerFn(deleteDraft);


  const [folder, setFolder] = useState<InboxFolder>("inbox");
  const [tab, setTab] = useState<"primary" | "other">("primary");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const { conversation: linkedConversationId } = Route.useSearch();
  const [selectedId, setSelectedId] = useState<string | null>(linkedConversationId ?? null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSeed, setComposeSeed] = useState<ComposeSeed>({});
  const [me, setMe] = useState<{ name: string | null; email: string | null }>({
    name: null,
    email: null,
  });

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setMe({
        name: (data.user?.user_metadata?.["full_name"] as string | undefined) ?? null,
        email: data.user?.email ?? null,
      });
    });
    return () => {
      active = false;
    };
  }, []);

  const openCompose = useCallback((seed: ComposeSeed) => {
    setComposeSeed(seed);
    setComposeOpen(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Primary/Other split only applies to the general folders; status views are
  // already scoped to a single status.
  const tabbedFolder = folder === "inbox" || folder === "unread" || folder === "all";
  const tabStatuses = useMemo(() => {
    if (!tabbedFolder || filters.statuses.length) return undefined;
    return tab === "primary"
      ? ["lead", "interested", "meeting_booked", "meeting_completed", "won"]
      : ["not_interested", "ooo", "unsubscribed", "bounced"];
  }, [tab, tabbedFolder, filters.statuses.length]);

  const listKey = ["conversations", workspaceId, folder, search, filters, tabStatuses];

  const listQuery = useInfiniteQuery({
    queryKey: listKey,
    enabled: Boolean(workspaceId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchList({
        data: {
          workspaceId: workspaceId!,
          folder,
          search: search || undefined,
          statuses: filters.statuses.length
            ? (filters.statuses as never)
            : ((tabStatuses as never) ?? undefined),
          campaignIds: filters.campaignIds.length ? filters.campaignIds : undefined,
          accountIds: filters.accountIds.length ? filters.accountIds : undefined,
          tags: filters.tags.length ? filters.tags : undefined,
          assignedTo: filters.assignedTo ?? undefined,
          unreadOnly: filters.unreadOnly || undefined,
          fromDate: filters.fromDate || undefined,
          toDate: filters.toDate || undefined,
          cursor: pageParam,
          limit: 25,
        },
      }),

    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const countsQuery = useQuery({
    queryKey: ["inbox-counts", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => fetchCounts({ data: { workspaceId: workspaceId! } }),
  });

  const draftsQuery = useQuery({
    queryKey: ["inbox-drafts", workspaceId],
    enabled: Boolean(workspaceId) && folder === "drafts",
    queryFn: () => fetchDrafts({ data: { workspaceId: workspaceId! } }),
  });

  const facetsQuery = useQuery({
    queryKey: ["inbox-facets", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => fetchFacets({ data: { workspaceId: workspaceId! } }),
  });

  const items = useMemo(
    () => (listQuery.data?.pages ?? []).flatMap((page) => page.items),
    [listQuery.data],
  );

  const refreshAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["conversations", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["inbox-counts", workspaceId] });
  }, [queryClient, workspaceId]);

  // Live updates: new replies, status changes and teammate actions land without
  // a refresh, with a polling fallback if the socket drops.
  const { status: liveStatus } = useInboxRealtime({
    workspaceId,
    selectedId,
    onNewReply: ({ conversationId }: { conversationId: string | null }) => {
      toast.message("New reply received", {
        description: "A prospect just replied — the thread is updated.",
        ...(conversationId
          ? { action: { label: "Open", onClick: () => setSelectedId(conversationId) } }
          : {}),
      });
    },
  });

  useEffect(() => {
    if (linkedConversationId) setSelectedId(linkedConversationId);
  }, [linkedConversationId]);

  useEffect(() => {
    if (selectedId && !items.some((item) => item.id === selectedId)) return;
    if (!selectedId && items.length) setSelectedId(items[0]!.id);
  }, [items, selectedId]);

  const activeFilterCount =
    filters.statuses.length +
    filters.campaignIds.length +
    filters.accountIds.length +
    filters.tags.length +
    (filters.assignedTo ? 1 : 0) +
    (filters.unreadOnly ? 1 : 0) +
    (filters.fromDate ? 1 : 0) +
    (filters.toDate ? 1 : 0);

  const toggle = (key: keyof Filters, value: string) =>
    setFilters((prev) => {
      const list = prev[key] as string[];
      return {
        ...prev,
        [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
      };
    });

  const facets = facetsQuery.data;

  const draftsPane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-medium">Drafts</span>
        <Button size="sm" variant="ghost" onClick={() => openCompose({})}>
          <PenSquare className="mr-2 h-4 w-4" /> New
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {(draftsQuery.data?.drafts ?? []).length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No drafts yet. Start an email and save it to come back later.
          </p>
        ) : (
          (draftsQuery.data?.drafts ?? []).map((draft: any) => (
            <div
              key={draft.id}
              className="flex items-start gap-2 border-b border-border px-3 py-3 text-left hover:bg-muted/50"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() =>
                  openCompose({
                    draftId: draft.id,
                    to: draft.to_email ?? "",
                    cc: (draft.cc_emails ?? []).join(", "),
                    bcc: (draft.bcc_emails ?? []).join(", "),
                    subject: draft.subject ?? "",
                    body: draft.body ?? "",
                    sendingAccountId: draft.sending_account_id,
                  })
                }
              >
                <p className="truncate text-sm font-medium">
                  {draft.subject || "(no subject)"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {draft.to_email || "No recipient"}
                </p>
              </button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Delete draft"
                onClick={() =>
                  removeDraft({ data: { id: draft.id } })
                    .then(() => {
                      toast.success("Draft deleted");
                      void draftsQuery.refetch();
                    })
                    .catch(() => toast.error("Couldn’t delete that draft."))
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const listPane = (
    <ConversationList
      items={items}
      selectedId={selectedId}
      search={searchInput}
      onSearch={setSearchInput}
      onSelect={setSelectedId}
      onOpenFilters={() => setFiltersOpen(true)}
      onRefresh={() => {
        void listQuery.refetch();
        void countsQuery.refetch();
      }}
      onLoadMore={() => {
        if (listQuery.hasNextPage && !listQuery.isFetchingNextPage) void listQuery.fetchNextPage();
      }}
      hasMore={Boolean(listQuery.hasNextPage)}
      isLoading={listQuery.isLoading}
      isFetchingMore={listQuery.isFetchingNextPage}
      isError={listQuery.isError}
      liveStatus={liveStatus}
      activeFilterCount={activeFilterCount}
      emptyTitle={search || activeFilterCount ? "No matching conversations" : "No replies yet"}
      emptyBody={
        search || activeFilterCount
          ? "Try a different search or clear your filters."
          : "Replies from your campaigns will automatically appear here."
      }
      readyNote="Your inbox is ready. New replies will appear here automatically."
      {...(tabbedFolder ? { tab, onTabChange: setTab } : {})}
      footerNote={
        items.length
          ? `${items.length} shown${listQuery.hasNextPage ? " · scroll for more" : ""} · threaded across ${
              (facets?.accounts ?? []).length || 1
            } mailbox${((facets?.accounts ?? []).length || 1) === 1 ? "" : "es"}`
          : undefined
      }
    />
  );

  const sidebar = (onNavigate?: () => void) => (
    <InboxSidebar
      folder={folder}
      counts={countsQuery.data ?? {}}
      onSelect={(next) => {
        setFolder(next);
        setSelectedId(null);
        onNavigate?.();
      }}
      onCompose={() => {
        openCompose({});
        onNavigate?.();
      }}
      accounts={facets?.accounts ?? []}
      selectedAccountIds={filters.accountIds}
      onToggleAccount={(id) => toggle("accountIds", id)}
      userName={me.name}
      userEmail={me.email}
    />
  );

  return (
    <AppShell title="Unified Inbox">
      <div className="flex h-[calc(100vh-8rem)] min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 lg:hidden">
          <Sheet open={foldersOpen} onOpenChange={setFoldersOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <Menu className="mr-2 h-4 w-4" /> Folders
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="p-4 pb-0">
                <SheetTitle>Folders</SheetTitle>
              </SheetHeader>
              <div className="h-[calc(100%-4rem)]">{sidebar(() => setFoldersOpen(false))}</div>
            </SheetContent>
          </Sheet>
          <Button variant="outline" size="sm" onClick={() => openCompose({})}>
            <PenSquare className="mr-2 h-4 w-4" /> Compose
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() =>
              markAllRead({ data: { workspaceId: workspaceId! } })
                .then(() => {
                  toast.success("Inbox marked as read");
                  refreshAll();
                })
                .catch(() => toast.error("Couldn’t mark everything as read."))
            }
          >
            <CheckCheck className="mr-2 h-4 w-4" /> Mark all read
          </Button>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="hidden w-60 shrink-0 flex-col border-r border-border bg-muted/30 lg:flex">
            <div className="min-h-0 flex-1">{sidebar()}</div>
            <div className="border-t border-border p-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={!workspaceId}
                onClick={() =>
                  markAllRead({ data: { workspaceId: workspaceId! } })
                    .then(() => {
                      toast.success("Inbox marked as read");
                      refreshAll();
                    })
                    .catch(() => toast.error("Couldn’t mark everything as read."))
                }
              >
                <CheckCheck className="mr-2 h-4 w-4" /> Mark all read
              </Button>
            </div>
          </div>

          <div
            className={`min-h-0 w-full shrink-0 border-r border-border md:w-[320px] xl:w-[380px] ${
              selectedId ? "hidden md:block" : "block"
            }`}
          >
            {folder === "drafts" ? draftsPane : listPane}
          </div>


          <div className={`min-h-0 min-w-0 flex-1 ${selectedId ? "block" : "hidden md:block"}`}>
            {selectedId && workspaceId ? (
              <ConversationView
                key={selectedId}
                conversationId={selectedId}
                workspaceId={workspaceId}
                members={facets?.members ?? []}
                onBack={() => setSelectedId(null)}
                onChanged={refreshAll}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
                <InboxIcon className="h-8 w-8 text-muted-foreground" />
                <h2 className="text-sm font-medium">Select a conversation</h2>
                <p className="text-sm text-muted-foreground">
                  Pick a thread to read the full history and reply from the mailbox that sent it.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        workspaceId={workspaceId ?? null}
        seed={composeSeed}
        onSent={(conversationId) => {
          setFolder("all");
          setSelectedId(conversationId);
          refreshAll();
        }}
      />

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-6">
            <section>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">Status</h3>
              <div className="mt-2 space-y-2">
                {CONVERSATION_STATUSES.map((status) => (
                  <label key={status.value} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={filters.statuses.includes(status.value)}
                      onCheckedChange={() => toggle("statuses", status.value)}
                    />
                    {status.label}
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">Campaign</h3>
              <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">
                {(facets?.campaigns ?? []).map((campaign) => (
                  <label key={campaign.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={filters.campaignIds.includes(campaign.id)}
                      onCheckedChange={() => toggle("campaignIds", campaign.id)}
                    />
                    <span className="truncate">{campaign.name}</span>
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                Sending account
              </h3>
              <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">
                {(facets?.accounts ?? []).map((account) => (
                  <label key={account.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={filters.accountIds.includes(account.id)}
                      onCheckedChange={() => toggle("accountIds", account.id)}
                    />
                    <span className="truncate">{account.from_email}</span>
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">Tags</h3>
              <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">
                {(facets?.tags ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tags yet.</p>
                ) : (
                  (facets?.tags ?? []).map((tag) => (
                    <label key={tag} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={filters.tags.includes(tag)}
                        onCheckedChange={() => toggle("tags", tag)}
                      />
                      #{tag}
                    </label>
                  ))
                )}
              </div>
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">Assignee</h3>
              <div className="mt-2 space-y-2">
                {(facets?.members ?? []).map((member) => (
                  <label key={member.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={filters.assignedTo === member.id}
                      onCheckedChange={(checked) =>
                        setFilters((prev) => ({
                          ...prev,
                          assignedTo: checked ? member.id : null,
                        }))
                      }
                    />
                    {member.name}
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={filters.unreadOnly}
                  onCheckedChange={(checked) =>
                    setFilters((prev) => ({ ...prev, unreadOnly: Boolean(checked) }))
                  }
                />
                Unread only
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="from-date" className="text-xs">
                    From
                  </Label>
                  <Input
                    id="from-date"
                    type="date"
                    value={filters.fromDate}
                    onChange={(event) =>
                      setFilters((prev) => ({ ...prev, fromDate: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="to-date" className="text-xs">
                    To
                  </Label>
                  <Input
                    id="to-date"
                    type="date"
                    value={filters.toDate}
                    onChange={(event) =>
                      setFilters((prev) => ({ ...prev, toDate: event.target.value }))
                    }
                  />
                </div>
              </div>
            </section>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear all
              </Button>
              <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
                Apply
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}
