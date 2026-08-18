import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, HelpCircle, RefreshCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { checkMx } from "@/lib/ops.functions";

/**
 * Live MX resolution for the reply-to domain, showing the exact host and
 * priority the provider expects next to whatever DNS currently answers.
 */
export function MxChecker() {
  const run = useServerFn(checkMx);
  const query = useQuery({ queryKey: ["mx-check"], queryFn: () => run(), staleTime: 0 });
  const result = query.data;

  const status = result?.status ?? "unknown";
  const Icon = status === "pass" ? CheckCircle2 : status === "fail" ? AlertTriangle : HelpCircle;
  const tone =
    status === "pass"
      ? "text-emerald-600"
      : status === "fail"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>MX checker</CardTitle>
          <CardDescription>
            {result?.host
              ? `Resolving MX for ${result.host}`
              : "Resolves the reply-to domain's MX records in real time."}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              status === "pass"
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
                : status === "fail"
                  ? "border-destructive/20 bg-destructive/10 text-destructive"
                  : ""
            }
          >
            {status === "pass" ? "Pass" : status === "fail" ? "Fail" : "Unknown"}
          </Badge>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Re-check MX records"
            onClick={() => void query.refetch()}
          >
            <RefreshCcw className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {query.isLoading ? (
          <p className="text-muted-foreground">Resolving DNS…</p>
        ) : query.isError ? (
          <p className="text-destructive">Couldn’t resolve MX records. Try again.</p>
        ) : (
          <>
            <div className="flex gap-2">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
              <p className="text-muted-foreground">{result?.detail}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px]">
                <p className="mb-1 font-sans text-xs font-medium">Expected</p>
                {result?.expected ? (
                  <>
                    <div>Type: MX</div>
                    <div>Name: {result.expected.name}</div>
                    <div>Host: {result.expected.host}</div>
                    <div>Priority: {result.expected.priority}</div>
                  </>
                ) : (
                  <div className="font-sans text-muted-foreground">
                    Not published by the provider yet.
                  </div>
                )}
              </div>
              <div className="rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px]">
                <p className="mb-1 font-sans text-xs font-medium">Live in DNS</p>
                {result?.found?.length ? (
                  result.found.map((record) => (
                    <div key={`${record.priority}-${record.host}`}>
                      {record.priority ?? "—"} {record.host}
                    </div>
                  ))
                ) : (
                  <div className="font-sans text-muted-foreground">No MX answers.</div>
                )}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Checked {result?.checkedAt ? new Date(result.checkedAt).toLocaleString() : "—"}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
