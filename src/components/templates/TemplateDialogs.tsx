import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createCampaign, listCampaigns } from "@/lib/campaigns.functions";
import { recordTemplateUse, saveTemplate } from "@/lib/templates.functions";
import {
  TEMPLATE_CATEGORIES,
  extractTemplateVariables,
  stashPendingTemplate,
  type EmailTemplateRow,
} from "@/lib/templates-model";

export function TemplatePreviewDialog({
  template,
  open,
  onOpenChange,
  onUse,
}: {
  template: EmailTemplateRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUse?: (template: EmailTemplateRow) => void;
}) {
  if (!template) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{template.name}</DialogTitle>
          <DialogDescription>
            {template.category}
            {template.is_official ? " · Official Sendloop template" : " · Workspace template"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {template.description ? (
            <p className="text-sm text-muted-foreground">{template.description}</p>
          ) : null}
          <div className="rounded-lg border border-border">
            <div className="border-b border-border px-4 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Subject
              </p>
              <p className="text-sm font-medium">{template.subject || "—"}</p>
            </div>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed">
              {template.body}
            </pre>
          </div>
          {template.variables.length ? (
            <div className="flex flex-wrap gap-1.5">
              {template.variables.map((v) => (
                <Badge key={v} variant="secondary" className="font-mono text-[11px]">
                  {`{{${v}}}`}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        {onUse ? (
          <DialogFooter>
            <Button onClick={() => onUse(template)}>Use template</Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export type TemplateDraft = {
  id?: string;
  name: string;
  category: string;
  description: string;
  subject: string;
  body: string;
  featured: boolean;
  published: boolean;
  displayOrder: number;
};

export const emptyTemplateDraft: TemplateDraft = {
  name: "",
  category: "Cold Outreach",
  description: "",
  subject: "",
  body: "",
  featured: false,
  published: true,
  displayOrder: 0,
};

export function TemplateEditorDialog({
  open,
  onOpenChange,
  draft,
  workspaceId,
  official,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: TemplateDraft;
  workspaceId: string | null;
  official: boolean;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<TemplateDraft>(draft);
  useEffect(() => setForm(draft), [draft, open]);

  const saveFn = useServerFn(saveTemplate);
  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          ...(form.id ? { id: form.id } : {}),
          workspaceId: official ? null : workspaceId,
          isOfficial: official,
          name: form.name.trim(),
          category: form.category,
          description: form.description.trim() || null,
          subject: form.subject,
          body: form.body,
          featured: form.featured,
          published: form.published,
          displayOrder: form.displayOrder,
        },
      }),
    onSuccess: () => {
      toast.success(form.id ? "Template updated" : "Template created");
      onOpenChange(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const variables = useMemo(
    () => extractTemplateVariables(form.subject, form.body),
    [form.subject, form.body],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit template" : "New template"}</DialogTitle>
          <DialogDescription>
            {official
              ? "Official templates appear in every customer's library once published."
              : "Saved to your workspace library."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Name</Label>
              <Input
                id="tpl-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Problem → proof"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(value) => setForm({ ...form, category: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-desc">Description</Label>
            <Input
              id="tpl-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="When to use this template"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-subject">Subject</Label>
            <Input
              id="tpl-subject"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="quick question about {{company}}"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-body">Body</Label>
            <Textarea
              id="tpl-body"
              rows={12}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder={"Hi {{first_name}},\n\n…"}
            />
          </div>
          {variables.length ? (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-muted-foreground">Variables detected:</span>
              {variables.map((v) => (
                <Badge key={v} variant="secondary" className="font-mono text-[11px]">
                  {`{{${v}}}`}
                </Badge>
              ))}
            </div>
          ) : null}
          {official ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.featured}
                  onCheckedChange={(v) => setForm({ ...form, featured: v })}
                />
                Featured
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.published}
                  onCheckedChange={(v) => setForm({ ...form, published: v })}
                />
                Published
              </label>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-order">Display order</Label>
                <Input
                  id="tpl-order"
                  type="number"
                  value={form.displayOrder}
                  onChange={(e) =>
                    setForm({ ...form, displayOrder: Number(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !form.name.trim() || !form.body.trim()}
          >
            {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Pick (or create) a campaign, then drop the template into its first email step. */
export function UseTemplateDialog({
  template,
  workspaceId,
  open,
  onOpenChange,
}: {
  template: EmailTemplateRow | null;
  workspaceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const fetchCampaigns = useServerFn(listCampaigns);
  const createFn = useServerFn(createCampaign);
  const recordFn = useServerFn(recordTemplateUse);
  const [campaignId, setCampaignId] = useState<string>("new");
  const [name, setName] = useState("");

  const campaignsQuery = useQuery({
    queryKey: ["campaigns", workspaceId],
    queryFn: () => fetchCampaigns({ data: { workspaceId: workspaceId ?? undefined } } as never),
    enabled: open && Boolean(workspaceId),
  });

  useEffect(() => {
    if (template && open) setName(`${template.name} campaign`);
  }, [template, open]);

  const go = useMutation({
    mutationFn: async () => {
      if (!template) throw new Error("No template selected");
      stashPendingTemplate({
        name: template.name,
        subject: template.subject,
        body: template.body,
      });
      if (workspaceId) {
        try {
          await recordFn({ data: { templateId: template.id, workspaceId } });
        } catch {
          /* usage tracking is best-effort */
        }
      }
      if (campaignId !== "new") return campaignId;
      if (!workspaceId) throw new Error("Select a workspace first");
      const created = await createFn({
        data: { workspaceId, name: name.trim() || template.name },
      });
      return (created as { id: string }).id;
    },
    onSuccess: (id) => {
      onOpenChange(false);
      void navigate({ to: "/campaigns/$campaignId", params: { campaignId: id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Use “{template?.name}”</DialogTitle>
          <DialogDescription>
            We&apos;ll insert this template into the first email step of the campaign you pick.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Campaign</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Create a new campaign</SelectItem>
                {(campaignsQuery.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {campaignId === "new" ? (
            <div className="space-y-1.5">
              <Label htmlFor="tpl-campaign-name">Campaign name</Label>
              <Input
                id="tpl-campaign-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => go.mutate()} disabled={go.isPending}>
            {go.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Open campaign builder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
