import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { NotificationBell } from "@/components/app/NotificationBell";

// TEMPORARY layout harness — deleted after verification.
export const Route = createFileRoute("/zz-notif-harness")({ component: Harness });

function Harness() {
  const qc = useQueryClient();
  useState(() => {
    const items = Array.from({ length: 14 }, (_, i) => ({
      id: `n${i}`,
      type: "reply",
      title: `Very long notification title number ${i} that keeps going and going without any spaces_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
      message: "A long message body ".repeat(8),
      read: i > 3,
      created_at: new Date().toISOString(),
      entity_type: "conversation",
      entity_id: null,
      reply:
        i % 2 === 0
          ? {
              source: "campaign_reply",
              fromName: "Bartholomew Maximilian Featherstonehaugh-Worthington",
              fromEmail: "extremely.long.email.address.for.testing.overflow.behaviour@subdomain.example-company-international.com",
              subject: "Re: Your proposal about branded gift boxes for every single location",
              preview: "Thanks for reaching out! ".repeat(10),
              campaignName: "Gift Shops - California with a really really long campaign name",
              receivedAt: new Date().toISOString(),
            }
          : null,
    }));
    qc.setQueryData(["notifications"], { items, unread: 4 });
    qc.setQueryDefaults(["notifications"], { staleTime: Infinity, refetchInterval: false, queryFn: () => qc.getQueryData(["notifications"]) });
    return null;
  });
  return (
    <div style={{ height: 3000 }}>
      <div className="flex justify-end p-2">
        <NotificationBell />
      </div>
    </div>
  );
}
