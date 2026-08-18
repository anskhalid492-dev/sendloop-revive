import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteCampaign, duplicateCampaign } from "@/lib/campaigns.functions";
import type { CampaignBuilder } from "./useCampaignBuilder";

const NO_LIST = "__none__";

export function SettingsTab({ builder }: { builder: CampaignBuilder }) {
  const { campaignId, campaign, settings, patchSettings, lists, toggleStatus } = builder;
  const navigate = useNavigate();
  const duplicateFn = useServerFn(duplicateCampaign);
  const deleteFn = useServerFn(deleteCampaign);
  const [tagInput, setTagInput] = useState("");

  const duplicate = useMutation({
    mutationFn: () => duplicateFn({ data: { id: campaignId, includeLeads: false } }),
    onSuccess: (result: { id: string }) => {
      toast.success("Campaign duplicated");
      void navigate({ to: "/campaigns/$campaignId", params: { campaignId: result.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { id: campaignId } }),
    onSuccess: () => {
      toast.success("Campaign deleted");
      void navigate({ to: "/campaigns" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!settings || !campaign) return null;

  const addTag = () => {
    const value = tagInput.trim();
    if (!value || settings.tags.includes(value)) return;
    patchSettings({ tags: [...settings.tags, value] });
    setTagInput("");
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="surface-card space-y-4 p-5">
        <h3 className="font-semibold">Campaign details</h3>
        <div className="space-y-1.5">
          <Label htmlFor="campaign-name">Name</Label>
          <Input
            id="campaign-name"
            value={settings.name}
            onChange={(e) => patchSettings({ name: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="campaign-desc">Description</Label>
          <Textarea
            id="campaign-desc"
            rows={3}
            placeholder="What is this campaign for?"
            value={settings.description}
            onChange={(e) => patchSettings({ description: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Default lead list</Label>
          <Select
            value={settings.listId ?? NO_LIST}
            onValueChange={(v) => patchSettings({ listId: v === NO_LIST ? null : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a list" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_LIST}>No list</SelectItem>
              {lists.map((list) => (
                <SelectItem key={list.id} value={list.id}>
                  {list.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="campaign-tags">Tags</Label>
          <div className="flex gap-2">
            <Input
              id="campaign-tags"
              value={tagInput}
              placeholder="Add a tag and press Enter"
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addTag}>
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {settings.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1 font-normal">
                {tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  onClick={() => patchSettings({ tags: settings.tags.filter((t) => t !== tag) })}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      </section>



      <section className="surface-card space-y-4 p-5">
        <h3 className="font-semibold">Campaign lifecycle</h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium capitalize">{campaign.status}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Created</span>
            <span className="font-medium">
              {new Date(campaign.created_at).toLocaleDateString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Launched</span>
            <span className="font-medium">
              {campaign.launched_at
                ? new Date(campaign.launched_at).toLocaleString()
                : "Not launched"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="outline" onClick={() => duplicate.mutate()} disabled={duplicate.isPending}>
            {duplicate.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Copy className="mr-2 size-4" />
            )}
            Duplicate
          </Button>
          {campaign.status === "archived" ? (
            <Button variant="outline" onClick={() => toggleStatus.mutate("draft")}>
              Restore to draft
            </Button>
          ) : (
            <Button variant="outline" onClick={() => toggleStatus.mutate("archived")}>
              Archive campaign
            </Button>
          )}
        </div>

        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">Delete this campaign</p>
          <p className="text-xs text-muted-foreground">
            Removes the sequence, schedule and queue. Your leads stay in the workspace.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="mt-3">
                <Trash2 className="mr-2 size-4" /> Delete campaign
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{settings.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  This cannot be undone. Queued sends for this campaign are cancelled.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => remove.mutate()}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </section>
    </div>
  );
}
