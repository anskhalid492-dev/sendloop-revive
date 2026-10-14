import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LEAD_FIELDS, validateWebsite } from "@/lib/lead-model";
import { UNVERIFIED_LIST_MESSAGE, checkImportDuplicates } from "@/lib/leads.functions";
import type { LeadList } from "@/lib/leads.functions";
import { getLeadImportJob, startLeadImport } from "@/lib/lead-import.functions";
import {
  MAP_CUSTOM,
  MAP_FIRST_ONLY,
  MAP_IGNORE,
  MAP_SPLIT_NAME,
  importProgressLabel,
  importProgressPercent,
  isLeadImportActive,
  type LeadImportJob,
} from "@/lib/lead-import";
import { MAX_LEAD_IMPORT_BYTES } from "@/lib/files-model";
import { uploadFileToR2 } from "@/lib/file-storage";
import { createLeadList } from "@/lib/leads.functions";
import { DEFAULT_LIST_COLOR, resolveImportList, type ListColor } from "@/lib/lead-list-color";
import { ListColorPicker, ListFolderIcon } from "./ListColorPicker";

const NO_LIST = "__none__";
const NEW_LIST = "__new__";
/** Rows read in the browser for the mapping preview only — never the whole file. */
const PREVIEW_ROWS = 200;

type FailedRow = { row: number; field: string; reason: string; email: string };

