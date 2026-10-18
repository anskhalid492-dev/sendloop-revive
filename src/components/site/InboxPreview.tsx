import { useMemo, useState } from "react";
import {
  Archive,
  Calendar,
  ChevronDown,
  Clock,
  FileText,
  Image as ImageIcon,
  Inbox,
  Link2,
  Mail,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Smile,
  Star,
  Trash2,
  TrendingUp,
  Type,
  X,
} from "lucide-react";

import type { InboxFolder } from "@/lib/inbox-model";

/**
 * High-fidelity mock of the MunchReach unified inbox for marketing pages.
 *
 * Mailbox navigation (Inbox, Sent, Drafts, Follow-ups) is interactive and
 * mirrors the real product's folder model — folder ids come from
 * `InboxFolder` so the preview and the app stay in step. Data is local
 * sample content; nothing is fetched.
 */

/** Follow-ups is a smart view in the product; the rest are real folders. */
type PreviewFolder = Extract<InboxFolder, "inbox" | "sent" | "drafts"> | "followups";

const navFolders: { id: PreviewFolder; label: string; icon: typeof Inbox; count?: number }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox, count: 12 },
  { id: "sent", label: "Sent", icon: Send, count: 48 },
  { id: "drafts", label: "Drafts", icon: FileText, count: 3 },
  { id: "followups", label: "Follow-ups", icon: TrendingUp, count: 9 },
];

const staticFolders = [
  { label: "Snoozed", icon: Clock },
  { label: "Templates", icon: Mail },
  { label: "All Mail", icon: Archive },
  { label: "Trash", icon: Trash2 },
];

const mailboxes = [
  { label: "Sales", count: 12, tone: "bg-primary" },
  { label: "Outreach", count: 7, tone: "bg-sky-500" },
  { label: "Partnerships", count: 2, tone: "bg-emerald-500" },
  { label: "Renewals", count: 1, tone: "bg-amber-500" },
  { label: "Support", count: 4, tone: "bg-muted-foreground" },
];

const views = [
  { icon: Star, label: "Interested", count: 6 },
  { icon: Clock, label: "Out of office", count: 2 },
  { icon: TrendingUp, label: "Needs follow up", count: 9 },
  { icon: Calendar, label: "Meeting booked", count: 3 },
];

type Tone = "interested" | "ooo" | "followup" | "booked" | "draft" | "sent";

const toneClass: Record<Tone, string> = {
  interested: "bg-primary/12 text-primary",
  ooo: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  followup: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  booked: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  draft: "bg-muted text-muted-foreground",
  sent: "bg-muted text-muted-foreground",
};

type Message = { from: string; email: string; to: string; time: string; body: string[]; outbound?: boolean };

type Thread = {
  id: string;
  name: string;
  email: string;
  role: string;
  company: string;
  mailbox: string;
  subject: string;
  snippet: string;
  time: string;
  label: string;
  tone: Tone;
  tags: string[];
  messages: Message[];
};

const me = { name: "Priya Nair", email: "priya@sendloop.io" };

