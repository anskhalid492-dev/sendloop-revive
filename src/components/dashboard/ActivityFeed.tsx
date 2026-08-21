import {
  Activity,
  Flame,
  Globe2,
  Inbox,
  Mail,
  Rocket,
} from "lucide-react";

export type ActivityItem = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  at: string;
};

const ICONS: Record<string, typeof Activity> = {
  campaign: Rocket,
  reply: Inbox,
  domain: Globe2,
  mailbox: Mail,
  warmup: Flame,
};

function relative(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

/** Real workspace events: launches, replies, domains, mailboxes and warmup. */
export function ActivityFeed({
  items,
  loading,
}: {
  items: ActivityItem[];
  loading: boolean;
}) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-border bg-card shadow-sm">
      <header className="border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold tracking-tight">Recent activity</h3>
        <p className="text-xs text-muted-foreground">Everything happening in this workspace.</p>
      </header>

      {loading ? (
        <div className="space-y-3 p-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted/60" />
          ))}
        </div>
      ) : items.length ? (
        <ol className="flex-1 space-y-1 p-3">
          {items.map((item) => {
            const Icon = ICONS[item.kind] ?? Activity;
            return (
              <li
                key={item.id}
                className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40"
              >
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium capitalize">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {relative(item.at)}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="flex flex-1 flex-col items-start gap-2 px-5 py-10">
          <Activity className="size-5 text-primary" />
          <p className="text-sm font-medium">Nothing has happened yet</p>
          <p className="text-sm text-muted-foreground">
            Connect a mailbox and launch your first campaign to build a timeline here.
          </p>
        </div>
      )}
    </section>
  );
}