type Step = "upload" | "map" | "review" | "processing";

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
    country: "country",
    linkedin: "linkedin_url",
    linkedinurl: "linkedin_url",
    linkedinprofile: "linkedin_url",
    name: MAP_SPLIT_NAME,
    fullname: MAP_SPLIT_NAME,
    contactname: MAP_SPLIT_NAME,
  };
  return map[h] ?? MAP_CUSTOM;
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
  const startFn = useServerFn(startLeadImport);
  const createListFn = useServerFn(createLeadList);
  const jobFn = useServerFn(getLeadImportJob);
  const dupeFn = useServerFn(checkImportDuplicates);
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sample, setSample] = useState<Array<Record<string, string>>>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [listId, setListId] = useState<string | null>(defaultListId);
  const [newListName, setNewListName] = useState("");
  const [newListColor, setNewListColor] = useState<ListColor>(DEFAULT_LIST_COLOR);
  const createdListRef = useRef<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);

  // The wizard stays mounted, so the destination must follow the folder the
  // customer is actually looking at each time they open it.
  useEffect(() => {
    if (open) setListId(defaultListId);
  }, [open, defaultListId]);

  const reset = () => {
    setStep("upload");
    setFile(null);
    setHeaders([]);
    setSample([]);
    setMapping({});
    setDuplicates([]);
    setVerified(null);
    setTagInput("");
    setUploadPercent(0);
    setJobId(null);
    setNewListName("");
    setNewListColor(DEFAULT_LIST_COLOR);
    createdListRef.current = null;
  };

  /** Preview only: the real mapping runs in the background over the whole file. */
  const preview = useMemo(() => {
    const emailHeader = Object.entries(mapping).find(([, field]) => field === "email")?.[0];
    const invalid: FailedRow[] = [];
    const out: Array<Record<string, unknown>> = [];
    if (!emailHeader) return { out, invalid, emailHeader: null as string | null };

    sample.forEach((row, index) => {
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
      const record: Record<string, unknown> = { email };
      for (const [header, field] of Object.entries(mapping)) {
        const value = (row[header] ?? "").trim();
        if (!value || field === MAP_IGNORE || field === "email" || field === MAP_CUSTOM) continue;
        if (field === MAP_SPLIT_NAME) {
          const parts = value.split(/\s+/);
          record["first_name"] = record["first_name"] || (parts[0] ?? "");
          record["last_name"] = record["last_name"] || parts.slice(1).join(" ");
        } else if (field === MAP_FIRST_ONLY) {
          record["first_name"] = record["first_name"] || value;
        } else {
          record[field] = value;
        }
      }
      const site = validateWebsite(record["website"]);
      if (!site.ok) {
        invalid.push({ row: rowNumber, field: "Website", reason: site.reason, email });
        return;
      }
      out.push(record);
    });
    return { out, invalid, emailHeader };
  }, [mapping, sample]);

  const handleFile = (chosen: File) => {
    if (chosen.size > MAX_LEAD_IMPORT_BYTES) {
      toast.error("That file is larger than 512 MB");
      return;
    }
    setFile(chosen);
    // Only the first rows are read here so the customer can map columns; the
    // whole file is processed in the background after it is uploaded.
    Papa.parse<Record<string, string>>(chosen, {
      header: true,
      skipEmptyLines: true,
      preview: PREVIEW_ROWS,
      complete: (result) => {
        const fields = (result.meta.fields ?? []).filter(Boolean);
        if (fields.length === 0) {
          toast.error("That file has no readable header row");
          return;
        }
        setHeaders(fields);
        setSample(result.data ?? []);
        setMapping(Object.fromEntries(fields.map((f) => [f, guessField(f)])));
        setStep("map");
      },
      error: () => toast.error("Could not read that CSV file"),
    });
  };

  const goReview = async () => {
    if (!preview.emailHeader) {
      toast.error("Map one column to Email before continuing");
      return;
    }
    try {
      const emails = preview.out.map((r) => r["email"] as string);
      if (emails.length) {
        const result = await dupeFn({ data: { emails } });
        setDuplicates(result.existing);
      }
    } catch {
      setDuplicates([]);
    }
    setStep("review");
  };

  const startImport = useMutation({
    mutationFn: async () => {
      if (!file || !workspaceId) throw new Error("Choose a file first");
      const tags = tagInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 10);

      setStep("processing");
      setUploadPercent(0);

      // Straight from the browser to private storage — the file never travels
      // through MunchReach itself.
      const uploaded = await uploadFileToR2(file, {
        category: "imports",
        workspaceId,
        maxBytes: MAX_LEAD_IMPORT_BYTES,
        onProgress: setUploadPercent,
      });

      const destination = await resolveImportList(
        listId === NEW_LIST ? createdListRef.current : listId,
        listId === NEW_LIST && !createdListRef.current ? { name: newListName, color: newListColor } : null,
        async (draft) => {
          const list = await createListFn({ data: { workspaceId, ...draft } });
          createdListRef.current = list.id;
          await queryClient.invalidateQueries({ queryKey: ["lead-lists"] });
          return list;
        },
      );

      const started = await startFn({
        data: {
          workspaceId,
          fileId: uploaded.fileId,
          r2Key: uploaded.key,
          fileName: file.name,
          fileSize: file.size,
          mapping,
          listId: destination,
          tags,
          listVerified: verified === true,
        },
      });
      setJobId(started.jobId);
      return started;
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setStep("review");
    },
  });

  const uploading = startImport.isPending;

  const jobQuery = useQuery({
    queryKey: ["lead-import-job", jobId],
    queryFn: async () => {
      const result = await jobFn({ data: { jobId: jobId! } });
      return (result.job ?? null) as LeadImportJob | null;
    },
    enabled: Boolean(jobId) && open,
    refetchInterval: (query) => {
      const job = query.state.data as LeadImportJob | null | undefined;
      if (!job) return 2000;
      return isLeadImportActive(job.status) ? 2500 : false;
    },
  });

  const job = jobQuery.data ?? null;
  const finished = Boolean(job && !isLeadImportActive(job.status));

  // Leads keep arriving while the job runs, so the lists refresh as it advances.
  useEffect(() => {
    if (!job) return;
    void queryClient.invalidateQueries({ queryKey: ["leads"] });
    void queryClient.invalidateQueries({ queryKey: ["lead-lists"] });
  }, [job?.imported_rows, job?.status, queryClient, job]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        // Closing never stops the import: it keeps running in the background.
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
              Choose a CSV file
              <span className="text-xs">Large files are supported — up to 512 MB</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const chosen = e.target.files?.[0];
                if (chosen) handleFile(chosen);
                e.target.value = "";
              }}
            />
          </div>
        ) : null}

        {step === "map" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {file?.name} · mapping previewed from the first {sample.length} rows
            </p>
            <div className="space-y-2">
              {headers.map((header) => (
                <div key={header} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr]">
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">{header}</Label>
                    <p className="truncate text-sm text-muted-foreground">
                      {sample[0]?.[header] ?? "—"}
                    </p>
                  </div>
                  <Select
                    value={mapping[header] ?? MAP_IGNORE}
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
                      <SelectItem value={MAP_SPLIT_NAME}>
                        Full name → split into first + last
                      </SelectItem>
                      <SelectItem value={MAP_FIRST_ONLY}>Full name → first name only</SelectItem>
                      <SelectItem value={MAP_CUSTOM}>Custom field</SelectItem>
                      <SelectItem value={MAP_IGNORE}>Ignore column</SelectItem>
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
              <Stat label="Valid rows in preview" value={preview.out.length} />
              <Stat label="Invalid rows in preview" value={preview.invalid.length} />
              <Stat label="Already in workspace" value={duplicates.length} />
            </div>
            <p className="text-xs text-muted-foreground">
              These figures come from the first {sample.length} rows. Every row in the file is
              checked with the same rules while it imports.
            </p>

            {preview.invalid.length > 0 ? (
              <div className="flex gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 text-amber-600" />
                <div className="space-y-1 text-muted-foreground">
                  <p>
                    {preview.invalid.length} row{preview.invalid.length === 1 ? "" : "s"} in the
                    preview will be skipped. Every other lead still imports.
                  </p>
                  {preview.invalid.slice(0, 3).map((f) => (
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
                  onValueChange={(value) => { setListId(value === NO_LIST ? null : value); createdListRef.current = null; }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_LIST}>No list</SelectItem>
                    <SelectItem value={NEW_LIST}>Create new list</SelectItem>
                    {lists.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        <span className="flex items-center gap-2"><ListFolderIcon color={l.color} />{l.name}</span>
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

            {listId === NEW_LIST && <div className="space-y-3">
              <div className="space-y-1.5"><Label htmlFor="import-list-name">List name</Label><Input id="import-list-name" maxLength={80} value={newListName} onChange={(event) => setNewListName(event.target.value)} /></div>
              <div className="space-y-1.5"><Label>Folder color</Label><ListColorPicker value={newListColor} onChange={setNewListColor} /></div>
            </div>}

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
                  {preview.out.slice(0, 8).map((row, i) => (
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
                disabled={!workspaceId || !file || verified !== true || startImport.isPending || (listId === NEW_LIST && newListName.trim().length < 2)}
                onClick={() => startImport.mutate()}
              >
                {startImport.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Start import
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {step === "processing" ? (
          <div className="space-y-4">
            {!jobId ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Uploading {file?.name}</p>
                <Progress value={uploadPercent} />
                <p className="text-xs text-muted-foreground">{uploadPercent}% uploaded</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {finished ? (
                    <CheckCircle2 className="size-5 text-primary" />
                  ) : (
                    <Loader2 className="size-5 animate-spin text-primary" />
                  )}
                  <p className="text-sm font-medium">
                    {finished ? "Upload complete" : "Upload complete · Processing leads…"}
                  </p>
                </div>

                {!finished ? (
                  <p className="text-sm text-muted-foreground">
                    Your file has been uploaded successfully. We&apos;re processing your leads in the
                    background — you can close this and keep using MunchReach.
                  </p>
                ) : null}

                {job ? (
                  <div className="space-y-2">
                    <Progress value={importProgressPercent(job)} />
                    <p className="text-sm">{importProgressLabel(job)}</p>
                    <div className="grid gap-2 sm:grid-cols-4">
                      <Stat label="Imported" value={job.imported_rows} />
                      <Stat label="Duplicates" value={job.duplicate_rows} />
                      <Stat label="Invalid" value={job.invalid_rows} />
                      <Stat label="Skipped" value={job.skipped_rows} />
                    </div>
                    {job.error_message ? (
                      <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                        <AlertTriangle className="mt-0.5 size-4 text-destructive" />
                        <p className="text-destructive">{job.error_message}</p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Starting…</p>
                )}
              </div>
            )}

            <DialogFooter className="justify-center">
              {finished ? (
                <Button variant="outline" onClick={reset}>
                  Import another file
                </Button>
              ) : null}
              <Button
                disabled={uploading && !jobId}
                onClick={() => {
                  onOpenChange(false);
                  reset();
                }}
              >
                {finished ? "Done" : "Keep working"}
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
      <p className="text-xl font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}
