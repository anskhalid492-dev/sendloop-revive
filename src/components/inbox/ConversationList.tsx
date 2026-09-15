import { useEffect, useRef } from "react";
import { Loader2, RefreshCcw, Search, SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CONVERSATION_STATUS_LABELS,
  CONVERSATION_STATUS_STYLES,
  displayName,
  initialsOf,
  type ConversationListItem,
} from "@/lib/inbox-model";
import { replyPreview } from "@/lib/email-body";
import { cn } from "@/lib/utils";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

export function ConversationList({
  items,
  selectedId,
  search,
  onSearch,
  onSelect,
  onOpenFilters,
  onRefresh,
  onLoadMore,
  hasMore,
  isLoading,
  isFetchingMore,
  isError,
  activeFilterCount,
  emptyTitle,
  emptyBody,
  readyNote,
  tab,
  onTabChange,
  footerNote,
  liveStatus,
}: {
  items: ConversationListItem[];
  selectedId: string | null;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
  onOpenFilters: () => void;
  onRefresh: () => void;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
  isFetchingMore: boolean;
  isError: boolean;
  activeFilterCount: number;
  emptyTitle: string;
  emptyBody: string;
  readyNote?: string;
  tab?: "primary" | "other" | undefined;
  onTabChange?: ((tab: "primary" | "other") => void) | undefined;
  footerNote?: string | undefined;
  liveStatus?: "connecting" | "live" | "offline" | undefined;
}) {
  const sentinel = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore, items.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search messages…"
            className="pl-9 pr-12"
            aria-label="Search conversations"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:block">
            ⌘K
          </kbd>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="relative"
          onClick={onOpenFilters}
          aria-label="Filters"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {activeFilterCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
              {activeFilterCount}
            </span>
          ) : null}
        </Button>
        <Button variant="ghost" size="icon" onClick={onRefresh} aria-label="Refresh conversations">
          <RefreshCcw className="h-4 w-4" />
        </Button>
      </div>

      {tab && onTabChange ? (
        <div className="flex items-center gap-4 border-b border-border px-4">
          {(["primary", "other"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onTabChange(value)}
              aria-current={tab === value ? "true" : undefined}
              className={cn(
                "-mb-px border-b-2 py-2 text-sm capitalize transition-colors",
                tab === value
                  ? "border-primary font-medium text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      ) : null}

      {liveStatus ? (
        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-1.5 text-[11px] text-muted-foreground">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              liveStatus === "live"
                ? "bg-emerald-500"
                : liveStatus === "connecting"
                  ? "animate-pulse bg-amber-500"
                  : "bg-destructive",
            )}
          />
          {liveStatus === "live"
            ? "Live — new replies and status changes appear instantly"
            : liveStatus === "connecting"
              ? "Connecting to live updates…"
              : "Live updates offline — refreshing every 20s"}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading conversations…
          </div>
        ) : isError ? (
          <div className="p-6 text-center text-sm">
            <p className="text-muted-foreground">We couldn’t load your conversations.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={onRefresh}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center">
            <h3 className="text-sm font-medium">{emptyTitle}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{emptyBody}</p>
          </div>
        ) : (
          <ul>
            {items.map((item) => {
              const name = displayName(
                item.lead_name ? { first_name: item.lead_name } : null,
                item.prospect_email,
              );
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className={cn(
                      "w-full border-b border-border px-3 py-3 text-left transition-colors hover:bg-muted/60",
                      selectedId === item.id && "bg-muted",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {initialsOf(item.lead_name, item.prospect_email)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "truncate text-sm",
                              item.unread ? "font-semibold" : "font-medium",
                            )}
                          >
                            {name}
                          </span>
                          {item.unread ? (
                            <span
                              aria-label="Unread"
                              className="h-2 w-2 shrink-0 rounded-full bg-primary"
                            />
                          ) : null}
                          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                            {timeAgo(item.last_message_at)}
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.lead_company ? `${item.lead_company} · ` : ""}
                          {item.prospect_email}
                        </p>
                        <p className="mt-1 truncate text-xs font-medium">{item.subject}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.last_direction === "outbound" ? "You: " : ""}
                          {replyPreview(item.last_preview) || "No preview"}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className={cn("border-0", CONVERSATION_STATUS_STYLES[item.status])}
                          >
                            {CONVERSATION_STATUS_LABELS[item.status] ?? item.status}
                          </Badge>
                          {item.campaign_name ? (
                            <Badge variant="outline" className="max-w-[140px] truncate">
                              {item.campaign_name}
                            </Badge>
                          ) : null}
                          {item.sending_account_email ? (
                            <Badge variant="outline" className="max-w-[150px] truncate">
                              {item.sending_account_email}
                            </Badge>
                          ) : null}
                          {item.assignee_name ? (
                            <Badge variant="secondary">{item.assignee_name}</Badge>
                          ) : null}
                          {item.tags.map((tag) => (
                            <Badge key={tag} variant="secondary">
                              #{tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div ref={sentinel} />
        {isFetchingMore ? (
          <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Loading more…
          </div>
        ) : null}
        {!isLoading && !isError && !hasMore && items.length > 0 && readyNote ? (
          <p className="px-4 py-3 text-center text-[11px] text-muted-foreground">{readyNote}</p>
        ) : null}
      </div>

      {footerNote ? (
        <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          {footerNote}
        </div>
      ) : null}

    </div>
  );
}
