import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Send } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { CampaignsTable } from "@/components/campaign/CampaignsTable";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import {
  bulkCampaignAction,
  createCampaign,
  deleteCampaign,
  duplicateCampaign,
  listCampaignsOverview,
  setCampaignStatus,
} from "@/lib/campaigns.functions";

export const Route = createFileRoute("/_authenticated/campaigns/")({
  head: () => ({
    meta: [
      { title: "Campaigns — Sendloop" },
      {
        name: "description",
        content:
          "Build multi-step cold email sequences, choose sending accounts, set your schedule and launch the send queue.",
      },
      { property: "og:title", content: "Campaigns — Sendloop" },
      {
        property: "og:description",
        content: "Multi-step sequences, mailbox rotation, schedules and a live send queue.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CampaignsPage,
});

function CampaignsPage() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const fetchOverview = useServerFn(listCampaignsOverview);
  const createFn = useServerFn(createCampaign);
  const deleteFn = useServerFn(deleteCampaign);
  const statusFn = useServerFn(setCampaignStatus);
  const duplicateFn = useServerFn(duplicateCampaign);
  const bulkFn = useServerFn(bulkCampaignAction);

  const campaigns = useQuery({ queryKey: ["campaigns", "overview"], queryFn: () => fetchOverview() });

  // Rows reflect live metric changes: sends, replies and status edits.
  useEffect(() => {
    const channel = supabase
      .channel("campaigns-overview")
      .on("postgres_changes", { event: "*", schema: "public", table: "campaigns" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_messages" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_replies" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["campaigns"] });

  const create = useMutation({
    mutationFn: async () => {
      if (!workspace) throw new Error("Workspace is still loading");
      return createFn({
        data: { workspaceId: workspace.id, name: name.trim(), description: description.trim() || undefined },
      });
    },
    onSuccess: async () => {
      setOpen(false);
      setName("");
      setDescription("");
      toast.success("Campaign created");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: async () => {
      toast.success("Campaign deleted");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeStatus = useMutation({
    mutationFn: (vars: { id: string; status: "active" | "paused" | "archived" }) =>
      statusFn({ data: vars }),
    onSuccess: async (_d, vars) => {
      toast.success(
        vars.status === "active" ? "Campaign resumed" : vars.status === "paused" ? "Campaign paused" : "Campaign archived",
      );
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => duplicateFn({ data: { id } }),
    onSuccess: async () => {
      toast.success("Campaign duplicated");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulk = useMutation({
    mutationFn: (vars: {
      action: "pause" | "resume" | "duplicate" | "archive" | "delete";
      ids: string[];
    }) => bulkFn({ data: vars }),
    onSuccess: async (result) => {
      if (result.succeeded.length > 0) {
        toast.success(`${result.succeeded.length} campaign(s) updated`);
      }
      if (result.failed.length > 0) {
        toast.error(`${result.failed.length} skipped: ${result.failed[0].reason}`);
      }
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = campaigns.data ?? [];
  const busyId =
    changeStatus.isPending
      ? changeStatus.variables?.id
      : duplicate.isPending
        ? duplicate.variables
        : remove.isPending
          ? remove.variables
          : null;

  return (
    <AppShell title="Campaigns">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold">Campaigns</h2>
            <p className="text-sm text-muted-foreground">
              Live performance for every sequence, straight from your send and reply data.
            </p>
          </div>
          <Button onClick={() => setOpen(true)} disabled={!workspace} className="shrink-0">
            <Plus className="mr-2 size-4" /> New campaign
          </Button>
        </div>

        {campaigns.isLoading ? (
          <div className="surface-card flex items-center justify-center p-16">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="surface-card p-12 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Send className="size-5" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">No campaigns yet</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Create your first campaign, add sequence steps, connect a sending account and launch.
            </p>
            <Button className="mt-5" onClick={() => setOpen(true)} disabled={!workspace}>
              <Plus className="mr-2 size-4" /> New campaign
            </Button>
          </div>
        ) : (
          <CampaignsTable
            rows={rows}
            busyId={busyId ?? null}
            onSetStatus={(id, status) => changeStatus.mutate({ id, status })}
            onDuplicate={(id) => duplicate.mutate(id)}
            onDelete={(id) => remove.mutate(id)}
            bulkBusy={bulk.isPending}
            onBulkAction={(action, ids) => bulk.mutateAsync({ action, ids }).then(() => undefined)}
          />
        )}
      </div>


      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New campaign</DialogTitle>
            <DialogDescription>
              Start with a name. You will add steps, mailboxes and a schedule next.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="campaign-name">Name</Label>
              <Input
                id="campaign-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Q3 agency outreach"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign-desc">Description</Label>
              <Textarea
                id="campaign-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Who this targets and what the offer is."
              />
            </div>
            <Button
              className="w-full"
              disabled={!name.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Create campaign
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
