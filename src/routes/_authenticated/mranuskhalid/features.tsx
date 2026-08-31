import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Minus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { getFeatureMatrix, setPlanFeatureEnabled } from "@/lib/plans-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/features")({
  head: () => ({
    meta: [
      { title: "Feature Manager · MunchReach Admin" },
      {
        name: "description",
        content: "Enable or disable MunchReach features per plan. Enforced server-side.",
      },
    ],
  }),
  component: AdminFeaturesPage,
});

function AdminFeaturesPage() {
  const queryClient = useQueryClient();
  const load = useServerFn(getFeatureMatrix);
  const setFeature = useServerFn(setPlanFeatureEnabled);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-feature-matrix"],
    queryFn: () => load(),
  });

  const mutation = useMutation({
    mutationFn: (input: { planId: string; featureKey: string; enabled: boolean }) =>
      setFeature({ data: input }),
    onSuccess: () => {
      toast.success("Feature access updated");
      queryClient.invalidateQueries({ queryKey: ["admin-feature-matrix"] });
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const plans: { id: string; name: string; slug: string; isActive: boolean }[] =
    (data?.plans ?? []) as { id: string; name: string; slug: string; isActive: boolean }[];
  const categories = Array.from(new Set((data?.matrix ?? []).map((f) => f.category)));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Feature manager</h1>
        <p className="text-sm text-muted-foreground">
          Plan × feature permission matrix. Every toggle is enforced by the backend as well as the
          dashboard — disabling a feature makes the server reject those requests.
        </p>
      </header>

      {isLoading ? (
        <div className="surface-card flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading matrix…
        </div>
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Feature</th>
                {plans.map((plan) => (
                  <th key={plan.id} className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      {plan.name}
                      {!plan.isActive ? <Badge variant="secondary">Inactive</Badge> : null}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <>
                  <tr key={category} className="bg-muted/40">
                    <td
                      className="px-4 py-2 text-xs font-semibold uppercase text-muted-foreground"
                      colSpan={plans.length + 1}
                    >
                      {category}
                    </td>
                  </tr>
                  {(data?.matrix ?? [])
                    .filter((f) => f.category === category)
                    .map((feature) => (
                      <tr key={feature.key} className="border-b border-border/40 last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-medium">{feature.label}</div>
                          <div className="text-xs text-muted-foreground">{feature.description}</div>
                        </td>
                        {plans.map((plan) => {
                          const enabled = Boolean(feature.values[plan.id]);
                          return (
                            <td key={plan.id} className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={enabled}
                                  disabled={mutation.isPending}
                                  onCheckedChange={(v) =>
                                    mutation.mutate({
                                      planId: plan.id,
                                      featureKey: feature.key,
                                      enabled: v,
                                    })
                                  }
                                />
                                {enabled ? (
                                  <Check className="size-4 text-emerald-500" />
                                ) : (
                                  <Minus className="size-4 text-muted-foreground" />
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
