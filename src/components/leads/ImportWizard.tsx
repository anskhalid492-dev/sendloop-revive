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
import { LEAD_FIELDS } from "@/lib/lead-model";
import { checkImportDuplicates, importLeads } from "@/lib/leads.functions";
import type { LeadList } from "@/lib/leads.functions";

const IGNORE = "__ignore__";
const SPLIT_NAME = "__split_name__";
const FIRST_ONLY = "__first_only__";
const CUSTOM = "__custom__";
const NO_LIST = "__none__";

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
  const [tagInput, setTagInput] = useState("");
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [summary, setSummary] = useState<{
    received: number;
    inserted: number;
    duplicatesInFile: number;
    duplicatesInWorkspace: number;
  } | null>(null);

  const reset = () => {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setDuplicates([]);
    setSummary(null);
    setTagInput("");
  };

  const mapped = useMemo(() => {
    const emailHeader = Object.entries(mapping).find(([, field]) => field === "email")?.[0];
    const invalid: string[] = [];
    const out: Array<Record<string, unknown>> = [];
    if (!emailHeader) return { out, invalid, emailHeader: null as string | null };

    for (const row of rows) {
      const email = (row[emailHeader] ?? "").trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        invalid.push(email || "(blank)");
        continue;
      }
      const record: Record<string, unknown> = { email };
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
      out.push(record);
    }
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
        const parsed = (result.data ?? []).slice(0, 5000);
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
      const emails = mapped.out.map((r) => r["email"] as string).slice(0, 5000);
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
          rows: mapped.out as never,
        },
      }),
    onSuccess: (result) => {
      setSummary(result);
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
              Choose a CSV file (up to 5,000 rows)
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
              <Stat label="Invalid emails" value={mapped.invalid.length} />
              <Stat label="Already in workspace" value={duplicates.length} />
            </div>

            {mapped.invalid.length > 0 ? (
              <div className="flex gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 text-amber-600" />
                <p className="text-muted-foreground">
                  {mapped.invalid.length} rows will be skipped because the email is missing or
                  invalid.
                </p>
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

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("map")}>
                Back
              </Button>
              <Button
                disabled={!workspaceId || mapped.out.length === 0 || runImport.isPending}
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
                {summary.inserted} leads added · {summary.duplicatesInFile} duplicates in file ·{" "}
                {summary.duplicatesInWorkspace} already existed
              </p>
            </div>
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
