import { LEAD_OUTCOME_LABELS, type LeadOutcome } from "@/lib/message-outcomes";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Loader2,
  Pause,
  Play,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LEAD_DELIVERY_LABELS,
  LEAD_DELIVERY_STYLES,
  type LeadDeliveryState,
} from "@/lib/campaign-model";
import {
  addLeadsToCampaign,
  updateCampaignRecipients,
} from "@/lib/campaigns.functions";
import { saveAndDownloadExport } from "@/lib/file-storage";
import { getCampaignLeads, getCampaignMailboxSummary } from "@/lib/campaign-leads.functions";
import { MAILBOX_TYPE_LABELS, MAILBOX_TYPE_ORDER, emailProviderOf } from "@/lib/mailbox-type";
import { MailboxTypeBadge, MailboxTypeIcon } from "./MailboxTypeBadge";
import type { CampaignBuilder } from "./useCampaignBuilder";
import { ListFolderIcon } from "@/components/leads/ListColorPicker";

const ANY = "__any__";
const PAGE_SIZE = 50;

/** Recipient lifecycle values — real columns, so they filter in the database. */
const RECIPIENT_STATUS_OPTIONS = [
  ["pending", "Pending"],
  ["in_progress", "In progress"],
  ["completed", "Completed"],
  ["replied", "Replied"],
  ["bounced", "Bounced"],
  ["unsubscribed", "Unsubscribed"],
  ["failed", "Failed"],
  ["stopped", "Stopped"],
] as const;

const RECIPIENT_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  RECIPIENT_STATUS_OPTIONS.map(([value, label]) => [value, label]),
);

