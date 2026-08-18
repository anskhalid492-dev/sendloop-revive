import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
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
import { createCampaign, deleteCampaign, listCampaigns } from "@/lib/campaigns.functions";

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

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-primary/10 text-primary",
  paused: "bg-amber-500/15 text-amber-600",
  completed: "bg-emerald-500/15 text-emerald-600",
  archived: "bg-muted text-muted-foreground",
  scheduled: "bg-primary/10 text-primary",
};

function CampaignsPage() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const fetchCampaigns = useServerFn(listCampaigns);
  const createFn = useServerFn(createCampaign);
  const deleteFn = useServerFn(deleteCampaign);

  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: () => fetchCampaigns() });

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
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: async () => {
      toast.success("Campaign deleted");
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = campaigns.data ?? [];

  return (
    <AppShell title="Campaigns">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Campaigns</h2>
            <p className="text-sm text-muted-foreground">
              Build a sequence, pick mailboxes and a schedule, then launch the queue.
            </p>
          </div>
          <Button onClick={() => setOpen(true)} disabled={!workspace}>
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
          <div className="grid gap-3">
            {rows.map((c) => (
              <div key={c.id} className="surface-card flex flex-wrap items-center gap-4 p-5">
                <div className="min-w-52 flex-1">
                  <Link
                    to="/campaigns/$campaignId"
                    params={{ campaignId: c.id }}
                    className="font-semibold hover:text-primary"
                  >
                    {c.name}
                  </Link>
                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                    {c.description || "No description"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${STATUS_STYLES[c.status] ?? ""}`}
                >
                  {c.status}
                </span>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{c.recipients}</span> queued
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{c.sent}</span> processed
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/campaigns/$campaignId" params={{ campaignId: c.id }}>
                      Open
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove.mutate(c.id)}
                    aria-label={`Delete ${c.name}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
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
