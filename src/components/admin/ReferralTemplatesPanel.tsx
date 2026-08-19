import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  getReferralTemplates,
  saveReferralTemplates,
} from "@/lib/referral-templates.functions";
import {
  DEFAULT_REFERRAL_TEMPLATES,
  REFERRAL_TEMPLATE_KINDS,
  REFERRAL_TEMPLATE_LABELS,
  REFERRAL_TEMPLATE_FALLBACK_DETAIL,
  renderReferralTemplate,
  type ReferralTemplateKind,
  type ReferralTemplateMap,
} from "@/lib/referral-templates";

const SAMPLE = { amount: "$120.00", detail: "" };

/** Admin → Settings: edit, preview and toggle referrer notification emails. */
export function ReferralTemplatesPanel() {
  const fetchTemplates = useServerFn(getReferralTemplates);
  const persist = useServerFn(saveReferralTemplates);
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<ReferralTemplateMap>(DEFAULT_REFERRAL_TEMPLATES);
  const [active, setActive] = useState<ReferralTemplateKind>("referral_attributed");

  const q = useQuery({ queryKey: ["admin-referral-templates"], queryFn: () => fetchTemplates() });

  useEffect(() => {
    if (q.data) setDrafts(q.data as ReferralTemplateMap);
  }, [q.data]);

  const save = useMutation({
    mutationFn: (templates: ReferralTemplateMap) => persist({ data: { templates } }),
    onSuccess: (result) => {
      setDrafts(result as ReferralTemplateMap);
      queryClient.invalidateQueries({ queryKey: ["admin-referral-templates"] });
      toast.success("Referral templates saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function patch(kind: ReferralTemplateKind, changes: Partial<ReferralTemplateMap[ReferralTemplateKind]>) {
    setDrafts((prev) => ({ ...prev, [kind]: { ...prev[kind], ...changes } }));
  }

  const current = drafts[active];
  const vars = { amount: SAMPLE.amount, detail: REFERRAL_TEMPLATE_FALLBACK_DETAIL[active] };
  const previewSubject = renderReferralTemplate(current.subject, vars);
  const previewBody = renderReferralTemplate(current.body, vars);

  return (
    <div className="surface-card space-y-4 p-6 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">Referral notification emails</h3>
          <p className="text-muted-foreground">
            Copy sent to referrers. Variables:{" "}
            <code className="rounded bg-muted px-1">{"{{amount}}"}</code>{" "}
            <code className="rounded bg-muted px-1">{"{{detail}}"}</code>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDrafts(DEFAULT_REFERRAL_TEMPLATES)}
            disabled={save.isPending}
          >
            Reset to defaults
          </Button>
          <Button size="sm" onClick={() => save.mutate(drafts)} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save templates"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 border-t border-border/40 pt-4 lg:grid-cols-[220px_1fr_1fr]">
        <div className="space-y-1">
          {REFERRAL_TEMPLATE_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setActive(kind)}
              className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-xs transition ${
                active === kind ? "bg-primary/10 text-primary" : "hover:bg-muted"
              }`}
            >
              <span>{REFERRAL_TEMPLATE_LABELS[kind]}</span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  drafts[kind].enabled ? "bg-emerald-500" : "bg-muted-foreground/40"
                }`}
              />
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-md border border-border/40 px-3 py-2">
            <Label htmlFor="tpl-enabled" className="text-xs">
              Send this notification
            </Label>
            <Switch
              id="tpl-enabled"
              checked={current.enabled}
              onCheckedChange={(next) => patch(active, { enabled: next })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tpl-subject" className="text-xs">
              Subject / title
            </Label>
            <Input
              id="tpl-subject"
              value={current.subject}
              onChange={(e) => patch(active, { subject: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tpl-body" className="text-xs">
              Body
            </Label>
            <Textarea
              id="tpl-body"
              rows={6}
              value={current.body}
              onChange={(e) => patch(active, { body: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tpl-cta" className="text-xs">
              Button label
            </Label>
            <Input
              id="tpl-cta"
              value={current.ctaLabel}
              onChange={(e) => patch(active, { ctaLabel: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Preview</p>
          <div className="rounded-lg border border-border/60 bg-background p-4">
            <p className="text-xs text-muted-foreground">Subject</p>
            <p className="mb-3 font-semibold">{previewSubject}</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {previewBody}
            </p>
            <span className="mt-4 inline-block rounded-md bg-foreground px-4 py-2 text-xs font-medium text-background">
              {current.ctaLabel}
            </span>
          </div>
          {!current.enabled && (
            <p className="text-xs text-amber-600">
              This notification is turned off — referrers will not receive it.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
