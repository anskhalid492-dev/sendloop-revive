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

/**
 * Static, high-fidelity mock of the Sendloop unified inbox.
 *
 * Purely presentational marketing chrome — no data fetching, no interaction.
 * Everything uses semantic design tokens so it inherits the site's existing
 * palette in both light and dark mode.
 */

const folders = [
  { icon: Inbox, label: "Inbox", count: 12, active: true },
  { icon: Send, label: "Sent" },
  { icon: Clock, label: "Snoozed" },
  { icon: FileText, label: "Drafts", count: 3 },
  { icon: Mail, label: "Templates" },
  { icon: Archive, label: "All Mail" },
  { icon: Trash2, label: "Trash" },
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

type Tone = "interested" | "ooo" | "followup" | "booked";

const toneClass: Record<Tone, string> = {
  interested: "bg-primary/12 text-primary",
  ooo: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  followup: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  booked: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
};

const threads: {
  name: string;
  subject: string;
  snippet: string;
  time: string;
  label: string;
  tone: Tone;
  active?: boolean;
}[] = [
  {
    name: "Marcus Lee",
    subject: "Scaling outbound with intent data",
    snippet: "Hi Priya, thanks for reaching out — your platform looks…",
    time: "10:24 AM",
    label: "Interested",
    tone: "interested",
    active: true,
  },
  {
    name: "Sarah Chen",
    subject: "Re: Intro to Fieldstack",
    snippet: "Hi Priya, I'm currently out of office until…",
    time: "9:15 AM",
    label: "Out of office",
    tone: "ooo",
  },
  {
    name: "Michael Kumar",
    subject: "Northline + GrowthCo",
    snippet: "This looks interesting. Can we hop on a quick call?",
    time: "May 21",
    label: "Interested",
    tone: "interested",
  },
  {
    name: "Amy Patel",
    subject: "Full enrichment access",
    snippet: "Thanks for the information! We'd like to see pricing…",
    time: "May 21",
    label: "Interested",
    tone: "interested",
  },
  {
    name: "David Lee",
    subject: "Follow up from last week",
    snippet: "Just bumping this to the top of your inbox.",
    time: "May 20",
    label: "Needs follow up",
    tone: "followup",
  },
  {
    name: "Chris Miller",
    subject: "Re: Meeting request",
    snippet: "Let's lock something in for next Tuesday.",
    time: "May 19",
    label: "Meeting booked",
    tone: "booked",
  },
];

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
  return (
    <div
      aria-label="Sendloop unified inbox preview"
      role="img"
      className={`overflow-hidden rounded-2xl border border-border/70 bg-card text-[13px] ${className}`}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[190px_minmax(0,1fr)] xl:grid-cols-[190px_300px_minmax(0,1fr)] 2xl:grid-cols-[190px_300px_minmax(0,1fr)_248px]">
        {/* Sidebar */}
        <aside className="hidden flex-col border-r border-border/60 bg-muted/30 p-3 lg:flex">
          <div className="flex items-center gap-2 px-1 pb-3">
            <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Send className="size-3.5" />
            </span>
            <span className="text-sm font-semibold">Sendloop</span>
          </div>

          <div className="flex items-center gap-px">
            <span className="flex flex-1 items-center justify-center gap-1.5 rounded-l-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
              <Pencil className="size-3.5" /> Compose
            </span>
            <span className="grid place-items-center rounded-r-lg bg-primary px-2 py-2 text-primary-foreground">
              <ChevronDown className="size-3.5" />
            </span>
          </div>

          <nav className="mt-4 space-y-0.5">
            {folders.map((f) => (
              <div
                key={f.label}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${
                  f.active ? "bg-primary/12 font-semibold text-primary" : "text-muted-foreground"
                }`}
              >
                <f.icon className="size-3.5 shrink-0" />
                <span className="flex-1 truncate">{f.label}</span>
                {f.count ? <span className="text-[11px]">{f.count}</span> : null}
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
            <Avatar name="Priya Nair" className="size-7" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">Priya Nair</p>
              <p className="truncate text-[10px] text-muted-foreground">priya@sendloop.io</p>
            </div>
            <Settings className="size-3.5 text-muted-foreground" />
          </div>
        </aside>

        {/* Thread list */}
        <section className="border-b border-border/60 lg:border-b-0 xl:border-r">
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-3">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-xs text-muted-foreground">
              <Search className="size-3.5" />
              <span>Search messages…</span>
              <span className="ml-auto rounded border border-border/70 px-1 text-[10px]">⌘K</span>
            </div>
            <SlidersHorizontal className="size-4 text-muted-foreground" />
          </div>

          <div className="flex items-center gap-4 border-b border-border/60 px-4">
            <span className="border-b-2 border-primary py-2 text-xs font-semibold text-primary">Primary</span>
            <span className="py-2 text-xs text-muted-foreground">
              Other <span className="ml-1 rounded bg-muted px-1 text-[10px]">12</span>
            </span>
          </div>

          <ul className="divide-y divide-border/50">
            {threads.map((t) => (
              <li
                key={t.name}
                className={`flex gap-2.5 px-3 py-3 ${
                  t.active ? "border-l-2 border-l-primary bg-primary/[0.06]" : "border-l-2 border-l-transparent"
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
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between border-t border-border/60 px-3 py-2 text-[10px] text-muted-foreground">
            <span>1–25 of 312</span>
            <span>Threaded across 8 mailboxes</span>
          </div>
        </section>

        {/* Conversation */}
        <section className="hidden flex-col xl:flex 2xl:border-r 2xl:border-border/60">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <h3 className="truncate text-sm font-semibold">Scaling outbound with intent data</h3>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Sales
            </span>
            <MoreHorizontal className="ml-auto size-4 text-muted-foreground" />
          </div>

          <div className="space-y-4 px-4 py-4">
            <article className="rounded-xl border border-border/60 bg-background p-3.5">
              <div className="flex items-center gap-2">
                <Avatar name="Marcus Lee" className="size-7" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">
                    Marcus Lee{" "}
                    <span className="font-normal text-muted-foreground">&lt;marcus@fieldstack.com&gt;</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">to Priya Nair</p>
                </div>
                <span className="ml-auto text-[10px] text-muted-foreground">10:24 AM</span>
              </div>
              <div className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
                <p>Hi Priya,</p>
                <p>
                  Thanks for reaching out. Your platform looks really interesting and lines up with what
                  we're building at Fieldstack.
                </p>
                <p>Can we schedule a quick call next week to learn more?</p>
                <p>Best,<br />Marcus</p>
              </div>
            </article>

            <article className="rounded-xl border border-primary/25 bg-primary/[0.05] p-3.5">
              <div className="flex items-center gap-2">
                <Avatar name="Priya Nair" className="size-7" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">
                    Priya Nair <span className="font-normal text-muted-foreground">&lt;priya@sendloop.io&gt;</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">to Marcus Lee</p>
                </div>
                <span className="ml-auto text-[10px] text-muted-foreground">10:45 AM</span>
              </div>
              <div className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
                <p>Hi Marcus,</p>
                <p>Absolutely — does Tuesday or Wednesday morning work for you?</p>
                <p>Best,<br />Priya</p>
              </div>
            </article>
          </div>

          <div className="mx-4 mb-4 rounded-xl border border-border/60 bg-background">
            <div className="flex items-center gap-4 border-b border-border/60 px-3">
              <span className="border-b-2 border-primary py-2 text-xs font-semibold text-primary">Reply</span>
              <span className="py-2 text-xs text-muted-foreground">Internal note</span>
            </div>
            <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-[11px]">
              <span className="text-muted-foreground">To</span>
              <span className="rounded-md bg-muted px-2 py-0.5">marcus@fieldstack.com</span>
              <span className="ml-auto text-muted-foreground">Cc Bcc</span>
            </div>
            <p className="px-3 py-4 text-xs text-muted-foreground">Write your reply…</p>
            <div className="flex items-center gap-3 border-t border-border/60 px-3 py-2 text-muted-foreground">
              <Type className="size-3.5" />
              <Paperclip className="size-3.5" />
              <Link2 className="size-3.5" />
              <Smile className="size-3.5" />
              <ImageIcon className="size-3.5" />
              <Calendar className="size-3.5" />
              <span className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground">
                Send <ChevronDown className="size-3" />
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
              <Avatar name="Marcus Lee" className="size-9" />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">Marcus Lee</p>
                <p className="truncate text-[10px] text-muted-foreground">Head of Growth</p>
                <p className="truncate text-[10px] text-muted-foreground">Fieldstack Robotics</p>
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
              {["Intent: product research", "Intent: enrichment", "SaaS"].map((tag) => (
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
