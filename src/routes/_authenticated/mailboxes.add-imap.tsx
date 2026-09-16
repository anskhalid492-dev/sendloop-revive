import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { BackLink } from "@/components/app/BackLink";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/hooks/useWorkspace";
import { saveMailboxConnection } from "@/lib/customer-mailboxes.functions";
import { mailboxCsvTemplate, parseMailboxCsv } from "@/lib/mailbox-csv";

export const Route = createFileRoute("/_authenticated/mailboxes/add-imap")({
  head: () => ({
    meta: [
      { title: "Connect IMAP / SMTP Mailboxes — MunchReach" },
      {
        name: "description",
        content:
          "Connect a single mailbox over IMAP and SMTP, or import many at once from a CSV file with per-row connection results.",
      },
      { property: "og:title", content: "Connect IMAP / SMTP Mailboxes" },
      {
        property: "og:description",
        content: "Add one mailbox manually or bulk import mailboxes from a CSV file.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConnectImapPage,
});

type RowResult = { email: string; ok: boolean; message: string };

function ConnectImapPage() {
  const { workspace } = useWorkspace();
  const runSave = useServerFn(saveMailboxConnection);
  const fileInput = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<RowResult[]>([]);

  const download = () => {
    const blob = new Blob([mailboxCsvTemplate()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "munchreach-mailboxes-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  /** Each row goes through the same test-and-save path as a single mailbox. */
  const importCsv = useMutation({
    mutationFn: async (file: File) => {
      const rows = parseMailboxCsv(await file.text());
      if (rows.length === 0) throw new Error("That file had no rows below the header.");

      const collected: RowResult[] = [];
      for (const row of rows) {
        const label = row.emailAddress || `Row ${row.line}`;
        if (row.error) {
          collected.push({ email: label, ok: false, message: row.error });
          setResults([...collected]);
          continue;
        }
        try {
          const saved = await runSave({
            data: {
              workspaceId: workspace?.id ?? "",
              emailAddress: row.emailAddress,
              displayName: row.displayName || undefined,
              dailySendLimit: row.dailySendLimit,
              warmupEnabled: row.warmupEnabled,
              smtp: row.smtp,
              imap: row.imap,
            },
          });
          collected.push({
            email: label,
            ok: saved.status === "connected",
            message:
              saved.status === "connected"
                ? "Connected."
                : `SMTP: ${saved.smtp.message} IMAP: ${saved.imap.message}`,
          });
        } catch (error) {
          collected.push({
            email: label,
            ok: false,
            message: error instanceof Error ? error.message : "Unknown error.",
          });
        }
        setResults([...collected]);
      }
      return collected;
    },
    onSuccess: (collected) => {
      const ok = collected.filter((row) => row.ok).length;
      toast.success(`${ok} of ${collected.length} mailboxes connected.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell title="IMAP / SMTP" description="Connect one mailbox or import many from a CSV">
      <BackLink to="/mailboxes/add" />
      <div className="mx-auto max-w-3xl space-y-6">
        <Tabs defaultValue="single">
          <TabsList>
            <TabsTrigger value="single">Single Account</TabsTrigger>
            <TabsTrigger value="bulk">Bulk Imports From CSV</TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Single Account</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Enter your outgoing and incoming server details, test both logins, and save the
                  mailbox.
                </p>
                <Button asChild>
                  <Link to="/mailboxes/connect">Open the connect form</Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bulk" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Bulk Imports From CSV</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <button
                  type="button"
                  onClick={download}
                  className="text-sm font-medium underline underline-offset-4"
                >
                  Click here to download a CSV template
                </button>

                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/70 bg-muted/30 p-8 text-center">
                  <Upload className="size-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Upload your filled-in CSV. Every row is tested and saved individually.
                  </p>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      if (!workspace?.id) {
                        toast.error("Pick a workspace first.");
                        return;
                      }
                      setResults([]);
                      importCsv.mutate(file);
                    }}
                  />
                  <Button
                    type="button"
                    disabled={importCsv.isPending}
                    onClick={() => fileInput.current?.click()}
                  >
                    {importCsv.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Upload CSV
                  </Button>
                </div>

                {results.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Result</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((row) => (
                        <TableRow key={`${row.email}-${row.message}`}>
                          <TableCell className="font-medium">{row.email}</TableCell>
                          <TableCell>
                            <span className="flex items-start gap-2 text-sm">
                              {row.ok ? (
                                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                              ) : (
                                <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                              )}
                              <span>{row.message}</span>
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
