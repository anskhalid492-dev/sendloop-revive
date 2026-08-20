import {
  Archive,
  AtSign,
  CalendarCheck,
  CheckCircle2,
  CircleSlash,
  Clock,
  FileText,
  Inbox,
  Mail,
  MailX,
  PenSquare,
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

const PRIMARY: Item[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "unread", label: "Unread", icon: Mail },
  { id: "sent", label: "Sent", icon: Send },
  { id: "snoozed", label: "Snoozed", icon: Clock },
  { id: "drafts", label: "Drafts", icon: FileText },
  { id: "all", label: "All mail", icon: AtSign },
  { id: "archived", label: "Archived", icon: Archive },
];

const VIEWS: Item[] = [
  { id: "interested", label: "Interested", icon: Star },
  { id: "meeting_booked", label: "Meeting booked", icon: CalendarCheck },
  { id: "meeting_completed", label: "Meeting done", icon: CheckCircle2 },
  { id: "won", label: "Won", icon: Trophy },
  { id: "ooo", label: "Out of office", icon: Sparkles },
  { id: "not_interested", label: "Not interested", icon: CircleSlash },
  { id: "unsubscribed", label: "Unsubscribed", icon: MailX },
  { id: "bounced", label: "Bounced", icon: MailX },
  { id: "assigned_to_me", label: "Assigned to me", icon: UserCheck },
];

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
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
      {count > 0 ? (
        <span
          className={cn(
            "ml-auto shrink-0 text-[11px] tabular-nums",
            active ? "text-primary" : "text-muted-foreground",
          )}
        >
          {count}
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
  accounts?: { id: string; from_email: string }[] | undefined;
  selectedAccountIds?: string[] | undefined;
  onToggleAccount?: ((id: string) => void) | undefined;
  userName?: string | null | undefined;
  userEmail?: string | null | undefined;
}) {
  return (
    <nav aria-label="Inbox folders" className="flex h-full min-h-0 flex-col">
      {onCompose ? (
        <div className="p-3">
          <Button className="w-full justify-start" onClick={onCompose}>
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
        </div>

        {accounts.length ? (
          <div>
            <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Mailboxes
            </p>
            <div className="space-y-0.5">
              {accounts.map((account) => {
                const active = selectedAccountIds.includes(account.id);
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => onToggleAccount?.(account.id)}
                    aria-pressed={active}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        active ? "bg-primary" : "bg-muted-foreground/40",
                      )}
                    />
                    <span className="truncate">{account.from_email}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div>
          <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Views
          </p>
          <div className="space-y-0.5">
            {VIEWS.map((item) => (
              <Row
                key={item.id}
                item={item}
                active={folder === item.id}
                count={counts[item.id] ?? 0}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      </div>

      {userEmail ? (
        <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
            {(userName || userEmail).slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{userName || "Signed in"}</p>
            <p className="truncate text-[11px] text-muted-foreground">{userEmail}</p>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