const threadsByFolder: Record<PreviewFolder, Thread[]> = {
  inbox: [
    {
      id: "marcus",
      name: "Marcus Lee",
      email: "marcus@fieldstack.com",
      role: "Head of Growth",
      company: "Fieldstack Robotics",
      mailbox: "Sales",
      subject: "Scaling outbound with intent data",
      snippet: "Hi Priya, thanks for reaching out — your platform looks…",
      time: "10:24 AM",
      label: "Interested",
      tone: "interested",
      tags: ["Intent: product research", "Intent: enrichment", "SaaS"],
      messages: [
        {
          from: "Marcus Lee",
          email: "marcus@fieldstack.com",
          to: me.name,
          time: "10:24 AM",
          body: [
            "Hi Priya,",
            "Thanks for reaching out. Your platform looks really interesting and lines up with what we're building at Fieldstack.",
            "Can we schedule a quick call next week to learn more?",
            "Best,\nMarcus",
          ],
        },
        {
          from: me.name,
          email: me.email,
          to: "Marcus Lee",
          time: "10:45 AM",
          outbound: true,
          body: ["Hi Marcus,", "Absolutely — does Tuesday or Wednesday morning work for you?", "Best,\nPriya"],
        },
      ],
    },
    {
      id: "sarah",
      name: "Sarah Chen",
      email: "sarah@northline.io",
      role: "VP Sales",
      company: "Northline",
      mailbox: "Outreach",
      subject: "Re: Intro to Fieldstack",
      snippet: "Hi Priya, I'm currently out of office until…",
      time: "9:15 AM",
      label: "Out of office",
      tone: "ooo",
      tags: ["Auto-reply", "Retry 28 May"],
      messages: [
        {
          from: "Sarah Chen",
          email: "sarah@northline.io",
          to: me.name,
          time: "9:15 AM",
          body: [
            "Hi Priya,",
            "I'm currently out of office until 28 May with limited access to email. I'll get back to you when I return.",
            "Sarah",
          ],
        },
      ],
    },
    {
      id: "amy",
      name: "Amy Patel",
      email: "amy@growthco.com",
      role: "Demand Gen Lead",
      company: "GrowthCo",
      mailbox: "Sales",
      subject: "Full enrichment access",
      snippet: "Thanks for the information! We'd like to see pricing…",
      time: "May 21",
      label: "Interested",
      tone: "interested",
      tags: ["Pricing requested", "Mid-market"],
      messages: [
        {
          from: "Amy Patel",
          email: "amy@growthco.com",
          to: me.name,
          time: "May 21",
          body: ["Thanks for the information!", "We'd like to see pricing for full enrichment access for a team of 12.", "Amy"],
        },
      ],
    },
  ],
  sent: [
    {
      id: "sent-chris",
      name: "Chris Miller",
      email: "chris@arcadia.co",
      role: "Founder",
      company: "Arcadia",
      mailbox: "Sales",
      subject: "Re: Meeting request",
      snippet: "Tuesday 10:00 works — invite sent with the agenda.",
      time: "11:02 AM",
      label: "Sent",
      tone: "sent",
      tags: ["Meeting booked", "Warm"],
      messages: [
        {
          from: me.name,
          email: me.email,
          to: "Chris Miller",
          time: "11:02 AM",
          outbound: true,
          body: ["Hi Chris,", "Tuesday at 10:00 works on our side — invite is on the way with a short agenda.", "Priya"],
        },
      ],
    },
    {
      id: "sent-dana",
      name: "Dana Whitfield",
      email: "dana@lumen.dev",
      role: "COO",
      company: "Lumen",
      mailbox: "Outreach",
      subject: "Deliverability review for Lumen",
      snippet: "Sharing the domain audit we ran on lumen.dev…",
      time: "Yesterday",
      label: "Sent",
      tone: "sent",
      tags: ["Sequence step 2", "Enterprise"],
      messages: [
        {
          from: me.name,
          email: me.email,
          to: "Dana Whitfield",
          time: "Yesterday",
          outbound: true,
          body: [
            "Hi Dana,",
            "Sharing the domain audit we ran on lumen.dev — SPF and DKIM pass, DMARC is still at p=none.",
            "Happy to walk through the fixes.",
            "Priya",
          ],
        },
      ],
    },
  ],
  drafts: [
    {
      id: "draft-michael",
      name: "Michael Kumar",
      email: "michael@northline.io",
      role: "Head of RevOps",
      company: "Northline",
      mailbox: "Sales",
      subject: "Northline + GrowthCo",
      snippet: "Draft · Following up on the pilot scope we discussed…",
      time: "Draft",
      label: "Draft",
      tone: "draft",
      tags: ["Pilot", "Needs pricing"],
      messages: [
        {
          from: me.name,
          email: me.email,
          to: "Michael Kumar",
          time: "Draft",
          outbound: true,
          body: [
            "Hi Michael,",
            "Following up on the pilot scope we discussed — two mailboxes, 400 leads, four weeks.",
            "Anything you'd change before we kick off?",
          ],
        },
      ],
    },
    {
      id: "draft-elena",
      name: "Elena Rossi",
      email: "elena@vectorlab.eu",
      role: "Marketing Director",
      company: "VectorLab",
      mailbox: "Partnerships",
      subject: "Co-marketing idea",
      snippet: "Draft · A joint deliverability webinar in September…",
      time: "Draft",
      label: "Draft",
      tone: "draft",
      tags: ["Partnership"],
      messages: [
        {
          from: me.name,
          email: me.email,
          to: "Elena Rossi",
          time: "Draft",
          outbound: true,
          body: ["Hi Elena,", "Would a joint deliverability webinar in September be interesting for VectorLab?"],
        },
      ],
    },
  ],
  followups: [
    {
      id: "fu-david",
      name: "David Lee",
      email: "david@heliostack.com",
      role: "CTO",
      company: "Heliostack",
      mailbox: "Outreach",
      subject: "Follow up from last week",
      snippet: "Just bumping this to the top of your inbox.",
      time: "May 20",
      label: "Needs follow up",
      tone: "followup",
      tags: ["No reply · 6 days", "Step 3 due"],
      messages: [
        {
          from: me.name,
          email: me.email,
          to: "David Lee",
          time: "May 20",
          outbound: true,
          body: ["Hi David,", "Just bumping this to the top of your inbox in case it slipped.", "Priya"],
        },
      ],
    },
    {
      id: "fu-nina",
      name: "Nina Alvarez",
      email: "nina@brightpath.io",
      role: "Head of Sales",
      company: "Brightpath",
      mailbox: "Sales",
      subject: "Re: Warmup results",
      snippet: "Opened 4 times, no reply — follow-up scheduled today.",
      time: "May 19",
      label: "Needs follow up",
      tone: "followup",
      tags: ["Opened 4x", "High intent"],
      messages: [
        {
          from: me.name,
          email: me.email,
          to: "Nina Alvarez",
          time: "May 19",
          outbound: true,
          body: ["Hi Nina,", "Sharing the warmup activity from the first two weeks — daily volumes and recent mailbox events are ready to review."],
        },
      ],
    },
    {
      id: "fu-tom",
      name: "Tom Becker",
      email: "tom@kestrel.de",
      role: "Managing Director",
      company: "Kestrel",
      mailbox: "Renewals",
      subject: "Renewal check-in",
      snippet: "Auto follow-up queued for tomorrow 9:00.",
      time: "May 18",
      label: "Needs follow up",
      tone: "followup",
      tags: ["Renewal", "Queued"],
      messages: [
        {
          from: me.name,
          email: me.email,
          to: "Tom Becker",
          time: "May 18",
          outbound: true,
          body: ["Hi Tom,", "Checking in ahead of your renewal — happy to review usage together this week."],
        },
      ],
    },
  ],
};

