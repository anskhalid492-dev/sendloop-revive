import { AnimatePresence, motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { REPLY_SENTIMENT_LABELS } from "@/lib/reply-model";
import type { RecentReply } from "@/lib/dashboard.functions";

const SENTIMENT_TONE: Record<string, string> = {
  positive: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  neutral: "bg-muted text-muted-foreground",
  negative: "bg-destructive/10 text-destructive",
  out_of_office: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

function relative(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(value).toLocaleDateString();
}

/** Latest real prospect replies; each row opens its unified inbox thread. */
export function RecentRepliesCard({
  replies,
  loading,
}: {
  replies: RecentReply[];
  loading: boolean;
}) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Recent replies</h3>
          <p className="text-xs text-muted-foreground">Open a thread to respond.</p>
        </div>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
          <Link to="/inbox">
            Inbox <ArrowUpRight className="size-3.5" />
          </Link>
        </Button>
      </header>

      {loading ? (
        <div className="space-y-3 p-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded bg-muted/60" />
          ))}
        </div>
      ) : replies.length ? (
        <ul className="divide-y divide-border">
          <AnimatePresence initial={false}>
            {replies.map((reply) => (
              <motion.li key={reply.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                <Link
                  to="/inbox"
                  {...(reply.conversationId
                    ? { search: { conversation: reply.conversationId } as never }
                    : {})}
                  className="block px-5 py-3.5 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium">{reply.prospect}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {relative(reply.at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {reply.company ? <span className="truncate">{reply.company}</span> : null}
                    {reply.company && reply.campaign ? <span>·</span> : null}
                    {reply.campaign ? <span className="truncate">{reply.campaign}</span> : null}
                  </div>
                  {reply.subject ? (
                    <p className="mt-1.5 truncate text-xs font-medium">{reply.subject}</p>
                  ) : null}
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {reply.preview || "(no preview)"}
                  </p>
                  <span
                    className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      SENTIMENT_TONE[reply.sentiment] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {REPLY_SENTIMENT_LABELS[reply.sentiment] ?? reply.sentiment}
                  </span>
                </Link>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : (
        <div className="flex flex-1 flex-col items-start gap-3 px-5 py-10">
          <MessageSquare className="size-5 text-primary" />
          <div>
            <p className="text-sm font-medium">No replies yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Once prospects answer your sequences, their replies land here and in the unified
              inbox.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/campaigns">Review your sequences</Link>
          </Button>
        </div>
      )}
    </section>
  );
}
