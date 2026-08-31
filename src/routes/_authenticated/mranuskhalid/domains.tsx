import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AdminPageHeader,
  DetailGrid,
  EmptyState,
  FilterBar,
  FilterSelect,
  LoadingRows,
  Pill,
  SearchInput,
  StatCard,
  fmtDate,
  num,
  type Tone,
} from "@/components/app/admin/OutreachUI";
import {
  adminGetDomain,
  adminListDomains,
  adminOutreachFilters,
  adminRecheckDomainDns,
  adminSetDomainEnabled,
} from "@/lib/admin-outreach.functions";

export const Route = createFileRoute("/_authenticated/mranuskhalid/domains")({
  head: () => ({
    meta: [
      { title: "Sending Domains — MunchReach Admin" },
      {
        name: "description",
        content:
          "Every customer sending domain with live SPF, DKIM, DMARC and MX verification state, required DNS records and re-check controls.",
      },
    ],
  }),
  component: AdminDomainsPage,
});

const DNS_STATUSES = ["verified", "pending", "failed"];

function dnsTone(status: string | null): Tone {
  if (status === "verified") return "good";
  if (status === "failed") return "bad";
  return "warn";
}

function AdminDomainsPage() {
  const queryClient = useQueryClient();
  const listDomains = useServerFn(adminListDomains);
  const getDomain = useServerFn(adminGetDomain);
  const recheck = useServerFn(adminRecheckDomainDns);
  const loadFilters = useServerFn(adminOutreachFilters);

  const [search, setSearch] = useState("");
  const [workspace, setWorkspace] = useState("all");
  const [status, setStatus] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const options = useQuery({
    queryKey: ["admin", "outreach", "filters"],
    queryFn: () => loadFilters(),
  });

  const filters = {
    workspaceId: workspace === "all" ? null : workspace,
    status: status === "all" ? null : status,
    search: search.trim() || null,
  };

  const domainsQuery = useQuery({
    queryKey: ["admin", "outreach", "domains", filters],
    queryFn: () => listDomains({ data: filters }),
  });

  const detailQuery = useQuery({
    queryKey: ["admin", "outreach", "domain", openId],
    queryFn: () => getDomain({ data: { domainId: openId! } }),
    enabled: Boolean(openId),
  });

  const setEnabled = useServerFn(adminSetDomainEnabled);
  const enabledMutation = useMutation({
    mutationFn: (vars: { domainId: string; enabled: boolean }) => setEnabled({ data: vars }),
    onSuccess: (result: any) => {
      toast.success(result.enabled ? "Domain enabled" : "Domain disabled");
      void queryClient.invalidateQueries({ queryKey: ["admin", "outreach"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recheckMutation = useMutation({
    mutationFn: (domainId: string) => recheck({ data: { domainId } }),
    onSuccess: (result: any) => {
      if (result.status === "verified") toast.success("Domain verified");
      else toast.error(result.errors?.[0] ?? "DNS records are not verified yet");
      void queryClient.invalidateQueries({ queryKey: ["admin", "outreach"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = domainsQuery.data ?? [];
  const verified = rows.filter((r: any) => r.status === "verified").length;
  const failing = rows.filter((r: any) => r.status === "failed").length;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Sending Domains"
        description="Domain authentication across every workspace. Re-checking runs live DNS lookups — MunchReach never creates or edits a customer's DNS records."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Domains" value={num(rows.length)} />
        <StatCard label="Verified" value={num(verified)} />
        <StatCard label="Failing" value={num(failing)} />
        <StatCard label="Pending" value={num(rows.length - verified - failing)} />
      </div>

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search domain" />
        <FilterSelect
          value={workspace}
          onChange={setWorkspace}
          allLabel="All workspaces"
          options={(options.data?.workspaces ?? []).map((w: any) => ({
            value: w.id,
            label: w.name,
          }))}
        />
        <FilterSelect
          value={status}
          onChange={setStatus}
          allLabel="All statuses"
          width="w-40"
          options={DNS_STATUSES.map((s) => ({ value: s, label: s }))}
        />
      </FilterBar>

      <div className="rounded-xl border bg-card">
        {domainsQuery.isLoading ? (
          <LoadingRows />
        ) : domainsQuery.isError ? (
          <EmptyState message={(domainsQuery.error as Error).message} />
        ) : rows.length === 0 ? (
          <EmptyState message="No domains match these filters." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>SPF</TableHead>
                <TableHead>DKIM</TableHead>
                <TableHead>DMARC</TableHead>
                <TableHead>MX</TableHead>
                <TableHead className="text-right">Mailboxes</TableHead>
                <TableHead>Last checked</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row: any) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => setOpenId(row.id)}>
                  <TableCell className="font-medium">{row.domain}</TableCell>
                  <TableCell className="text-muted-foreground">{row.workspaceName}</TableCell>
                  <TableCell>
                    <Pill tone={dnsTone(row.status)}>{row.status}</Pill>
                  </TableCell>
                  <TableCell>
                    <Pill tone={dnsTone(row.spf)}>{row.spf ?? "pending"}</Pill>
                  </TableCell>
                  <TableCell>
                    <Pill tone={dnsTone(row.dkim)}>{row.dkim ?? "pending"}</Pill>
                  </TableCell>
                  <TableCell>
                    <Pill tone={dnsTone(row.dmarc)}>{row.dmarc ?? "pending"}</Pill>
                  </TableCell>
                  <TableCell>
                    <Pill tone={dnsTone(row.mx)}>{row.mx ?? "pending"}</Pill>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{num(row.mailboxes)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {fmtDate(row.lastCheckedAt)}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={recheckMutation.isPending}
                      onClick={() => recheckMutation.mutate(row.id)}
                      aria-label="Re-check DNS"
                    >
                      <RefreshCw className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Sheet open={Boolean(openId)} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>{detailQuery.data?.domain.domain ?? "Domain"}</SheetTitle>
          </SheetHeader>
          {detailQuery.isLoading ? (
            <LoadingRows />
          ) : detailQuery.isError ? (
            <EmptyState message={(detailQuery.error as Error).message} />
          ) : detailQuery.data ? (
            <DomainDetail
              data={detailQuery.data}
              onRecheck={() => recheckMutation.mutate(detailQuery.data.domain.id)}
              rechecking={recheckMutation.isPending}
              onToggleEnabled={(enabled) =>
                enabledMutation.mutate({ domainId: detailQuery.data.domain.id, enabled })
              }
              toggling={enabledMutation.isPending}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DomainDetail({
  data,
  onRecheck,
  rechecking,
  onToggleEnabled,
  toggling,
}: {
  data: any;
  onRecheck: () => void;
  rechecking: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  toggling: boolean;
}) {
  const d = data.domain;
  const disabled = Boolean(d.disabledAt);
  return (
    <div className="mt-4 space-y-5 px-4 pb-8">
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" disabled={rechecking} onClick={onRecheck}>
          <RefreshCw className="mr-2 size-3.5" /> Re-run verification
        </Button>
        <Button
          size="sm"
          variant={disabled ? "default" : "outline"}
          disabled={toggling}
          onClick={() => onToggleEnabled(disabled)}
        >
          {disabled ? "Enable domain" : "Disable domain"}
        </Button>
      </div>

      <DetailGrid
        items={[
          { label: "Workspace", value: d.workspaceName },
          { label: "Status", value: <Pill tone={dnsTone(d.status)}>{d.status}</Pill> },
          { label: "Stage", value: d.stage ?? "—" },
          { label: "Provider", value: d.provider ?? "auto" },
          { label: "Provider status", value: d.providerStatus ?? "—" },
          { label: "Registrar", value: d.registrar ?? "—" },
          { label: "Tracking host", value: d.trackingHost ?? "—" },
          { label: "Last checked", value: fmtDate(d.lastCheckedAt) },
          { label: "Verified", value: fmtDate(d.verifiedAt) },
        ]}
      />

      {d.lastError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {d.lastError}
        </div>
      ) : null}

      <Tabs defaultValue="records">
        <TabsList>
          <TabsTrigger value="records">DNS records</TabsTrigger>
          <TabsTrigger value="mailboxes">Mailboxes</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="records" className="space-y-2 pt-3">
          {data.records.map((r: any) => (
            <div key={`${r.kind}-${r.name}`} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium uppercase">{r.kind}</p>
                <Pill tone={dnsTone(r.status)}>{r.status}</Pill>
              </div>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                {r.type} {r.name}
              </p>
              <p className="mt-1 break-all font-mono text-xs">{r.value}</p>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="mailboxes" className="pt-3">
          {data.mailboxes.length === 0 ? (
            <EmptyState message="No mailboxes use this domain." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.mailboxes.map((m: any) => (
                <li key={m.id} className="flex items-center justify-between rounded-lg border p-3">
                  <span>{m.email}</span>
                  <div className="flex gap-2">
                    <Pill tone={m.status === "verified" ? "good" : "warn"}>{m.status}</Pill>
                    <Pill tone={m.warmupStatus === "warming" ? "info" : "muted"}>
                      {m.warmupStatus ?? "no warmup"}
                    </Pill>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="alerts" className="pt-3">
          {data.alerts.length === 0 ? (
            <EmptyState message="No domain alerts recorded." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.alerts.map((a: any) => (
                <li key={a.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{a.title}</p>
                    <Pill tone={a.resolvedAt ? "muted" : a.severity === "critical" ? "bad" : "warn"}>
                      {a.resolvedAt ? "resolved" : a.severity}
                    </Pill>
                  </div>
                  <p className="text-xs text-muted-foreground">{fmtDate(a.at)}</p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