const folderMeta: Record<PreviewFolder, { title: string; footer: string; composer: string }> = {
  inbox: { title: "Inbox", footer: "1–25 of 312", composer: "Write your reply…" },
  sent: { title: "Sent", footer: "1–25 of 1,204", composer: "Write a new message…" },
  drafts: { title: "Drafts", footer: "3 drafts", composer: "Continue your draft…" },
  followups: { title: "Follow-ups", footer: "9 threads awaiting a reply", composer: "Write your follow-up…" },
};

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Avatar({ name, className = "size-8" }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`grid ${className} shrink-0 place-items-center rounded-full bg-primary/12 text-[10px] font-semibold text-primary`}
    >
      {initials(name)}
    </span>
  );
}

export function InboxPreview({ className = "" }: { className?: string }) {
  const [folder, setFolder] = useState<PreviewFolder>("inbox");
  const [selectedByFolder, setSelectedByFolder] = useState<Partial<Record<PreviewFolder, string>>>({});

  const threads = threadsByFolder[folder];
  const active = useMemo(() => {
    const id = selectedByFolder[folder];
    return threads.find((t) => t.id === id) ?? threads[0]!;
  }, [folder, selectedByFolder, threads]);

  const meta = folderMeta[folder];

  return (
    <div
      aria-label="MunchReach unified inbox preview"
      className={`overflow-hidden rounded-2xl border border-border/70 bg-card text-[13px] ${className}`}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[190px_minmax(0,1fr)] xl:grid-cols-[190px_300px_minmax(0,1fr)] 2xl:grid-cols-[190px_300px_minmax(0,1fr)_248px]">
        {/* Sidebar */}
        <aside className="hidden flex-col border-r border-border/60 bg-muted/30 p-3 lg:flex">
          <div className="flex items-center gap-2 px-1 pb-3">
            <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Send className="size-3.5" />
            </span>
            <span className="text-sm font-semibold">MunchReach</span>
          </div>

          <div className="flex items-center gap-px">
            <span className="flex flex-1 items-center justify-center gap-1.5 rounded-l-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
              <Pencil className="size-3.5" /> Compose
            </span>
            <span className="grid place-items-center rounded-r-lg bg-primary px-2 py-2 text-primary-foreground">
              <ChevronDown className="size-3.5" />
            </span>
          </div>

          <nav className="mt-4 space-y-0.5" aria-label="Mailbox folders">
            {navFolders.map((f) => {
              const isActive = f.id === folder;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFolder(f.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${
                    isActive
                      ? "bg-primary/12 font-semibold text-primary"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  }`}
                >
                  <f.icon className="size-3.5 shrink-0" />
                  <span className="flex-1 truncate">{f.label}</span>
                  {f.count ? <span className="text-[11px]">{f.count}</span> : null}
                </button>
              );
            })}
            {staticFolders.map((f) => (
              <div
                key={f.label}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground/70"
              >
                <f.icon className="size-3.5 shrink-0" />
                <span className="flex-1 truncate">{f.label}</span>
              </div>
            ))}
          </nav>

          <p className="mt-5 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
            Mailboxes
          </p>
          <div className="mt-2 space-y-0.5">
            {mailboxes.map((m) => (
              <div key={m.label} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground">
                <span className={`size-1.5 shrink-0 rounded-full ${m.tone}`} />
                <span className="flex-1 truncate">{m.label}</span>
                <span className="text-[11px]">{m.count}</span>
              </div>
            ))}
          </div>

          <p className="mt-5 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
            Views
          </p>
          <div className="mt-2 space-y-0.5">
            {views.map((v) => (
              <div key={v.label} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground">
                <v.icon className="size-3.5 shrink-0" />
                <span className="flex-1 truncate">{v.label}</span>
                <span className="text-[11px]">{v.count}</span>
              </div>
            ))}
          </div>

          <div className="mt-auto flex items-center gap-2 border-t border-border/60 pt-3">
            <Avatar name={me.name} className="size-7" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{me.name}</p>
              <p className="truncate text-[10px] text-muted-foreground">{me.email}</p>
            </div>
            <Settings className="size-3.5 text-muted-foreground" />
          </div>
        </aside>

        {/* Thread list */}
        <section className="border-b border-border/60 lg:border-b-0 xl:border-r">
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-3">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-xs text-muted-foreground">
              <Search className="size-3.5" />
              <span>Search {meta.title.toLowerCase()}…</span>
              <span className="ml-auto rounded border border-border/70 px-1 text-[10px]">⌘K</span>
            </div>
            <SlidersHorizontal className="size-4 text-muted-foreground" />
          </div>

          {/* Mobile / compact folder switcher */}
          <div className="flex gap-1.5 overflow-x-auto border-b border-border/60 px-3 py-2 lg:hidden">
            {navFolders.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFolder(f.id)}
                className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                  f.id === folder ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="hidden items-center gap-4 border-b border-border/60 px-4 lg:flex">
            <span className="border-b-2 border-primary py-2 text-xs font-semibold text-primary">{meta.title}</span>
            <span className="py-2 text-xs text-muted-foreground">
              Other <span className="ml-1 rounded bg-muted px-1 text-[10px]">12</span>
            </span>
          </div>

          <ul className="divide-y divide-border/50">
            {threads.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelectedByFolder((prev) => ({ ...prev, [folder]: t.id }))}
                  aria-current={t.id === active.id ? "true" : undefined}
                  className={`flex w-full gap-2.5 px-3 py-3 text-left transition ${
                    t.id === active.id
                      ? "border-l-2 border-l-primary bg-primary/[0.06]"
                      : "border-l-2 border-l-transparent hover:bg-muted/50"
                  }`}
                >
                  <Avatar name={t.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="truncate text-xs font-semibold">{t.name}</p>
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{t.time}</span>
                    </div>
                    <p className="truncate text-xs font-medium text-foreground/90">{t.subject}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="truncate text-[11px] text-muted-foreground">{t.snippet}</p>
                      <span
                        className={`ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${toneClass[t.tone]}`}
                      >
                        {t.label}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between border-t border-border/60 px-3 py-2 text-[10px] text-muted-foreground">
            <span>{meta.footer}</span>
            <span>Threaded across 8 mailboxes</span>
          </div>
        </section>

        {/* Conversation */}
        <section className="hidden flex-col xl:flex 2xl:border-r 2xl:border-border/60">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <h3 className="truncate text-sm font-semibold">{active.subject}</h3>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {active.mailbox}
            </span>
            <MoreHorizontal className="ml-auto size-4 text-muted-foreground" />
          </div>

          <div className="space-y-4 px-4 py-4">
            {active.messages.map((m, i) => (
              <article
                key={`${active.id}-${i}`}
                className={`rounded-xl p-3.5 ${
                  m.outbound ? "border border-primary/25 bg-primary/[0.05]" : "border border-border/60 bg-background"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Avatar name={m.from} className="size-7" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">
                      {m.from} <span className="font-normal text-muted-foreground">&lt;{m.email}&gt;</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">to {m.to}</p>
                  </div>
                  <span className="ml-auto text-[10px] text-muted-foreground">{m.time}</span>
                </div>
                <div className="mt-3 space-y-2 text-xs leading-relaxed whitespace-pre-line text-muted-foreground">
                  {m.body.map((para, j) => (
                    <p key={j}>{para}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="mx-4 mb-4 rounded-xl border border-border/60 bg-background">
            <div className="flex items-center gap-4 border-b border-border/60 px-3">
              <span className="border-b-2 border-primary py-2 text-xs font-semibold text-primary">
                {folder === "drafts" ? "Draft" : "Reply"}
              </span>
              <span className="py-2 text-xs text-muted-foreground">Internal note</span>
            </div>
            <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-[11px]">
              <span className="text-muted-foreground">To</span>
              <span className="rounded-md bg-muted px-2 py-0.5">{active.email}</span>
              <span className="ml-auto text-muted-foreground">Cc Bcc</span>
            </div>
            <p className="px-3 py-4 text-xs text-muted-foreground">{meta.composer}</p>
            <div className="flex items-center gap-3 border-t border-border/60 px-3 py-2 text-muted-foreground">
              <Type className="size-3.5" />
              <Paperclip className="size-3.5" />
              <Link2 className="size-3.5" />
              <Smile className="size-3.5" />
              <ImageIcon className="size-3.5" />
              <Calendar className="size-3.5" />
              <span className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground">
                {folder === "drafts" ? "Send draft" : "Send"} <ChevronDown className="size-3" />
              </span>
            </div>
          </div>
        </section>

        {/* Prospect panel */}
        <aside className="hidden flex-col gap-4 border-l border-border/60 bg-muted/20 p-4 2xl:flex">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">Prospect</p>
            <X className="size-3.5 text-muted-foreground" />
          </div>

          <div className="rounded-xl border border-border/60 bg-background p-3">
            <div className="flex items-center gap-2.5">
              <Avatar name={active.name} className="size-9" />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{active.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">{active.role}</p>
                <p className="truncate text-[10px] text-muted-foreground">{active.company}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-muted-foreground">
              <Mail className="size-3.5" />
              <Phone className="size-3.5" />
              <Link2 className="size-3.5" />
              <MoreHorizontal className="size-3.5" />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
              Qualification
            </p>
            <div className="mt-2 space-y-1.5 text-[11px]">
              {[
                { k: "ICP fit", v: "High" },
                { k: "Buying intent", v: "High" },
                { k: "Engagement", v: "Very high" },
              ].map((row) => (
                <div key={row.k} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{row.k}</span>
                  <span className="rounded-md bg-emerald-500/12 px-1.5 py-0.5 font-semibold text-emerald-600 dark:text-emerald-400">
                    {row.v}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">Tags</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {active.tags.map((tag) => (
                <span key={tag} className="rounded-md bg-primary/12 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  {tag}
                </span>
              ))}
              <span className="grid size-5 place-items-center rounded-md border border-border/70 text-muted-foreground">
                <Plus className="size-3" />
              </span>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">Notes</p>
            <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              <li>Viewed pricing page 3x</li>
              <li>Downloaded deliverability guide</li>
              <li>Opened 4 emails</li>
            </ul>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
              Recent activity
            </p>
            <ul className="mt-2 space-y-2 text-[11px]">
              <li className="flex gap-2">
                <TrendingUp className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span className="text-muted-foreground">
                  Pricing page viewed
                  <br />
                  <span className="text-[10px]">May 21, 9:42 AM</span>
                </span>
              </li>
              <li className="flex gap-2">
                <Star className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span className="text-muted-foreground">
                  Intent spike detected
                  <br />
                  <span className="text-[10px]">May 20, 4:17 PM</span>
                </span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
