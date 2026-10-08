import { ArrowUpRight, BarChart3, CalendarDays, Check, ChevronDown, CircleCheck, Clock3, Inbox, Mail, MoreHorizontal, Reply, Send, Sparkles, Users } from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";

/** Static example workspace, never connected to customer data or sending. */
function CampaignDashboard() {
  return (
    <div className="hero-dashboard hero-product-window">
      <div className="flex h-14 items-center justify-between gap-4 border-b border-border px-5">
        <BrandLogo className="h-5 max-w-32" />
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="rounded bg-muted px-2 py-1">Example workspace</span>
          <span className="grid size-6 place-items-center rounded-full bg-accent font-semibold text-accent-foreground">AM</span>
        </div>
      </div>
      <div className="grid grid-cols-[44px_minmax(0,1fr)] sm:grid-cols-[52px_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-5 border-r border-border bg-secondary/40 py-5 text-muted-foreground">
          <BarChart3 className="size-4" />
          <span className="grid size-8 place-items-center rounded-md bg-primary/12 text-primary"><Send className="size-4" /></span>
          <Inbox className="size-4" />
          <Users className="size-4" />
          <CalendarDays className="size-4" />
        </div>
        <div className="min-w-0 p-4 sm:p-5">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground">Campaigns / Overview</p>
              <p className="mt-1 truncate text-sm font-bold sm:text-base">Retail partnerships</p>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-success/10 px-2 py-1 text-[10px] font-medium text-success"><span className="size-1.5 rounded-full bg-success" />Active</span>
          </div>
          <div className="mt-5 grid grid-cols-3 divide-x divide-border border-y border-border py-3">
            {[
              { icon: Mail, label: "Emails sent", value: "1,248" },
              { icon: Reply, label: "Replies", value: "86" },
              { icon: CalendarDays, label: "Meetings booked", value: "12" },
            ].map(({ icon: Icon, label, value }, index) => (
              <div key={label} className={index === 0 ? "min-w-0 pr-2" : "min-w-0 px-2 sm:px-4"}>
                <p className="flex items-center gap-1 text-[9px] text-muted-foreground sm:text-[10px]"><Icon className="hidden size-3 shrink-0 sm:block" />{label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between text-[10px]">
            <span className="font-semibold">Campaign performance</span>
            <span className="flex items-center gap-1 text-muted-foreground">Last 7 days <ChevronDown className="size-3" /></span>
          </div>
          <svg viewBox="0 0 440 98" className="mt-3 h-24 w-full" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="home-hero-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity=".18" /><stop offset="100%" stopColor="var(--primary)" stopOpacity="0" /></linearGradient></defs>
            {[15, 45, 75].map(y => <path key={y} d={`M0 ${y}H440`} stroke="var(--border)" strokeDasharray="3 4" />)}
            <path d="M0 83C22 83 26 66 48 69S77 80 96 58S124 64 147 48S179 63 199 39S231 49 252 29S281 43 304 22S342 35 365 16S399 22 440 5V98H0Z" fill="url(#home-hero-chart-fill)" />
            <path d="M0 83C22 83 26 66 48 69S77 80 96 58S124 64 147 48S179 63 199 39S231 49 252 29S281 43 304 22S342 35 365 16S399 22 440 5" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <div className="mt-1 flex justify-between text-[9px] text-muted-foreground"><span>Mon</span><span>Wed</span><span>Fri</span><span>Sun</span></div>
        </div>
      </div>
    </div>
  );
}

function SequenceCard() {
  return (
    <div className="hero-sequence hero-product-window">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="flex items-center gap-2 text-xs font-semibold"><Send className="size-3.5 text-primary" />Campaign sequence</span>
        <MoreHorizontal className="size-4 text-muted-foreground" />
      </div>
      <div className="px-4 py-3">
        <div className="flex items-center gap-2.5 text-[11px]"><span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Mail className="size-3.5" /></span><span className="min-w-0"><span className="block font-semibold">Personalized introduction</span><span className="text-muted-foreground">Step 1 · Email</span></span><CircleCheck className="ml-auto size-3.5 shrink-0 text-success" /></div>
        <div className="ml-3.5 border-l border-dashed border-primary/30 py-2 pl-6"><span className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Clock3 className="size-3" />Wait 3 days</span></div>
        <div className="flex items-center gap-2.5 text-[11px]"><span className="grid size-7 shrink-0 place-items-center rounded-md bg-accent text-primary"><Reply className="size-3.5" /></span><span><span className="block font-semibold">A fresh angle</span><span className="text-muted-foreground">Step 2 · Follow-up</span></span></div>
      </div>
      <div className="flex items-center gap-1.5 border-t border-border bg-muted/40 px-4 py-2 text-[10px] text-muted-foreground"><Check className="size-3 text-success" />Follow-ups stop when a lead replies</div>
    </div>
  );
}

function PersonalizedEmail() {
  return (
    <div className="hero-email hero-product-window">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3.5 sm:px-5">
        <span className="flex items-center gap-2 text-xs font-bold"><span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary"><Sparkles className="size-4" /></span>AI personalization</span>
        <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-success"><Check className="size-3" />Draft ready</span>
      </div>
      <div className="flex items-center gap-3 border-b border-border bg-secondary/35 px-4 py-3 sm:px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">JL</span>
        <div className="min-w-0 text-[11px]"><p className="font-semibold">Jamie Lee <span className="font-normal text-muted-foreground">· Founder</span></p><p className="mt-0.5 text-muted-foreground">Bloom & Co. <span className="px-1">·</span> Retail</p></div>
        <ArrowUpRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
      </div>
      <div className="px-4 py-4 sm:px-5">
        <p className="text-[10px] text-muted-foreground">Subject</p>
        <p className="mt-1 text-xs font-semibold">Jamie, an idea for Bloom & Co.</p>
        <div className="mt-3 border-t border-border pt-3 text-[12px] leading-[1.8] text-foreground/85">
          <p>Hi <span className="hero-personalized-detail">Jamie</span>,</p>
          <p className="mt-2">Reaching new stockists for <span className="hero-personalized-detail">Bloom & Co.</span> means keeping a lot of conversations going.</p>
          <p className="mt-2">MunchReach can help you send personal emails to <span className="hero-personalized-detail">retail buyers</span> and follow up without losing track of replies.</p>
          <p className="mt-2">Would this be useful for your next outreach?</p>
          <p className="mt-3">Best,<br /><span className="font-medium">Alex</span></p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 border-t border-border px-4 py-2.5 text-[10px] text-muted-foreground sm:px-5"><Sparkles className="size-3 text-primary" />Personalized for Jamie at Bloom & Co.</div>
    </div>
  );
}

export function HeroProductVisual() {
  return (
    <div className="hero-product-scene" role="img" aria-label="MunchReach example workspace showing campaign performance, automated follow-ups, and a personalized email to Jamie at Bloom & Co. All figures and prospect details are illustrative.">
      <CampaignDashboard />
      <PersonalizedEmail />
      <SequenceCard />
    </div>
  );
}
