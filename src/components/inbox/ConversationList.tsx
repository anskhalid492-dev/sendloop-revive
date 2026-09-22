import { useEffect, useRef } from "react";
import { Loader2, RefreshCcw, Search, SlidersHorizontal, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
  onToggleStar,
  hasMore,
  isLoading,
  isFetchingMore,
  isError,
  activeFilterCount,
  campaigns = [],
  campaignId = "all",
  onCampaignChange,
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
  onToggleStar?: ((item: ConversationListItem) => void) | undefined;
  hasMore: boolean;
  isLoading: boolean;
  isFetchingMore: boolean;
  isError: boolean;
  activeFilterCount: number;
  campaigns?: { id: string; name: string }[] | undefined;
  campaignId?: string | undefined;
  onCampaignChange?: ((value: string) => void) | undefined;
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
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="space-y-2 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search messages…"
              className="h-8 pl-8 pr-10 text-[13px]"
              aria-label="Search conversations"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground sm:block">
              ⌘K
            </kbd>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="relative h-8 w-8 shrink-0"
            onClick={onOpenFilters}
            aria-label="Filters"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {activeFilterCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
                {activeFilterCount}
              </span>
            ) : null}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onRefresh}
            aria-label="Refresh conversations"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {onCampaignChange ? (
          <Select value={campaignId} onValueChange={onCampaignChange}>
            <SelectTrigger
              className="h-8 text-[13px]"
              aria-label="Filter by campaign"
            >
              <SelectValue placeholder="All campaigns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campaigns</SelectItem>
              {campaigns.map((campaign) => (
                <SelectItem key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {tab && onTabChange ? (
        <div className="flex items-center gap-4 border-b border-border px-3">
          {(["primary", "other"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onTabChange(value)}
              aria-current={tab === value ? "true" : undefined}
              className={cn(
                "-mb-px border-b-2 py-2 text-[13px] capitalize transition-colors",
                tab === value
                  ? "border-primary font-semibold text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      ) : null}

      {liveStatus ? (
        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-1 text-[11px] text-muted-foreground">
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
            ? "Live — new replies appear instantly"
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
              const selected = selectedId === item.id;
              return (
                <li key={item.id} className="relative">
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className={cn(
                      "w-full border-b border-border/70 px-3 py-2 text-left transition-colors hover:bg-muted/50",
                      selected && "bg-primary/[0.06]",
                    )}
                  >
                    {selected ? (
                      <span className="absolute inset-y-0 left-0 w-[2px] bg-primary" />
                    ) : null}
                    <div className="flex items-start gap-2.5">
                      <span
                        className={cn(
                          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                          item.unread
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {initialsOf(item.lead_name, item.prospect_email)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "truncate text-[13px]",
                              item.unread ? "font-semibold" : "font-medium",
                            )}
                          >
                            {name}
                          </span>
                          {item.unread ? (
                            <span
                              aria-label="Unread"
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                            />
                          ) : null}
                          <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                            {timeAgo(item.last_message_at)}
                          </span>
                        </div>
                        <p className="truncate text-[12px] font-medium text-foreground/90">
                          {item.subject || "(no subject)"}
                        </p>
                        <p className="truncate text-[12px] text-muted-foreground">
                          {item.last_direction === "outbound" ? "You: " : ""}
                          {replyPreview(item.last_preview) || item.prospect_email}
                        </p>
                        <div className="mt-1.5 flex items-center gap-1.5 overflow-hidden">
                          <span
                            className={cn(
                              "shrink-0 rounded px-1.5 py-px text-[10px] font-medium",
                              CONVERSATION_STATUS_STYLES[item.status] ??
                                "bg-muted text-muted-foreground",
                            )}
                          >
                            {CONVERSATION_STATUS_LABELS[item.status] ?? item.status}
                          </span>
                          {item.campaign_name ? (
                            <Badge
                              variant="outline"
                              className="max-w-[45%] shrink truncate border-border/70 px-1.5 py-0 text-[10px] font-normal"
                            >
                              {item.campaign_name}
                            </Badge>
                          ) : null}
                          {item.sending_account_email ? (
                            <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                              via {item.sending_account_email}
                            </span>
                          ) : null}
                          {item.assignee_name ? (
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {item.assignee_name}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </button>

                  {onToggleStar ? (
                    <button
                      type="button"
                      onClick={() => onToggleStar(item)}
                      aria-label={item.starred ? "Remove star" : "Star conversation"}
                      aria-pressed={item.starred}
                      className="absolute bottom-2 right-2 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Star
                        className={cn(
                          "h-3.5 w-3.5",
                          item.starred && "fill-amber-400 text-amber-500",
                        )}
                      />
                    </button>
                  ) : null}
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
        <div className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          {footerNote}
        </div>
      ) : null}
    </div>
  );
}
