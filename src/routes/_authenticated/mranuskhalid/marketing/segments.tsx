import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MarketingEmpty,
  MarketingLoading,
  MarketingPanel,
} from "@/components/admin/marketing/MarketingUI";
import {
  deleteMarketingSegment,
  listMarketingSegments,
  previewMarketingSegment,
  saveMarketingSegment,
} from "@/lib/marketing.functions";
import type { SegmentDefinition } from "@/lib/marketing/types";

export const Route = createFileRoute("/_authenticated/admin/marketing/segments")({
  head: () => ({
    meta: [
      { title: "Marketing Segments — MunchReach Admin" },
      {
        name: "description",
        content:
          "Built-in and custom marketing segments based on real product behaviour: plan, trial state, activation and engagement.",
      },
      { property: "og:title", content: "Marketing Segments — MunchReach Admin" },
      {
        property: "og:description",
        content: "Define who receives MunchReach marketing email.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SegmentsPage,
});

const DEFAULT_RULES: SegmentDefinition = {
  match: "all",
  rules: [{ field: "plan", operator: "eq", value: "free" }],
};

function SegmentsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listMarketingSegments);
  const save = useServerFn(saveMarketingSegment);
  const remove = useServerFn(deleteMarketingSegment);
  const preview = useServerFn(previewMarketingSegment);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState(JSON.stringify(DEFAULT_RULES, null, 2));
  const [previewResult, setPreviewResult] = useState<{ key: string; count: number } | null>(null);

  const query = useQuery({
    queryKey: ["admin", "marketing", "segments"],
    queryFn: () => list(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "marketing"] });

  const saveMutation = useMutation({
    mutationFn: () => {
      const parsed = JSON.parse(rules) as SegmentDefinition;
      return save({ data: { name, description, kind: "rule", conditions: parsed } });
    },
    onSuccess: () => {
      toast.success("Segment saved");
      setName("");
      setDescription("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const previewMutation = useMutation({
    mutationFn: (vars: { segmentId?: string | null; segmentKey?: string | null }) =>
      preview({ data: vars }),
    onSuccess: (result, vars) => {
      setPreviewResult({
        key: String(vars.segmentId ?? vars.segmentKey ?? ""),
        count: result.count,
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Segment deleted");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading) return <MarketingLoading label="Loading segments" />;
  const data = query.data;

  return (
    <div className="space-y-6">
      <MarketingPanel
        title="Built-in segments"
        description="Derived live from product state — plan, trial, activation, engagement and churn risk."
      >
        <div className="grid gap-2 md:grid-cols-2">
          {(data?.builtIn ?? []).map((segment) => (
            <div
              key={segment.key}
              className="flex items-start justify-between gap-3 rounded-md border px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium">{segment.name}</p>
                <p className="text-xs text-muted-foreground">{segment.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {previewResult?.key === segment.key ? (
                  <Badge variant="secondary">{previewResult.count}</Badge>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => previewMutation.mutate({ segmentKey: segment.key })}
                >
                  Count
                </Button>
              </div>
            </div>
          ))}
        </div>
      </MarketingPanel>

      <MarketingPanel
        title="Custom segments"
        description="Rule-based segments evaluated against subscriber attributes."
      >
        {(data?.custom ?? []).length === 0 ? (
          <MarketingEmpty title="No custom segments yet" />
        ) : (
          <div className="divide-y">
            {(data?.custom ?? []).map((segment) => (
              <div key={segment.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="text-sm font-medium">{segment.name}</p>
                  <p className="text-xs text-muted-foreground">{segment.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {previewResult?.key === segment.id ? (
                    <Badge variant="secondary">{previewResult.count}</Badge>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => previewMutation.mutate({ segmentId: segment.id })}
                  >
                    Count
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(segment.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </MarketingPanel>

      <MarketingPanel
        title="New custom segment"
        description="Fields: plan, trial_status, signup_date, last_active_at, activated, tags, engagement_score."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Rules (JSON)</Label>
            <Textarea
              rows={8}
              value={rules}
              onChange={(event) => setRules(event.target.value)}
              className="font-mono text-xs"
            />
          </div>
        </div>
        <Button
          className="mt-3"
          onClick={() => saveMutation.mutate()}
          disabled={!name.trim() || saveMutation.isPending}
        >
          Save segment
        </Button>
      </MarketingPanel>
    </div>
  );
}
