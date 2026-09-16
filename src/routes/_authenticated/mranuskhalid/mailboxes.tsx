import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

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
  EmptyState,
  FilterBar,
  FilterSelect,
  LoadingRows,
  Pill,
  fmtDate,
  num,
  type Tone,
} from "@/components/app/admin/OutreachUI";
import {
  adminListCustomerMailboxes,
  type AdminMailboxRow,
} from "@/lib/admin-mailboxes.functions";

export const Route = createFileRoute("/_authenticated/mranuskhalid/mailboxes")({
  head: () => ({
    meta: [
      { title: "Mailboxes — MunchReach Admin" },
      {
        name: "description",
        content:
          "Read-only overview of every mailbox connected by every customer, with provider type, status, daily limit and warmup state.",
      },
    ],
  }),
  component: AdminMailboxesPage,
});

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "connected", label: "Connected" },
  { value: "failed", label: "Failed" },
];

function statusTone(status: string): Tone {
  if (status === "connected") return "good";
  if (status === "failed") return "bad";
  return "warn";
}

function AdminMailboxesPage() {
  const listMailboxes = useServerFn(adminListCustomerMailboxes);
  const [status, setStatus] = useState("all");

  const mailboxesQuery = useQuery({
    queryKey: ["admin", "customer-mailboxes", status],
    queryFn: () => listMailboxes({ data: { status: status === "all" ? null : status } }),
  });

  const rows = (mailboxesQuery.data ?? []) as AdminMailboxRow[];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Mailboxes"
        description="Every mailbox connected by a customer through the mailbox connection flow. Read-only: passwords are never shown and nothing can be changed from here."
      />

      <FilterBar>
        <FilterSelect
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
          allLabel="All statuses"
        />
        <span className="text-sm text-muted-foreground">{num(rows.length)} mailboxes</span>
      </FilterBar>

      {mailboxesQuery.isLoading ? (
        <LoadingRows />
      ) : mailboxesQuery.error ? (
        <EmptyState message={(mailboxesQuery.error as Error).message} />
      ) : rows.length === 0 ? (
        <EmptyState message="No mailboxes connected yet" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead>Email address</TableHead>
                <TableHead>Provider type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Daily limit</TableHead>
                <TableHead>Warmup</TableHead>
                <TableHead>Last tested</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.workspace_name}</TableCell>
                  <TableCell>{row.email_address}</TableCell>
                  <TableCell>{row.provider_type}</TableCell>
                  <TableCell>
                    <Pill tone={statusTone(row.status)}>{row.status}</Pill>
                  </TableCell>
                  <TableCell className="text-right">
                    {row.daily_send_limit === null ? "—" : num(row.daily_send_limit)}
                  </TableCell>
                  <TableCell>{row.warmup_enabled ? "Yes" : "No"}</TableCell>
                  <TableCell>{row.last_tested_at ? fmtDate(row.last_tested_at) : "Never"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
