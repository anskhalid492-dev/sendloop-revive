/**
 * Admin → Environment & secrets. Shows whether each required credential is
 * configured, per environment. Values are never read into the response — the
 * server returns presence and verification state only.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminGetEnvironmentStatus } from "@/lib/admin-platform.functions";

export const Route = createFileRoute("/_authenticated/admin/environment")({
  head: () => ({
    meta: [
      { title: "Environment & Secrets — MunchReach Admin" },
      {
        name: "description",
        content: "Check which platform credentials are configured, per environment, without exposing values.",
      },
      { property: "og:title", content: "Environment & Secrets — MunchReach Admin" },
      { property: "og:description", content: "Credential configuration status for the platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminEnvironmentPage,
});

const STATE_STYLES: Record<string, string> = {
  CONFIGURED: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  MISSING: "bg-destructive/10 text-destructive border-destructive/20",
  INVALID: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  "NOT TESTED": "bg-muted text-muted-foreground border-border",
};

function AdminEnvironmentPage() {
  const load = useServerFn(adminGetEnvironmentStatus);
  const status = useQuery({ queryKey: ["admin", "environment"], queryFn: () => load() });

  const vars = status.data?.vars ?? [];
  const groups = Array.from(new Set(vars.map((v) => v.group)));
  const missingRequired = vars.filter((v) => v.required && !v.configured);

  return (
    <div className="space-y-6">
      <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="text-lg font-semibold">Environment &amp; secrets</h2>
          <p className="text-sm text-muted-foreground">
            Secret values are never loaded into this page — only whether they are present and, where
            we have a signal, whether they last verified successfully.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">App: {status.data?.appEnvironment ?? "—"}</Badge>
          <Badge variant="outline">
            Billing: {(status.data?.billingEnvironment ?? "—").toString().toUpperCase()}
          </Badge>
          <Badge variant="outline" className={missingRequired.length ? STATE_STYLES["MISSING"] : STATE_STYLES["CONFIGURED"]}>
            {missingRequired.length ? `${missingRequired.length} required missing` : "All required configured"}
          </Badge>
        </div>
      </div>

      {groups.map((group) => (
        <div key={group} className="surface-card overflow-x-auto">
          <div className="border-b border-border p-4">
            <h3 className="text-sm font-semibold">{group}</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last verified</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vars
                .filter((v) => v.group === group)
                .map((v) => (
                  <TableRow key={v.name}>
                    <TableCell className="font-mono text-xs">{v.name}</TableCell>
                    <TableCell className="text-sm">{v.required ? "Required" : "Optional"}</TableCell>
                    <TableCell className="text-xs uppercase">{v.environment}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATE_STYLES[v.state]}>
                        {v.state}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {v.lastVerifiedAt ? new Date(v.lastVerifiedAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="max-w-[320px] text-xs text-muted-foreground">{v.note}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}
