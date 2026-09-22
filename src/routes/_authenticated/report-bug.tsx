import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bug, CheckCircle2, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";
import {
  BUG_DETAILS_MAX,
  BUG_SCREENSHOT_ACCEPT,
  BUG_STATUS_LABEL,
  BUG_STATUS_STYLE,
  bugScreenshotError,
  bugStatusOf,
} from "@/lib/bug-report-model";
import { listMyBugReports, submitBugReport } from "@/lib/bug-reports.functions";
import { uploadBugScreenshot } from "@/lib/support-upload";

export const Route = createFileRoute("/_authenticated/report-bug")({
  head: () => ({
    meta: [
      { title: "Report a bug — MunchReach" },
      {
        name: "description",
        content:
          "Tell the MunchReach team about a problem you hit, attach a screenshot and follow the status of your report.",
      },
      { property: "og:title", content: "Report a bug — MunchReach" },
      {
        property: "og:description",
        content: "Send a bug report with an optional screenshot and track its status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportBugPage,
});

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function ReportBugPage() {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const submit = useServerFn(submitBugReport);
  const fetchMine = useServerFn(listMyBugReports);
  const fileInput = useRef<HTMLInputElement>(null);

  const [details, setDetails] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const mine = useQuery({
    queryKey: ["my-bug-reports"],
    queryFn: () => fetchMine(),
  });

  function pickFile(next: File | null) {
    if (!next) {
      setFile(null);
      setPreview(null);
      return;
    }
    const problem = bugScreenshotError(next);
    if (problem) {
      toast.error(problem);
      return;
    }
    setFile(next);
    setPreview(URL.createObjectURL(next));
  }

  const send = useMutation({
    mutationFn: async () => {
      const text = details.trim();
      if (!text) throw new Error("Please describe the bug before sending.");
      const screenshot = file ? await uploadBugScreenshot(file) : null;
      return submit({
        data: {
          details: text,
          workspaceId: workspace?.id ?? null,
          screenshot,
        },
      });
    },
    onSuccess: () => {
      setDetails("");
      pickFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setSent(true);
      toast.success("Thanks — your bug report has been sent to our team.");
      queryClient.invalidateQueries({ queryKey: ["my-bug-reports"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Could not send your report.");
    },
  });

  // A single in-flight guard so a double-click can never file the same report twice.
  const busy = send.isPending;

  return (
    <AppShell title="Report a bug">
      <div className="space-y-4">
        <section className="surface-card space-y-4 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-lg border border-border bg-muted/50 p-2">
              <Bug className="size-4 text-primary" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Something not working?</h2>
              <p className="text-xs text-muted-foreground">
                Describe what happened and add a screenshot if you have one. Our team reviews every
                report.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bug-details">
              Details <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="bug-details"
              value={details}
              onChange={(event) => {
                setDetails(event.target.value.slice(0, BUG_DETAILS_MAX));
                setSent(false);
              }}
              rows={7}
              placeholder="What were you doing, what did you expect, and what happened instead?"
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">
              {details.trim().length}/{BUG_DETAILS_MAX} characters
            </p>
          </div>

          <div className="space-y-2">
            <Label>Screenshot (optional)</Label>
            <input
              ref={fileInput}
              type="file"
              accept={BUG_SCREENSHOT_ACCEPT}
              className="hidden"
              onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-2.5">
                {preview ? (
                  <img
                    src={preview}
                    alt="Selected screenshot preview"
                    className="size-14 rounded-lg border border-border object-cover"
                  />
                ) : (
                  <ImageIcon className="size-5 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    pickFile(null);
                    if (fileInput.current) fileInput.current.value = "";
                  }}
                  disabled={busy}
                >
                  <X className="mr-1 size-4" /> Remove
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInput.current?.click()}
                disabled={busy}
              >
                <Upload className="mr-2 size-4" /> Add screenshot
              </Button>
            )}
            <p className="text-xs text-muted-foreground">PNG, JPG or WEBP · up to 5 MB</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => send.mutate()} disabled={busy || details.trim().length === 0}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Send Report
            </Button>
            {sent && !busy ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" /> Report sent — thank you.
              </span>
            ) : null}
          </div>
        </section>

        <section className="surface-card p-4">
          <h2 className="text-sm font-semibold">Your reports</h2>
          {mine.isLoading ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </p>
          ) : (mine.data ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              You have not reported any bugs yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border/60">
              {(mine.data ?? []).map((report) => {
                const status = bugStatusOf(report.status);
                return (
                  <li key={report.id} className="flex flex-wrap items-start gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap break-words text-sm">{report.details}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(report.created_at)}
                        {report.screenshot_name ? " · screenshot attached" : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className={cn(BUG_STATUS_STYLE[status])}>
                      {BUG_STATUS_LABEL[status]}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
