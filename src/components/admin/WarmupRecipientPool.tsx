/**
 * Admin warmup recipient pool.
 *
 * These mailboxes are the platform's dedicated warmup network. They are kept
 * completely separate from customer campaign leads: the warmup engine only
 * ever mails this pool (or other warmup mailboxes), never a customer lead.
 */
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Ban, CheckCircle2, History, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EmptyState,
  LoadingRows,
  Pill,
  SearchInput,
  StatCard,
  fmtDate,
  num,
} from "@/components/app/admin/OutreachUI";
import {
  adminAddWarmupRecipient,
  adminImportWarmupRecipients,
  adminListWarmupPool,
  adminWarmupRecipientBulk,
  adminWarmupRecipientControl,
  adminWarmupRecipientHistory,
} from "@/lib/warmup-pool.functions";

export function WarmupRecipientPool() {
  const queryClient = useQueryClient();
  const listPool = useServerFn(adminListWarmupPool);
  const importFn = useServerFn(adminImportWarmupRecipients);
  const addFn = useServerFn(adminAddWarmupRecipient);
  const controlFn = useServerFn(adminWarmupRecipientControl);
  const historyFn = useServerFn(adminWarmupRecipientHistory);
  const bulkFn = useServerFn(adminWarmupRecipientBulk);

  const [search, setSearch] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const poolQuery = useQuery({
    queryKey: ["admin", "warmup-pool", search.trim()],
    queryFn: () => listPool({ data: { search: search.trim() || null } }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "warmup-pool"] });

  const importMutation = useMutation({
    mutationFn: (csv: string) => importFn({ data: { csv } }),
    onSuccess: async (r: {
      total: number;
      imported: number;
      duplicates: number;
      invalid: number;
      failed: number;
    }) => {
      toast.success(
        `Imported ${r.imported} of ${r.total} row(s)` +
          (r.duplicates ? ` · ${r.duplicates} duplicate` : "") +
          (r.invalid ? ` · ${r.invalid} invalid` : "") +
          (r.failed ? ` · ${r.failed} failed` : ""),
      );
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const addMutation = useMutation({
    mutationFn: () => addFn({ data: { email: email.trim(), name: name.trim() || null } }),
    onSuccess: async () => {
      setEmail("");
      setName("");
      toast.success("Recipient added to the warmup pool");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const controlMutation = useMutation({
    mutationFn: (vars: { id: string; action: "enable" | "disable" | "remove" }) =>
      controlFn({ data: vars }),
    onSuccess: async () => {
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkMutation = useMutation({
    mutationFn: (action: "enable" | "disable" | "remove") =>
      bulkFn({ data: { ids: selected, action } }),
    onSuccess: async (r: { affected: number }, action) => {
      toast.success(
        `${action === "remove" ? "Removed" : action === "enable" ? "Enabled" : "Disabled"} ${r.affected} recipient(s)`,
      );
      setSelected([]);
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const historyQuery = useQuery({
    queryKey: ["admin", "warmup-pool", "history", historyId],
    queryFn: () => historyFn({ data: { id: historyId! } }),
    enabled: Boolean(historyId),
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    importMutation.mutate(text);
    if (fileRef.current) fileRef.current.value = "";
  };

  const data = poolQuery.data;
  const rows = data?.recipients ?? [];
  const selectedSet = new Set(selected);
  const visibleIds = rows.map((r) => r.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
  const someSelected = selected.length > 0;

  const toggleAll = (checked: boolean) =>
    setSelected(checked ? visibleIds : []);
  const toggleOne = (id: string, checked: boolean) =>
    setSelected((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Warmup recipients" value={num(data?.totals.total ?? 0)} />
        <StatCard label="Active" value={num(data?.totals.active ?? 0)} />
        <StatCard label="Disabled" value={num(data?.totals.disabled ?? 0)} />
        <StatCard label="Bounced" value={num(data?.totals.bounced ?? 0)} />
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold">Add recipients</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Upload a CSV (one recipient per line: email, name, mailbox provider) or add a single
          mailbox. Campaign leads are never used for warmup.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="warmup@example.com"
            className="w-64"
          />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            className="w-48"
          />
          <Button
            onClick={() => addMutation.mutate()}
            disabled={!email.trim() || addMutation.isPending}
          >
            Add recipient
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={importMutation.isPending}
          >
            <Upload className="mr-1.5 size-4" /> Upload CSV
          </Button>
        </div>
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Search recipient" />

      {someSelected ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-3">
          <span className="text-sm font-medium">{selected.length} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={bulkMutation.isPending}
              onClick={() => bulkMutation.mutate("enable")}
            >
              <CheckCircle2 className="mr-1.5 size-3.5" /> Enable
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkMutation.isPending}
              onClick={() => bulkMutation.mutate("disable")}
            >
              <Ban className="mr-1.5 size-3.5" /> Disable
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={bulkMutation.isPending}
              onClick={() => bulkMutation.mutate("remove")}
            >
              <Trash2 className="mr-1.5 size-3.5" /> Remove
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border bg-card">
        {poolQuery.isLoading ? (
          <LoadingRows />
        ) : poolQuery.isError ? (
          <EmptyState message={(poolQuery.error as Error).message} />
        ) : rows.length === 0 ? (
          <EmptyState message="No warmup recipients yet. Upload a CSV to build the pool." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) => toggleAll(v === true)}
                    aria-label="Select all recipients"
                  />
                </TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Bounced</TableHead>
                <TableHead className="text-right">Replied</TableHead>
                <TableHead>Last send</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} data-state={selectedSet.has(r.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selectedSet.has(r.id)}
                      onCheckedChange={(v) => toggleOne(r.id, v === true)}
                      aria-label={`Select ${r.email}`}
                    />
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{r.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.name ?? "—"}
                      {r.mailboxProvider ? ` · ${r.mailboxProvider}` : ""}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Pill
                      tone={
                        r.status === "bounced" ? "bad" : r.enabled ? "good" : "muted"
                      }
                    >
                      {r.status === "bounced" ? "bounced" : r.enabled ? "active" : "disabled"}
                    </Pill>
                    {r.lastError ? (
                      <p className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">
                        {r.lastError}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{num(r.sentCount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(r.receivedCount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(r.bounceCount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(r.replyCount)}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(r.lastSentAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label="View history"
                        onClick={() => setHistoryId(r.id)}
                      >
                        <History className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={r.enabled ? "Disable recipient" : "Enable recipient"}
                        onClick={() =>
                          controlMutation.mutate({
                            id: r.id,
                            action: r.enabled ? "disable" : "enable",
                          })
                        }
                      >
                        {r.enabled ? (
                          <Ban className="size-3.5" />
                        ) : (
                          <CheckCircle2 className="size-3.5" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label="Remove recipient"
                        onClick={() => controlMutation.mutate({ id: r.id, action: "remove" })}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Sheet open={Boolean(historyId)} onOpenChange={(open) => !open && setHistoryId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Recipient history</SheetTitle>
          </SheetHeader>
          <div className="mt-4 px-4 pb-8">
            {historyQuery.isLoading ? (
              <LoadingRows />
            ) : (historyQuery.data ?? []).length === 0 ? (
              <EmptyState message="No warmup messages sent to this recipient yet." />
            ) : (
              <ul className="space-y-2 text-sm">
                {(historyQuery.data ?? []).map((h) => (
                  <li key={h.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{h.fromEmail}</p>
                      <Pill
                        tone={
                          h.status === "failed" ? "bad" : h.status === "queued" ? "muted" : "good"
                        }
                      >
                        {h.status}
                      </Pill>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(h.sentAt ?? h.createdAt)}
                      {h.placement && h.placement !== "pending" ? ` · ${h.placement}` : ""}
                    </p>
                    {h.error ? <p className="mt-1 text-xs text-destructive">{h.error}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
