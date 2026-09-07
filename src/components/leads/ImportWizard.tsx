import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import Papa from "papaparse";
import { AlertTriangle, CheckCircle2, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { LEAD_FIELDS, validateWebsite } from "@/lib/lead-model";
import {
  UNVERIFIED_LIST_MESSAGE,
  checkImportDuplicates,
  importLeads,
} from "@/lib/leads.functions";
import type { LeadList } from "@/lib/leads.functions";

const IGNORE = "__ignore__";
const SPLIT_NAME = "__split_name__";
const FIRST_ONLY = "__first_only__";
const CUSTOM = "__custom__";
const NO_LIST = "__none__";
const MAX_IMPORT_ROWS = 10000;

type FailedRow = { row: number; field: string; reason: string; email: string };

function downloadFailedRows(failed: FailedRow[]) {
  const csv = Papa.unparse(
    failed.map((f) => ({ Row: f.row, Email: f.email, Field: f.field, Reason: f.reason })),
  );
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "failed-lead-rows.csv";
  link.click();
  URL.revokeObjectURL(url);
}

type Step = "upload" | "map" | "review" | "done";

function guessField(header: string): string {
  const h = header.toLowerCase().replace(/[^a-z]/g, "");
  const map: Record<string, string> = {
    email: "email",
    emailaddress: "email",
    firstname: "first_name",
    fname: "first_name",
    lastname: "last_name",
    lname: "last_name",
    company: "company",
    companyname: "company",
    organization: "company",
    title: "job_title",
    jobtitle: "job_title",
    position: "job_title",
    phone: "phone",
    phonenumber: "phone",
    website: "website",
    url: "website",
    domain: "website",
    city: "city",
    state: "state",
    region: "state",
    country: "country",
    linkedin: "linkedin_url",
    linkedinurl: "linkedin_url",
    linkedinprofile: "linkedin_url",
    name: SPLIT_NAME,
    fullname: SPLIT_NAME,
    contactname: SPLIT_NAME,
  };
  return map[h] ?? CUSTOM;
}

export function ImportWizard({
  open,
  onOpenChange,
  workspaceId,
  lists,
  defaultListId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | undefined;
  lists: LeadList[];
  defaultListId: string | null;
}) {
  const queryClient = useQueryClient();
  const importFn = useServerFn(importLeads);
  const dupeFn = useServerFn(checkImportDuplicates);
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [listId, setListId] = useState<string | null>(defaultListId);

  // The wizard stays mounted, so the destination must follow the folder the
  // customer is actually looking at each time they open it — otherwise the
  // import silently lands in "All leads".
  useEffect(() => {
    if (open) setListId(defaultListId);
  }, [open, defaultListId]);

  const [tagInput, setTagInput] = useState("");
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<{
    received: number;
    inserted: number;
    duplicatesInFile: number;
    duplicatesInWorkspace: number;
    failed: FailedRow[];
  } | null>(null);

  const reset = () => {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setDuplicates([]);
    setVerified(null);
    setSummary(null);
    setTagInput("");
  };

  const mapped = useMemo(() => {
    const emailHeader = Object.entries(mapping).find(([, field]) => field === "email")?.[0];
    const invalid: FailedRow[] = [];
    const out: Array<Record<string, unknown>> = [];
    if (!emailHeader) return { out, invalid, emailHeader: null as string | null };

    rows.forEach((row, index) => {
      const rowNumber = index + 1;
      const email = (row[emailHeader] ?? "").trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        invalid.push({
          row: rowNumber,
          field: "Email",
          reason: email ? "Email address is not valid" : "Email address is missing",
          email: email || "(blank)",
        });
        return;
      }
      const record: Record<string, unknown> = { email, _row: rowNumber };
      const custom: Record<string, string> = {};
      let derivedFirst = "";
      let derivedLast = "";
      for (const [header, field] of Object.entries(mapping)) {
        const value = (row[header] ?? "").trim();
        if (!value || field === IGNORE || field === "email") continue;
        if (field === CUSTOM) {
          custom[header] = value.slice(0, 200);
        } else if (field === SPLIT_NAME) {
          const parts = value.split(/\s+/);
          derivedFirst = parts[0] ?? "";
          derivedLast = parts.slice(1).join(" ");
        } else if (field === FIRST_ONLY) {
          derivedFirst = value;
        } else {
          record[field] = value;
        }
      }
      // Explicit first/last mappings always win over a split full-name column.
      if (!record["first_name"] && derivedFirst) record["first_name"] = derivedFirst;
      if (!record["last_name"] && derivedLast) record["last_name"] = derivedLast;

      if (Object.keys(custom).length) record["custom_fields"] = custom;

      // Website is checked here too so the review step can report the row up front.
      const site = validateWebsite(record["website"]);
      if (!site.ok) {
        invalid.push({ row: rowNumber, field: "Website", reason: site.reason, email });
        return;
      }
      if (site.value) record["website"] = site.value;
      else delete record["website"];

      out.push(record);
    });
    return { out, invalid, emailHeader };
  }, [mapping, rows]);

  const handleFile = (file: File) => {
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const fields = (result.meta.fields ?? []).filter(Boolean);
        if (fields.length === 0) {
          toast.error("That file has no readable header row");
          return;
        }
        const parsed = (result.data ?? []).slice(0, MAX_IMPORT_ROWS);
        setHeaders(fields);
        setRows(parsed);
        setMapping(Object.fromEntries(fields.map((f) => [f, guessField(f)])));
        setStep("map");
      },
      error: () => toast.error("Could not read that CSV file"),
    });
  };

  const goReview = async () => {
    if (!mapped.emailHeader) {
      toast.error("Map one column to Email before continuing");
      return;
    }
    try {
      const emails = mapped.out.map((r) => r["email"] as string).slice(0, MAX_IMPORT_ROWS);
      if (emails.length) {
        const result = await dupeFn({ data: { emails } });
        setDuplicates(result.existing);
      }
    } catch {
      setDuplicates([]);
    }
    setStep("review");
  };

  const runImport = useMutation({
    mutationFn: () =>
      importFn({
        data: {
          workspaceId: workspaceId!,
          listId,
          tags: tagInput
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 10),
          listVerified: verified === true,
          rows: mapped.out as never,
        },
      }),
    onSuccess: (result) => {
      setSummary({
        ...result,
        failed: [...mapped.invalid, ...(result.failed ?? [])].sort((a, b) => a.row - b.row),
      });
      setStep("done");
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
      void queryClient.invalidateQueries({ queryKey: ["lead-lists"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import leads from CSV</DialogTitle>
          <DialogDescription>
            Upload a file, map the columns to MunchReach fields, then review before importing.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border p-10 text-sm text-muted-foreground hover:border-primary hover:text-foreground"
            >
              <Upload className="size-6" />
              Choose a CSV file (up to 10,000 rows)
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
          </div>
        ) : null}

        {step === "map" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {fileName} · {rows.length} rows detected
            </p>
            <div className="space-y-2">
              {headers.map((header) => (
                <div key={header} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr]">
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">{header}</Label>
                    <p className="truncate text-sm text-muted-foreground">
                      {rows[0]?.[header] ?? "—"}
                    </p>
                  </div>
                  <Select
                    value={mapping[header] ?? IGNORE}
                    onValueChange={(value) => setMapping((m) => ({ ...m, [header]: value }))}
                  >
                    <SelectTrigger aria-label={`Map ${header}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_FIELDS.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.label}
                        </SelectItem>
                      ))}
                      <SelectItem value={SPLIT_NAME}>
                        Full name → split into first + last
                      </SelectItem>
                      <SelectItem value={FIRST_ONLY}>Full name → first name only</SelectItem>
                      <SelectItem value={CUSTOM}>Custom field</SelectItem>
                      <SelectItem value={IGNORE}>Ignore column</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button onClick={() => void goReview()}>Continue</Button>
            </DialogFooter>
          </div>
        ) : null}

        {step === "review" ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Valid rows" value={mapped.out.length} />
              <Stat label="Invalid rows" value={mapped.invalid.length} />
              <Stat label="Already in workspace" value={duplicates.length} />
            </div>

            {mapped.invalid.length > 0 ? (
              <div className="flex gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 text-amber-600" />
                <div className="space-y-1 text-muted-foreground">
                  <p>
                    {mapped.invalid.length} row{mapped.invalid.length === 1 ? "" : "s"} will be
                    skipped. Every other lead still imports.
                  </p>
                  {mapped.invalid.slice(0, 3).map((f) => (
                    <p key={`${f.row}-${f.field}`} className="text-xs">
                      Row {f.row.toLocaleString()} · {f.field} · {f.reason}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Import into list</Label>
                <Select
                  value={listId ?? NO_LIST}
                  onValueChange={(value) => setListId(value === NO_LIST ? null : value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_LIST}>No list</SelectItem>
                    {lists.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="import-tags">Tags (comma separated)</Label>
                <Input
                  id="import-tags"
                  value={tagInput}
                  maxLength={200}
                  placeholder="q1-outbound, saas"
                  onChange={(e) => setTagInput(e.target.value)}
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Company</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {mapped.out.slice(0, 8).map((row, i) => (
                    <tr key={i} className="border-t border-border/60">
                      <td className="px-3 py-2">{String(row["email"])}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {[row["first_name"], row["last_name"]].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {String(row["company"] ?? "—")}
                      </td>
                      <td className="px-3 py-2">
                        {duplicates.includes(String(row["email"])) ? (
                          <Badge variant="outline">Duplicate</Badge>
                        ) : (
                          <Badge variant="secondary">New</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Is this list verified?</p>
                <p className="text-xs text-muted-foreground">
                  MunchReach only accepts contact lists that have been email-verified. This keeps
                  bounce rates low and protects your sending reputation.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={verified === true ? "default" : "outline"}
                  onClick={() => setVerified(true)}
                >
                  Yes, this list is verified
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={verified === false ? "destructive" : "outline"}
                  onClick={() => setVerified(false)}
                >
                  No, it is not verified
                </Button>
              </div>

              {verified === false ? (
                <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 text-destructive" />
                  <div className="space-y-2">
                    <p className="text-destructive">{UNVERIFIED_LIST_MESSAGE}</p>
                    <p className="text-xs text-muted-foreground">
                      No contacts from this file have been added to your Leads. Verify your list
                      first, then come back here and import it.
                    </p>

                  </div>
                </div>
              ) : null}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("map")}>
                Back
              </Button>
              <Button
                disabled={
                  !workspaceId ||
                  mapped.out.length === 0 ||
                  verified !== true ||
                  runImport.isPending
                }
                onClick={() => runImport.mutate()}
              >
                {runImport.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Import {mapped.out.length} leads
              </Button>
            </DialogFooter>

          </div>
        ) : null}

        {step === "done" && summary ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto size-10 text-primary" />
            <div>
              <h3 className="text-lg font-semibold">Import complete</h3>
              <p className="text-sm text-muted-foreground">
                Imported: {summary.inserted.toLocaleString()} · Skipped:{" "}
                {summary.failed.length.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {summary.duplicatesInFile} duplicates in file · {summary.duplicatesInWorkspace}{" "}
                already existed
              </p>
            </div>

            {summary.failed.length > 0 ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-left text-sm">
                {summary.failed.slice(0, 5).map((f) => (
                  <div key={`${f.row}-${f.field}`}>
                    <p className="font-medium">Row {f.row.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Field: {f.field}</p>
                    <p className="text-xs text-muted-foreground">Reason: {f.reason}</p>
                  </div>
                ))}
                {summary.failed.length > 5 ? (
                  <p className="text-xs text-muted-foreground">
                    +{summary.failed.length - 5} more in the download
                  </p>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadFailedRows(summary.failed)}
                >
                  Download failed rows
                </Button>
              </div>
            ) : null}
            <DialogFooter className="justify-center">
              <Button variant="outline" onClick={reset}>
                Import another file
              </Button>
              <Button
                onClick={() => {
                  onOpenChange(false);
                  reset();
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
