import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { validateRedirect, type SiteRedirect } from "@/lib/site-content-model";
import { deleteRedirect, getAdminSiteData, saveRedirect } from "@/lib/site-content.functions";

export const Route = createFileRoute("/_authenticated/admin/redirects")({
  head: () => ({
    meta: [
      { title: "Redirects — MunchReach Admin" },
      {
        name: "description",
        content: "Create and audit 301/302 redirects for retired or renamed MunchReach URLs.",
      },
    ],
  }),
  component: AdminRedirectsRoute,
});

type Draft = {
  id?: string;
  source: string;
  destination: string;
  statusCode: 301 | 302;
  isActive: boolean;
  note: string;
};

function AdminRedirectsRoute() {
  const queryClient = useQueryClient();
  const fetchData = useServerFn(getAdminSiteData);
  const save = useServerFn(saveRedirect);
  const remove = useServerFn(deleteRedirect);

  const [draft, setDraft] = useState<Draft | null>(null);

  const data = useQuery({ queryKey: ["admin-site-data"], queryFn: () => fetchData() });
  const redirects = (data.data?.redirects ?? []) as SiteRedirect[];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-site-data"] });
    queryClient.invalidateQueries({ queryKey: ["site-content"] });
  };

  const saveMutation = useMutation({
    mutationFn: (input: Draft) =>
      save({
        data: {
          ...(input.id ? { id: input.id } : {}),
          source: input.source,
          destination: input.destination,
          statusCode: input.statusCode,
          isActive: input.isActive,
          note: input.note || null,
        },
      }),
    onSuccess: () => {
      toast.success("Redirect saved");
      setDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Redirect deleted");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const validationError = draft
    ? validateRedirect(
        { ...(draft.id ? { id: draft.id } : {}), source: draft.source, destination: draft.destination },
        redirects,
      )
    : null;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Redirects</h1>
          <p className="text-sm text-muted-foreground">
            Applied before the page renders. Loops and duplicate sources are blocked on save.
          </p>
        </div>
        <Button
          onClick={() =>
            setDraft({ source: "/", destination: "/", statusCode: 301, isActive: true, note: "" })
          }
        >
          <Plus className="mr-1.5 size-4" /> New redirect
        </Button>
      </div>

      <div className="rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Note</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center">
                  <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : redirects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No redirects configured.
                </TableCell>
              </TableRow>
            ) : (
              redirects.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.source_path}</TableCell>
                  <TableCell className="font-mono text-xs">{r.destination_path}</TableCell>
                  <TableCell className="text-xs">{r.status_code}</TableCell>
                  <TableCell className="text-xs">
                    {r.is_active ? (
                      <span className="text-emerald-600 dark:text-emerald-400">Active</span>
                    ) : (
                      <span className="text-muted-foreground">Paused</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">
                    {r.note ?? "—"}
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setDraft({
                          id: r.id,
                          source: r.source_path,
                          destination: r.destination_path,
                          statusCode: r.status_code,
                          isActive: r.is_active,
                          note: r.note ?? "",
                        })
                      }
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => deleteMutation.mutate(r.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          {draft ? (
            <>
              <SheetHeader>
                <SheetTitle>{draft.id ? "Edit redirect" : "New redirect"}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label>Source path</Label>
                  <Input
                    value={draft.source}
                    placeholder="/old-page"
                    onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Destination</Label>
                  <Input
                    value={draft.destination}
                    placeholder="/new-page or https://…"
                    onChange={(e) => setDraft({ ...draft, destination: e.target.value })}
                  />
                </div>
                {validationError ? <p className="text-xs text-destructive">{validationError}</p> : null}
                <div className="space-y-1.5">
                  <Label>Redirect type</Label>
                  <Select
                    value={String(draft.statusCode)}
                    onValueChange={(v) => setDraft({ ...draft, statusCode: Number(v) as 301 | 302 })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="301">301 — Permanent</SelectItem>
                      <SelectItem value="302">302 — Temporary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Note</Label>
                  <Input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <span className="text-sm">Active</span>
                  <Switch
                    checked={draft.isActive}
                    onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked })}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDraft(null)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => saveMutation.mutate(draft)}
                    disabled={!!validationError || saveMutation.isPending}
                  >
                    {saveMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    Save redirect
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
