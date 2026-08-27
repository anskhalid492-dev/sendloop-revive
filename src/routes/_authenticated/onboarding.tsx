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
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SETUP_STEPS } from "@/lib/setup-journey";
import { toIsoDate } from "@/lib/birthday-gift";

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
      { title: "Set up your workspace — MunchReach" },
      {
        name: "description",
        content:
          "Create your MunchReach workspace, tell us about your team and launch your first cold email campaign in minutes.",
      },
      { property: "og:title", content: "Set up your MunchReach workspace" },
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
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthYear, setBirthYear] = useState("");

  const birthdayIso = toIsoDate(birthMonth, birthDay, birthYear);
  const birthdayIncomplete =
    Boolean(birthMonth || birthDay || birthYear) && !birthdayIso;

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
          birthday: birthdayIso,
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
        <div className="mb-6 flex items-center justify-center">
          <BrandLogo className="h-9" />
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
                Welcome to MunchReach 👋
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                MunchReach is your managed cold email workspace. Import prospects, build multi-step
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
                <div className="space-y-2">
                  <Label htmlFor="birth-month">
                    Birthday <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      id="birth-month"
                      inputMode="numeric"
                      maxLength={2}
                      placeholder="MM"
                      aria-label="Birth month"
                      value={birthMonth}
                      onChange={(e) => setBirthMonth(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    />
                    <Input
                      inputMode="numeric"
                      maxLength={2}
                      placeholder="DD"
                      aria-label="Birth day"
                      value={birthDay}
                      onChange={(e) => setBirthDay(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    />
                    <Input
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="YYYY"
                      aria-label="Birth year"
                      value={birthYear}
                      onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    />
                  </div>
                  <p className={cn("text-xs", birthdayIncomplete ? "text-destructive" : "text-muted-foreground")}>
                    {birthdayIncomplete
                      ? "Enter a valid date as MM / DD / YYYY, or leave all three empty."
                      : "We send you a birthday gift — 1 month free on your plan. 🎁"}
                  </p>
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
                What do you want to use MunchReach for?
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
              <h1 className="mt-4 text-2xl font-bold tracking-tight">Your workspace is live 🎉</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Here&apos;s your guided path to the first reply. MunchReach runs the sending
                infrastructure — you bring the prospects and the message.
              </p>

              <ol className="mt-6 space-y-1">
                {SETUP_STEPS.map((item, i) => {
                  const done = item.key === "workspace";
                  const last = i === SETUP_STEPS.length - 1;
                  return (
                    <li key={item.key} className="relative flex gap-3 pb-1">
                      {!last ? (
                        <span
                          aria-hidden
                          className="absolute left-[13px] top-8 h-[calc(100%-1rem)] w-px bg-border"
                        />
                      ) : null}
                      <span
                        className={cn(
                          "relative z-[1] mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                          done
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground",
                        )}
                      >
                        {done ? <Check className="size-3.5" /> : item.index}
                      </span>
                      <div className="flex-1 rounded-lg px-2 py-1.5">
                        <p
                          className={cn(
                            "text-sm font-medium",
                            done ? "text-muted-foreground" : "text-foreground",
                          )}
                        >
                          {item.title}
                          <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                            {done ? "Done" : item.estimate}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <Button
                  className="flex-1"
                  onClick={() => navigate({ to: "/setup", replace: true })}
                >
                  Continue setup <ArrowRight className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate({ to: "/dashboard", replace: true })}
                >
                  Skip to dashboard
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
