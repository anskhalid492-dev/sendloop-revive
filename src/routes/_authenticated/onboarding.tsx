import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Circle,
  Rocket,
  Send,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  GOALS,
  PERSONAS,
  TEAM_SIZES,
  completeOnboarding,
  getOnboardingState,
} from "@/lib/onboarding.functions";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your workspace — Sendloop" },
      {
        name: "description",
        content:
          "Create your Sendloop workspace, tell us about your team and launch your first cold email campaign in minutes.",
      },
      { property: "og:title", content: "Set up your Sendloop workspace" },
      {
        property: "og:description",
        content: "A short guided setup: workspace, team details and your outreach goal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OnboardingPage,
});

const STEPS = ["Welcome", "Workspace", "About you", "Goal", "Get started"] as const;

function OptionGrid({
  options,
  value,
  onChange,
  columns = 3,
}: {
  options: readonly string[];
  value: string | null;
  onChange: (v: string) => void;
  columns?: number;
}) {
  return (
    <div className={cn("grid gap-2", columns === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
      {options.map((option) => {
        const active = value === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              "rounded-xl border px-3 py-3 text-sm font-medium transition-all",
              active
                ? "border-primary bg-primary/10 text-primary shadow-sm"
                : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchState = useServerFn(getOnboardingState);
  const complete = useServerFn(completeOnboarding);

  const state = useQuery({ queryKey: ["onboarding-state"], queryFn: () => fetchState() });

  const [step, setStep] = useState(0);
  const [workspaceName, setWorkspaceName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [persona, setPersona] = useState<string | null>(null);
  const [teamSize, setTeamSize] = useState<string | null>(null);
  const [goal, setGoal] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      complete({
        data: {
          workspaceName: workspaceName.trim(),
          companyName: companyName.trim() || null,
          logoUrl: logoUrl.trim() || null,
          persona,
          teamSize,
          goal,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      await queryClient.invalidateQueries({ queryKey: ["onboarding-state"] });
      setStep(4);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const created = mutation.isSuccess;

  // Onboarding is only for accounts without a workspace yet — anyone who already
  // has one (or just finished the wizard) goes straight to the dashboard.
  useEffect(() => {
    if (created) return;
    if (state.data && state.data.workspaceCount > 0) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [state.data, created, navigate]);



  return (
    <div className="hero-glow flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Send className="size-4" />
          </span>
          <span className="text-base font-bold tracking-tight">Sendloop</span>
        </div>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center gap-1.5">
            {STEPS.map((label, index) => (
              <div
                key={label}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  index <= step ? "bg-primary" : "bg-border",
                )}
              />
            ))}
          </div>
          <p className="mt-2 text-xs font-medium text-muted-foreground">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </p>
        </div>

        <div className="surface-card p-6 sm:p-8">
          {step === 0 && (
            <div className="animate-in fade-in duration-300">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="size-3.5" /> Let's get you set up
              </span>
              <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
                Welcome to Sendloop 👋
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Sendloop is your managed cold email workspace. Import prospects, build multi-step
                campaigns with smart follow-ups, and handle every reply in one shared inbox — while
                we run the sending infrastructure and deliverability for you.
              </p>
              <ul className="mt-5 space-y-2.5 text-sm">
                {[
                  "Import and organise leads with filters, tags and CRM stages",
                  "Build sequences with A/B variants and automatic follow-ups",
                  "Track replies, positive replies and meetings in real time",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
              <Button className="mt-6 w-full" onClick={() => setStep(1)}>
                Get started <ArrowRight className="size-4" />
              </Button>
            </div>
          )}

          {step === 1 && (
            <form
              className="animate-in fade-in duration-300"
              onSubmit={(e) => {
                e.preventDefault();
                setStep(2);
              }}
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="size-5" />
              </span>
              <h1 className="mt-4 text-2xl font-bold tracking-tight">Create your workspace</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Workspaces hold your campaigns, prospects and teammates.
              </p>

              <div className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="workspace-name">Workspace name</Label>
                  <Input
                    id="workspace-name"
                    required
                    minLength={2}
                    autoFocus
                    placeholder="Northpeak Outreach"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-name">
                    Company name <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="company-name"
                    placeholder="Northpeak Ltd."
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="logo-url">
                    Logo URL <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="logo-url"
                    type="url"
                    placeholder="https://yourcompany.com/logo.png"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                  />
                  {logoUrl.trim() ? (
                    <img
                      src={logoUrl}
                      alt="Workspace logo preview"
                      className="mt-2 size-12 rounded-lg border border-border object-contain"
                    />
                  ) : null}
                </div>
              </div>

              <div className="mt-6 flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setStep(0)}>
                  <ArrowLeft className="size-4" /> Back
                </Button>
                <Button type="submit" className="flex-1">
                  Continue <ArrowRight className="size-4" />
                </Button>
              </div>
            </form>
          )}

          {step === 2 && (
            <div className="animate-in fade-in duration-300">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Users className="size-5" />
              </span>
              <h1 className="mt-4 text-2xl font-bold tracking-tight">About you</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                This helps us tailor templates and defaults. You can skip it.
              </p>

              <div className="mt-6 space-y-5">
                <div className="space-y-2">
                  <Label>What best describes you?</Label>
                  <OptionGrid options={PERSONAS} value={persona} onChange={setPersona} />
                </div>
                <div className="space-y-2">
                  <Label>How many people are on your team?</Label>
                  <OptionGrid options={TEAM_SIZES} value={teamSize} onChange={setTeamSize} />
                </div>
              </div>

              <div className="mt-6 flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                  <ArrowLeft className="size-4" /> Back
                </Button>
                <Button type="button" variant="ghost" className="ml-auto" onClick={() => setStep(3)}>
                  Skip
                </Button>
                <Button type="button" onClick={() => setStep(3)}>
                  Continue <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-in fade-in duration-300">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Target className="size-5" />
              </span>
              <h1 className="mt-4 text-2xl font-bold tracking-tight">Your outreach goal</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                What do you want to use Sendloop for?
              </p>

              <div className="mt-6">
                <OptionGrid options={GOALS} value={goal} onChange={setGoal} columns={2} />
              </div>

              <div className="mt-6 flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => setStep(2)}>
                  <ArrowLeft className="size-4" /> Back
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="ml-auto"
                  disabled={mutation.isPending || created}
                  onClick={() => {
                    setGoal(null);
                    mutation.mutate();
                  }}
                >
                  Skip
                </Button>
                <Button
                  type="button"
                  disabled={mutation.isPending || created}
                  onClick={() => mutation.mutate()}
                >
                  {mutation.isPending ? "Creating…" : "Finish setup"}
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="animate-in fade-in duration-300">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Rocket className="size-5" />
              </span>
              <h1 className="mt-4 text-2xl font-bold tracking-tight">You're all set 🎉</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Here's the fastest path to your first replies. Sendloop handles the sending
                infrastructure — you just bring the prospects and the message.
              </p>

              <ul className="mt-6 space-y-3">
                {[
                  { label: "Workspace created", done: true },
                  { label: "Add or import leads", done: false },
                  { label: "Create your first campaign", done: false },
                  { label: "Launch your first campaign", done: false },
                ].map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                  >
                    {item.done ? (
                      <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3.5" />
                      </span>
                    ) : (
                      <Circle className="size-6 text-muted-foreground/40" />
                    )}
                    <span
                      className={cn(
                        "text-sm font-medium",
                        item.done ? "text-muted-foreground line-through" : "text-foreground",
                      )}
                    >
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                className="mt-6 w-full"
                onClick={() => navigate({ to: "/dashboard", replace: true })}
              >
                Go to Dashboard <ArrowRight className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