export function LeadsTab({ builder }: { builder: CampaignBuilder }) {
  const { campaignId, lists, accounts } = builder;
  const addFn = useServerFn(addLeadsToCampaign);
  const updateFn = useServerFn(updateCampaignRecipients);
  const fetchLeads = useServerFn(getCampaignLeads);
  const fetchMailboxSummary = useServerFn(getCampaignMailboxSummary);
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addListId, setAddListId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(ANY);
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [location, setLocation] = useState("");
  const [step, setStep] = useState(ANY);
  const [accountId, setAccountId] = useState(ANY);
  const [mailboxType, setMailboxType] = useState(ANY);
  const [page, setPage] = useState(1);

  // Debounce the free-text filters so typing doesn't fire a request per keypress.
  const [debounced, setDebounced] = useState({ search: "", company: "", jobTitle: "", location: "" });
  useEffect(() => {
    const t = setTimeout(() => setDebounced({ search, company, jobTitle, location }), 300);
    return () => clearTimeout(t);
  }, [search, company, jobTitle, location]);

  const filters = {
    campaignId,
    page,
    pageSize: PAGE_SIZE,
    ...(debounced.search ? { search: debounced.search } : {}),
    ...(debounced.company ? { company: debounced.company } : {}),
    ...(debounced.jobTitle ? { jobTitle: debounced.jobTitle } : {}),
    ...(debounced.location ? { location: debounced.location } : {}),
    ...(status !== ANY ? { status: status as "pending" } : {}),
    ...(step !== ANY ? { step: Number(step) } : {}),
    ...(accountId !== ANY ? { accountId } : {}),
    ...(mailboxType !== ANY ? { mailboxType: mailboxType as "google" } : {}),
  };

  // Filters change the population, so go back to the first page.
  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [debounced, status, step, accountId, mailboxType]);

  const leadsQuery = useQuery({
    queryKey: ["campaign-leads-page", filters],
    queryFn: () => fetchLeads({ data: filters }),
    // Realtime drives most updates; this is the safety net for missed events.
    refetchInterval: (query) => (query.state.error ? false : 30_000),
    retry: 1,
    placeholderData: (prev) => prev,
  });

  const mailboxFilters = {
    campaignId,
    ...(debounced.search ? { search: debounced.search } : {}),
    ...(debounced.company ? { company: debounced.company } : {}),
    ...(debounced.jobTitle ? { jobTitle: debounced.jobTitle } : {}),
    ...(debounced.location ? { location: debounced.location } : {}),
    ...(status !== ANY ? { status: status as "pending" } : {}),
    ...(step !== ANY ? { step: Number(step) } : {}),
    ...(accountId !== ANY ? { accountId } : {}),
  };

  // Aggregate-only: counts come from head queries, never from loading leads.
  const mailboxQuery = useQuery({
    queryKey: ["campaign-mailbox-summary", mailboxFilters],
    queryFn: () => fetchMailboxSummary({ data: mailboxFilters }),
    staleTime: 60_000,
    retry: 1,
    placeholderData: (prev) => prev,
  });
  const mailboxCounts = mailboxQuery.data?.counts ?? null;

  const rows = leadsQuery.data?.rows ?? [];
  const total = leadsQuery.data?.total ?? 0;
  const matching = leadsQuery.data?.matching ?? 0;
  const leadsError = (leadsQuery.error as Error | null) ?? null;
  const pageCount = Math.max(1, Math.ceil(matching / PAGE_SIZE));
  const filtersActive =
    Boolean(debounced.search || debounced.company || debounced.jobTitle || debounced.location) ||
    status !== ANY ||
    step !== ANY ||
    accountId !== ANY ||
    mailboxType !== ANY;

  const refetchLeads = async () => {
    await queryClient.invalidateQueries({ queryKey: ["campaign-leads-page"] });
    await queryClient.invalidateQueries({ queryKey: ["campaign-leads", campaignId] });
    await queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
  };

  const add = useMutation({
    mutationFn: () => addFn({ data: { campaignId, listId: addListId } }),
    onSuccess: async (result) => {
      toast.success(
        result.added > 0
          ? `${result.added.toLocaleString()} leads added${result.skipped ? ` (${result.skipped.toLocaleString()} already in the campaign)` : ""}.`
          : "Those leads are already in this campaign.",
      );
      setAddOpen(false);
      setAddListId("");
      await refetchLeads();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulk = useMutation({
    mutationFn: (action: "pause" | "resume" | "remove") =>
      updateFn({ data: { campaignId, recipientIds: selected, action } }),
    onSuccess: async () => {
      toast.success("Leads updated");
      setSelected([]);
      await refetchLeads();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Exports the current page — the browser never holds the whole audience. */
  const exportCsv = async () => {
    const header = "email,first_name,last_name,company,job_title,location,message_outcome,opened,replied,unsubscribed,current_step\n";
    const body = rows
      .map((r) =>
        [
          r.lead?.email ?? "",
          r.lead?.first_name ?? "",
          r.lead?.last_name ?? "",
          r.lead?.company ?? "",
          r.lead?.job_title ?? "",
          r.lead?.country ?? "",
          LEAD_OUTCOME_LABELS[(r.outcome ?? "not_contacted") as LeadOutcome] ?? r.status,
          r.engagement?.opened ? "yes" : "no",
          r.engagement?.replied ? "yes" : "no",
          r.engagement?.unsubscribed ? "yes" : "no",
          r.current_step ?? 0,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    await saveAndDownloadExport({
      content: header + body,
      fileName: `campaign-leads-page-${page}.csv`,
      category: "campaigns",
      campaignId: campaignId ?? null,
    });
  };

  const allChecked = rows.length > 0 && rows.every((r) => selected.includes(r.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{total.toLocaleString()} leads</h2>
          <p className="text-sm text-muted-foreground">
            {matching.toLocaleString()} match the current filters
            {matching > 0 ? ` · showing ${rows.length.toLocaleString()} on page ${page} of ${pageCount}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/leads">
              <Upload className="mr-1.5 size-3.5" /> Import CSV
            </Link>
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 size-3.5" /> Add from list
          </Button>
        </div>
      </div>

      <div className="surface-card grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="md:col-span-2">
          <Label className="text-xs">Search</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, email or company"
          />
        </div>
        <div>
          <Label className="text-xs">Lifecycle</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any lifecycle</SelectItem>
              {RECIPIENT_STATUS_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Company</Label>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme" />
        </div>
        <div>
          <Label className="text-xs">Job title</Label>
          <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Head of" />
        </div>
        <div>
          <Label className="text-xs">Location</Label>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="United States"
          />
        </div>
        <div>
          <Label className="text-xs">Current step</Label>
          <Select value={step} onValueChange={setStep}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any step</SelectItem>
              {[0, 1, 2, 3, 4, 5, 6].map((s) => (
                <SelectItem key={s} value={String(s)}>
                  Step {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Sending account</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any account</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.from_email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Mailboxes Types</Label>
          <Select value={mailboxType} onValueChange={setMailboxType}>
            <SelectTrigger>
              <SelectValue placeholder="Any type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any type</SelectItem>
              {MAILBOX_TYPE_ORDER.map((type) => (
                <SelectItem key={type} value={type}>
                  <span className="inline-flex items-center gap-1.5">
                    <MailboxTypeIcon type={type} />
                    {MAILBOX_TYPE_LABELS[type]}
                    {mailboxCounts ? ` (${mailboxCounts[type].toLocaleString()})` : ""}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setStatus(ANY);
              setCompany("");
              setJobTitle("");
              setLocation("");
              setStep(ANY);
              setAccountId(ANY);
              setMailboxType(ANY);
            }}
          >
            <Filter className="mr-1.5 size-3.5" /> Reset
          </Button>
          <Button variant="ghost" size="sm" onClick={exportCsv}>
            <Download className="mr-1.5 size-3.5" /> Export page
          </Button>
        </div>
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">{selected.length} selected</span>
          <Button size="sm" variant="outline" onClick={() => bulk.mutate("pause")}>
            <Pause className="mr-1.5 size-3.5" /> Pause
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulk.mutate("resume")}>
            <Play className="mr-1.5 size-3.5" /> Resume
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulk.mutate("remove")}>
            <Trash2 className="mr-1.5 size-3.5" /> Remove from campaign
          </Button>
        </div>
      ) : null}

      <div className="surface-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select all leads on this page"
                  checked={allChecked}
                  onCheckedChange={(v) => setSelected(v ? rows.map((r) => r.id) : [])}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Job title</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status / lifecycle</TableHead>
              <TableHead>Step</TableHead>
              <TableHead>Last activity</TableHead>
              <TableHead>Sending account</TableHead>
              <TableHead>Email provider</TableHead>
              <TableHead>Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leadsQuery.isPending ? (
              <TableRow>
                <TableCell colSpan={12} className="py-10 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto mb-2 size-4 animate-spin" />
                  Loading campaign leads...
                </TableCell>
              </TableRow>
            ) : leadsError ? (
              <TableRow>
                <TableCell colSpan={12} className="py-10 text-center text-sm">
                  <p className="text-muted-foreground">Couldn't load campaign leads.</p>
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    onClick={() => void refetchLeads()}
                  >
                    Try again
                  </Button>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="py-10 text-center text-sm text-muted-foreground">
                  {total === 0
                    ? "No leads in this campaign yet. Add them from a lead list."
                    : filtersActive
                      ? "No leads match the current filters."
                      : "No leads on this page."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Checkbox
                      aria-label={`Select ${row.lead?.email ?? "lead"}`}
                      checked={selected.includes(row.id)}
                      onCheckedChange={(v) =>
                        setSelected((prev) =>
                          v ? [...prev, row.id] : prev.filter((id) => id !== row.id),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium">
                    {[row.lead?.first_name, row.lead?.last_name].filter(Boolean).join(" ") || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{row.lead?.email ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{row.lead?.company ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{row.lead?.job_title ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{row.lead?.country ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge
                        variant="secondary"
                        className={`w-fit font-normal ${LEAD_DELIVERY_STYLES[(row.deliveryState ?? "not_contacted") as LeadDeliveryState] ?? ""}`}
                      >
                        {LEAD_DELIVERY_LABELS[
                          (row.deliveryState ?? "not_contacted") as LeadDeliveryState
                        ] ?? row.status}
                      </Badge>
                      {/* Lifecycle value the Lifecycle filter matches on, so the
                          filtered population is always visible in the row. */}
                      <span className="text-xs text-muted-foreground">
                        {RECIPIENT_STATUS_LABELS[row.status as string] ?? row.status}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">{row.current_step ?? 0}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {row.lastEventAt
                      ? new Date(row.lastEventAt).toLocaleString()
                      : row.last_sent_at
                        ? new Date(row.last_sent_at).toLocaleString()
                        : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {accounts.find((a) => a.id === row.sending_account_id)?.from_email ?? "Auto"}
                  </TableCell>
                  <TableCell>
                    <MailboxTypeBadge type={emailProviderOf(row.lead?.email)} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {matching > PAGE_SIZE ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            Page {page} of {pageCount} · {matching.toLocaleString()} leads
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || leadsQuery.isFetching}
              onClick={() => {
                setSelected([]);
                setPage((p) => Math.max(1, p - 1));
              }}
            >
              <ChevronLeft className="mr-1 size-3.5" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount || leadsQuery.isFetching}
              onClick={() => {
                setSelected([]);
                setPage((p) => Math.min(pageCount, p + 1));
              }}
            >
              Next <ChevronRight className="ml-1 size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add leads from a list</DialogTitle>
            <DialogDescription>
              Leads already in this campaign are skipped automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Lead list</Label>
            <Select value={addListId} onValueChange={setAddListId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a list" />
              </SelectTrigger>
              <SelectContent>
                {lists.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    <span className="flex items-center gap-2"><ListFolderIcon color={l.color} />{l.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              onClick={() => add.mutate()}
              disabled={!addListId || add.isPending}
            >
              {add.isPending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
              Add leads
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
