import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCcw, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listEmailEvents, retryEmailEvent } from "@/lib/ops.functions";

const STATUS_TONE: Record<string, string> = {
  processed: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  pending: "bg-muted text-muted-foreground border-border",
  retrying: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  ignored: "bg-muted text-muted-foreground border-border",
};

/** Admin view of every inbound webhook delivery, with one-click retry. */
export function EmailEventLog() {
  const queryClient = useQueryClient();
  const fetchEvents = useServerFn(listEmailEvents);
  const retry = useServerFn(retryEmailEvent);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const eventsQuery = useQuery({
    queryKey: ["email-events", status, search],
    queryFn: () =>
      fetchEvents({ data: { status: status as any, ...(search ? { search } : {}), limit: 50 } }),
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => retry({ data: { id } }),
    onSuccess: () => {
      toast.success("Event reprocessed");
      void queryClient.invalidateQueries({ queryKey: ["email-events"] });
    },
    onError: (error: Error) => toast.error(error.message || "Retry failed."),
  });

  const events = eventsQuery.data?.events ?? [];

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Inbound email log</CardTitle>
            <CardDescription>
              Every webhook delivery Sendloop received, why it was classified, and whether it landed.
            </CardDescription>
          </div>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Refresh log"
            onClick={() => void eventsQuery.refetch()}
          >
            <RefreshCcw className={eventsQuery.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-xs"
            placeholder="Search sender, subject or message ID"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["all", "pending", "processed", "failed", "retrying", "ignored"].map((value) => (
                <SelectItem key={value} value={value}>
                  {value === "all" ? "All statuses" : value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Received</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>From</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-sm text-muted-foreground">
                  No events recorded yet.
                </TableCell>
              </TableRow>
            ) : (
              events.map((event: any) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(event.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs">{event.event_type}</TableCell>
                  <TableCell className="max-w-[180px] truncate text-xs">
                    {event.from_email ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs">
                    {event.subject ?? "—"}
                    {event.error ? (
                      <span className="block text-[11px] text-destructive">{event.error}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_TONE[event.status] ?? ""}>
                      {event.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => retryMutation.mutate(event.id)}
                      disabled={retryMutation.isPending}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" /> Retry
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
