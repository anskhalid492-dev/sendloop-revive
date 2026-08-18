import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CONVERSATION_STATUS_LABELS } from "@/lib/inbox-model";

type Lead = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  job_title: string | null;
  phone: string | null;
  website: string | null;
  status: string;
  crm_stage: string;
  tags: string[];
  last_activity_at: string | null;
};

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[60%] truncate text-right font-medium">{value}</span>
    </div>
  );
}

export function ProspectPanel({
  lead,
  prospectEmail,
  status,
  tags,
  campaignName,
  accountEmail,
  assigneeName,
  events,
}: {
  lead: Lead | null;
  prospectEmail: string;
  status: string;
  tags: string[];
  campaignName: string | null;
  accountEmail: string | null;
  assigneeName: string | null;
  events: { id: string; type: string; detail: string | null; created_at: string }[];
}) {
  const name = [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || prospectEmail;
  return (
    <aside className="flex h-full flex-col overflow-y-auto p-4">
      <div>
        <h3 className="text-base font-semibold">{name}</h3>
        <p className="text-sm text-muted-foreground">{lead?.email ?? prospectEmail}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="secondary">{CONVERSATION_STATUS_LABELS[status] ?? status}</Badge>
        {tags.map((tag) => (
          <Badge key={tag} variant="outline">
            #{tag}
          </Badge>
        ))}
      </div>

      <div className="mt-4 divide-y divide-border rounded-lg border border-border p-3">
        <Row label="Company" value={lead?.company} />
        <Row label="Job title" value={lead?.job_title} />
        <Row label="Phone" value={lead?.phone} />
        <Row label="Website" value={lead?.website} />
        <Row label="Lead status" value={lead?.status} />
        <Row label="CRM stage" value={lead?.crm_stage} />
        <Row label="Campaign" value={campaignName} />
        <Row label="Sending account" value={accountEmail} />
        <Row label="Assigned to" value={assigneeName ?? "Unassigned"} />
        <Row
          label="Last activity"
          value={lead?.last_activity_at ? new Date(lead.last_activity_at).toLocaleString() : null}
        />
      </div>

      {lead ? (
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link to="/leads" search={{ lead: lead.id } as never}>
            Open contact record <ExternalLink className="ml-2 h-3.5 w-3.5" />
          </Link>
        </Button>
      ) : null}

      <div className="mt-6">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Activity
        </h4>
        <ul className="mt-2 space-y-2">
          {events.length === 0 ? (
            <li className="text-sm text-muted-foreground">No activity yet.</li>
          ) : (
            events.map((event) => (
              <li key={event.id} className="text-xs">
                <span className="font-medium">{event.type.replace(/_/g, " ")}</span>
                {event.detail ? (
                  <span className="text-muted-foreground"> — {event.detail}</span>
                ) : null}
                <div className="text-muted-foreground">
                  {new Date(event.created_at).toLocaleString()}
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </aside>
  );
}
