import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type RealtimeStatus = "connecting" | "live" | "offline";

type Options = {
  workspaceId: string | null;
  selectedId: string | null;
  /** Fired when a brand new inbound message lands in a thread. */
  onNewReply?: (payload: { conversationId: string | null; direction: string | null }) => void;
};

/**
 * Keeps the unified inbox live: conversation rows, messages, thread events and
 * notes stream in over Realtime and invalidate the matching React Query caches.
 * If the socket drops we fall back to short-interval polling so the UI never
 * goes stale, and we surface the connection state so the UI can show it.
 */
export function useInboxRealtime({ workspaceId, selectedId, onNewReply }: Options) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);

  const selectedRef = useRef<string | null>(selectedId);
  selectedRef.current = selectedId;
  const replyRef = useRef(onNewReply);
  replyRef.current = onNewReply;
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingConversations = useRef<Set<string>>(new Set());

  const invalidate = useCallback(
    (conversationIds: string[]) => {
      void queryClient.invalidateQueries({ queryKey: ["conversations", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["inbox-counts", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["inbox-facets", workspaceId] });
      const ids = new Set(conversationIds);
      if (selectedRef.current) ids.add(selectedRef.current);
      ids.forEach((id) => {
        void queryClient.invalidateQueries({ queryKey: ["conversation", id] });
      });
    },
    [queryClient, workspaceId],
  );

  // Coalesce bursts (a reply writes a conversation row + message + event) into
  // a single refresh pass.
  const schedule = useCallback(
    (conversationId?: string | null) => {
      if (conversationId) pendingConversations.current.add(conversationId);
      setLastEventAt(Date.now());
      if (flushTimer.current) return;
      flushTimer.current = setTimeout(() => {
        flushTimer.current = null;
        const ids = Array.from(pendingConversations.current);
        pendingConversations.current.clear();
        invalidate(ids);
      }, 250);
    },
    [invalidate],
  );

  useEffect(() => {
    if (!workspaceId) {
      setStatus("offline");
      return;
    }
    setStatus("connecting");

    const filter = `workspace_id=eq.${workspaceId}`;
    const channel: RealtimeChannel = supabase
      .channel(`inbox:${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter },
        (payload) => {
          const row = (payload.new ?? payload.old) as { id?: string } | null;
          schedule(row?.id ?? null);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_messages", filter },
        (payload) => {
          const row = (payload.new ?? payload.old) as
            | { conversation_id?: string; direction?: string }
            | null;
          schedule(row?.conversation_id ?? null);
          if (payload.eventType === "INSERT" && row?.direction === "inbound") {
            replyRef.current?.({
              conversationId: row.conversation_id ?? null,
              direction: row.direction ?? null,
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_events", filter },
        (payload) => {
          const row = (payload.new ?? payload.old) as { conversation_id?: string } | null;
          schedule(row?.conversation_id ?? null);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_notes", filter },
        (payload) => {
          const row = (payload.new ?? payload.old) as { conversation_id?: string } | null;
          schedule(row?.conversation_id ?? null);
        },
      )
      // A CRM stage or status change made elsewhere (board, drawer, Leads) must
      // show up in the open thread's contact panel too.
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leads", filter }, () =>
        schedule(selectedRef.current),
      )
      .subscribe((state) => {
        if (state === "SUBSCRIBED") setStatus("live");
        else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED")
          setStatus("offline");
      });

    return () => {
      if (flushTimer.current) {
        clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      pendingConversations.current.clear();
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, schedule]);

  // Polling fallback whenever the socket isn't healthy.
  useEffect(() => {
    if (!workspaceId || status === "live") return;
    const timer = setInterval(() => invalidate([]), 20000);
    return () => clearInterval(timer);
  }, [workspaceId, status, invalidate]);

  // Refresh immediately when the tab regains focus.
  useEffect(() => {
    if (!workspaceId) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") invalidate([]);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [workspaceId, invalidate]);

  return { status, lastEventAt, refresh: () => invalidate([]) };
}
