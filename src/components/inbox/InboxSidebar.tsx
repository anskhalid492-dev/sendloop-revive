import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Archive,
  AtSign,
  CalendarCheck,
  ChevronDown,
  CircleSlash,
  Clock,
  FileText,
  Flame,
  Inbox,
  Mail,
  MailX,
  PenSquare,
  Reply,
  Send,
  Sparkles,
  Star,
  Trophy,
  UserCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type InboxFolder } from "@/lib/inbox-model";
import { cn } from "@/lib/utils";

type Item = { id: InboxFolder; label: string; icon: LucideIcon };

/** The everyday outreach views, in the order a sales user works them. */
const PRIMARY: Item[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "unread", label: "Unread", icon: Mail },
  { id: "replied", label: "Replied", icon: Reply },
  { id: "auto_replies", label: "Auto-replies", icon: Sparkles },
  { id: "sent", label: "Sent", icon: Send },
  { id: "starred", label: "Starred", icon: Star },
  { id: "snoozed", label: "Snoozed", icon: Clock },
  { id: "bounced", label: "Bounces", icon: MailX },
  { id: "archived", label: "Archived", icon: Archive },
];

/** Secondary pipeline views, hidden behind "More". */
const MORE: Item[] = [
  { id: "interested", label: "Interested", icon: Star },
  { id: "meeting_booked", label: "Meeting booked", icon: CalendarCheck },
  { id: "meeting_completed", label: "Meeting done", icon: CalendarCheck },
  { id: "won", label: "Won", icon: Trophy },
  { id: "not_interested", label: "Not interested", icon: CircleSlash },
  { id: "unsubscribed", label: "Unsubscribed", icon: MailX },
  { id: "assigned_to_me", label: "Assigned to me", icon: UserCheck },
  { id: "drafts", label: "Drafts", icon: FileText },
  { id: "all", label: "All conversations", icon: AtSign },
];

export type InboxAccount = {
  id: string;
  from_email: string;
  label?: string | null;
  status?: string | null;
  paused?: boolean | null;
  customer_enabled?: boolean | null;
};

export function accountState(account: InboxAccount): { label: string; tone: string } {
  if (account.paused || account.customer_enabled === false) {
    return { label: "Paused", tone: "bg-amber-500" };
  }
  if (account.status === "failed") return { label: "Needs attention", tone: "bg-destructive" };
  if (account.status === "verified") return { label: "Active", tone: "bg-emerald-500" };
  return { label: "Connected", tone: "bg-muted-foreground/50" };
}

function Row({
  item,
  active,
  count,
  onSelect,
}: {
  item: Item;
  active: boolean;
  count: number;
  onSelect: (folder: InboxFolder) => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
        active
          ? "bg-primary/10 font-semibold text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
      {count > 0 ? (
        <span
          className={cn(
            "ml-auto shrink-0 rounded-full px-1.5 text-[11px] font-medium tabular-nums",
            active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          {count > 999 ? "999+" : count}
        </span>
      ) : null}
    </button>
  );
}

export function InboxSidebar({
  folder,
  counts,
  onSelect,
  onCompose,
  accounts = [],
  selectedAccountIds = [],
  onToggleAccount,
  userName,
  userEmail,
}: {
  folder: InboxFolder;
  counts: Record<string, number>;
  onSelect: (folder: InboxFolder) => void;
  onCompose?: (() => void) | undefined;
  accounts?: InboxAccount[] | undefined;
  selectedAccountIds?: string[] | undefined;
  onToggleAccount?: ((id: string) => void) | undefined;
  userName?: string | null | undefined;
  userEmail?: string | null | undefined;
}) {
  const [moreOpen, setMoreOpen] = useState(
    MORE.some((item) => item.id === folder),
  );

  return (
    <nav aria-label="Inbox views" className="flex h-full min-h-0 flex-col">
      {onCompose ? (
        <div className="px-3 pb-2 pt-3">
          <Button className="w-full justify-start" size="sm" onClick={onCompose}>
            <PenSquare className="mr-2 h-4 w-4" /> Compose
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-3">
        <div className="space-y-0.5">
          {PRIMARY.map((item) => (
            <Row
              key={item.id}
              item={item}
              active={folder === item.id}
              count={counts[item.id] ?? 0}
              onSelect={onSelect}
            />
          ))}

          <Link
            to="/warmup"
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Flame className="h-4 w-4 shrink-0" />
            <span className="truncate">Warmup</span>
          </Link>

          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 transition-transform", !moreOpen && "-rotate-90")}
            />
            <span>More</span>
          </button>

          {moreOpen ? (
            <div className="space-y-0.5 pl-1">
              {MORE.map((item) => (
                <Row
                  key={item.id}
                  item={item}
                  active={folder === item.id}
                  count={counts[item.id] ?? 0}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ) : null}
        </div>

      </div>
    </nav>
  );
}
