import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Download, Filter, Loader2, Pause, Play, Plus, Trash2, Upload } from "lucide-react";
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
  LEAD_DELIVERY_STATES,
  LEAD_DELIVERY_STYLES,
  type LeadDeliveryState,
} from "@/lib/campaign-model";
import { addLeadsToCampaign, updateCampaignRecipients } from "@/lib/campaigns.functions";
import type { CampaignBuilder } from "./useCampaignBuilder";

const ANY = "__any__";

export function LeadsTab({ builder }: { builder: CampaignBuilder }) {
  const { campaignId, leads, leadsLoading, lists, accounts, refetchLeads } = builder;
  const addFn = useServerFn(addLeadsToCampaign);
  const updateFn = useServerFn(updateCampaignRecipients);

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

  const filtered = useMemo(
    () =>
      leads.filter((row) => {
        const lead = row.lead;
        const haystack = `${lead?.email ?? ""} ${lead?.first_name ?? ""} ${lead?.last_name ?? ""}`;
        if (search && !haystack.toLowerCase().includes(search.toLowerCase())) return false;
        if (status !== ANY && row.status !== status) return false;
        if (company && !(lead?.company ?? "").toLowerCase().includes(company.toLowerCase()))
          return false;
        if (jobTitle && !(lead?.job_title ?? "").toLowerCase().includes(jobTitle.toLowerCase()))
          return false;
        if (location && !(lead?.country ?? "").toLowerCase().includes(location.toLowerCase()))
          return false;
        if (step !== ANY && String(row.current_step) !== step) return false;
        if (accountId !== ANY && row.sending_account_id !== accountId) return false;
        return true;
      }),
    [leads, search, status, company, jobTitle, location, step, accountId],
  );

  const add = useMutation({
    mutationFn: () => addFn({ data: { campaignId, listId: addListId } }),
    onSuccess: async (result) => {
      toast.success(`Added ${result.added} leads (${result.skipped} already in the campaign).`);
      setAddOpen(false);
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

  const exportCsv = () => {
    const header = "email,first_name,last_name,company,job_title,location,status,current_step\n";
    const rows = filtered
      .map((r) =>
        [
          r.lead?.email ?? "",
          r.lead?.first_name ?? "",
          r.lead?.last_name ?? "",
          r.lead?.company ?? "",
          r.lead?.job_title ?? "",
          r.lead?.country ?? "",
          r.status,
          r.current_step,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([header + rows], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "campaign-leads.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const allChecked = filtered.length > 0 && selected.length === filtered.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{leads.length.toLocaleString()} leads</h2>
          <p className="text-sm text-muted-foreground">
            {filtered.length.toLocaleString()} match the current filters
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
            placeholder="Name or email"
          />
        </div>
        <div>
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any status</SelectItem>
              {LEAD_DELIVERY_STATES.map((value) => (
                <SelectItem key={value} value={value}>
                  {LEAD_DELIVERY_LABELS[value]}
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
            }}
          >
            <Filter className="mr-1.5 size-3.5" /> Reset
          </Button>
          <Button variant="ghost" size="sm" onClick={exportCsv}>
            <Download className="mr-1.5 size-3.5" /> Export
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
                  aria-label="Select all leads"
                  checked={allChecked}
                  onCheckedChange={(v) => setSelected(v ? filtered.map((r) => r.id) : [])}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Job title</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Step</TableHead>
              <TableHead>Last activity</TableHead>
              <TableHead>Sending account</TableHead>
              <TableHead>Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leadsLoading ? (
              <TableRow>
                <TableCell colSpan={11} className="py-10 text-center">
                  <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="py-10 text-center text-sm text-muted-foreground">
                  No leads in this campaign yet. Add them from a lead list.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
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
                    <Badge variant="secondary" className="font-normal">
                      {RECIPIENT_STATUS_LABELS[row.status] ?? row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{row.current_step}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {row.last_sent_at ? new Date(row.last_sent_at).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {accounts.find((a) => a.id === row.sending_account_id)?.from_email ?? "Auto"}
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
                    {l.name}
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
