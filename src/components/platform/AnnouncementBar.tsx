/**
 * Renders the live platform announcements for the signed-in viewer.
 * Scheduling, audience and dismissals are all resolved server-side.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Info, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  dismissPlatformAnnouncement,
  getViewerPlatformState,
} from "@/lib/platform-config.functions";
import { cn } from "@/lib/utils";

export function AnnouncementBar() {
  const load = useServerFn(getViewerPlatformState);
  const dismiss = useServerFn(dismissPlatformAnnouncement);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["viewer-platform-state"],
    queryFn: () => load(),
    staleTime: 60_000,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (id: string) => dismiss({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["viewer-platform-state"] }),
  });

  const announcements = query.data?.announcements ?? [];
  if (announcements.length === 0) return null;

  return (
    <div className="space-y-px">
      {announcements.map((a) => (
        <div
          key={a.id}
          className={cn(
            "flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm sm:px-6",
            a.level === "critical"
              ? "bg-destructive/10 text-destructive"
              : a.level === "warning"
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : "bg-primary/10 text-primary",
          )}
        >
          {a.level === "info" ? (
            <Info className="size-4 shrink-0" />
          ) : (
            <AlertTriangle className="size-4 shrink-0" />
          )}
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{a.title}</span>{" "}
            <span className="opacity-90">{a.message}</span>
          </span>
          {a.cta_label && a.cta_url ? (
            <a
              href={a.cta_url}
              className="font-medium underline underline-offset-4"
            >
              {a.cta_label}
            </a>
          ) : null}
          {a.dismissible ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label="Dismiss announcement"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(a.id)}
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
