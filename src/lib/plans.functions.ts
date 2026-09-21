import { createServerFn } from "@tanstack/react-start";

export type PlanFeature = {
  id: string;
  plan_id: string;
  category: string;
  name: string;
  included: boolean;
  value: string | null;
  sort_order: number;
  created_at: string;
  /** Non-null rows drive server-side gating and are hidden from pricing UI. */
  feature_key: string | null;
};

export type Plan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  tagline: string | null;
  sort_order: number;
  monthly_price: number;
  yearly_price: number;
  /** "recurring" (default) or "lifetime" for one-time purchases. */
  billing_type: string | null;
  one_time_price: number | null;
  compare_at_price: number | null;
  /** Lifetime deals are hidden from the public pricing page. */
  public_on_pricing_page: boolean;
  is_popular: boolean;
  is_enterprise: boolean;
  max_workspaces: number | null;
  max_users: number | null;
  max_leads: number | null;
  max_campaigns: number | null;
  max_active_campaigns: number | null;
  max_emails_monthly: number | null;
  max_emails_daily: number | null;
  max_sending_accounts: number | null;
  max_ai_monthly: number | null;
  max_automations: number | null;
  max_warmup_daily: number | null;
  warmup_enabled: boolean;
  unified_inbox_enabled: boolean;
  analytics_enabled: boolean;
  api_access: boolean;
  priority_support: boolean;
  custom_branding: boolean;
  sso_enabled: boolean;
  created_at: string;
  updated_at: string;
  features: PlanFeature[];
};

export const getPlans = createServerFn({ method: "GET" }).handler(async () => {
  // Public pricing data: read with the publishable key (RLS/anon policies apply)
  // so the marketing pages work without the service role key.
  const { createClient } = await import("@supabase/supabase-js");
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import(
    "@/integrations/supabase/config"
  );
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (h.get("Authorization") === `Bearer ${SUPABASE_PUBLISHABLE_KEY}`) h.delete("Authorization");
        h.set("apikey", SUPABASE_PUBLISHABLE_KEY);
        return fetch(input, { ...init, headers: h });
      },
    },
  });

  const { data: plans, error } = await supabaseAdmin
    .from("plans")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);

  const { data: features, error: featuresError } = await supabaseAdmin
    .from("plan_features")
    .select("*")
    .order("sort_order", { ascending: true });
  if (featuresError) throw new Error(featuresError.message);

  const featuresByPlan = new Map<string, PlanFeature[]>();
  for (const f of (features ?? []) as PlanFeature[]) {
    const list = featuresByPlan.get(f.plan_id) ?? [];
    list.push(f);
    featuresByPlan.set(f.plan_id, list);
  }

  return (plans ?? []).map((p) => ({
    ...p,
    features: featuresByPlan.get(p.id) ?? [],
  })) as Plan[];
});
