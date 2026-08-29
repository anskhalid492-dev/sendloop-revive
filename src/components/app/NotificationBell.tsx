import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, CheckCheck, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/hooks/useNotifications";
import {
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications.functions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function NotificationBell() {
  const queryClient = useQueryClient();
  const markRead = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const remove = useServerFn(deleteNotification);

  const { query, items, unread } = useNotifications();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
  const onError = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : "Could not update notifications.");
  const readOne = useMutation({ mutationFn: markRead, onSuccess: invalidate, onError });
  const readAll = useMutation({
    mutationFn: () => markAll({ data: undefined } as never),
    // Flip the feed locally first so the badge clears instantly, then refetch.
    onMutate: () => {
      queryClient.setQueryData(
        ["notifications"],
        (current: { items: Array<{ read: boolean }>; unread: number } | undefined) =>
          current
            ? { ...current, items: current.items.map((n) => ({ ...n, read: true })), unread: 0 }
            : current,
      );
    },
    onSettled: invalidate,
    onError,
  });
  const del = useMutation({ mutationFn: remove, onSuccess: invalidate, onError });


  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-4" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 ? (
            <button
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              disabled={readAll.isPending}
              onClick={() => readAll.mutate()}
            >
              <CheckCheck className="size-3" /> Mark all read
            </button>
          ) : null}
        </div>
        <ScrollArea className="max-h-80">
          {query.isLoading ? (
            <div className="space-y-2 p-4">
              <div className="h-10 animate-pulse rounded bg-muted" />
              <div className="h-10 animate-pulse rounded bg-muted" />
            </div>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              You&apos;re all caught up. Campaign, reply and sending alerts land here.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={cn("group flex gap-3 px-4 py-3", !n.read && "bg-accent/40")}
                >
                  <button
                    className="flex-1 text-left"
                    onClick={() => !n.read && readOne.mutate({ data: { id: n.id } })}
                  >
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.message ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</p>
                  </button>
                  <button
                    aria-label="Delete notification"
                    className="self-start text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => del.mutate({ data: { id: n.id } })}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
