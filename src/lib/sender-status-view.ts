import type { SenderRoutingRow } from "@/lib/sender-status.functions";

export type MailboxReadinessBadge = {
  label: "DNS Verified" | "Sending Ready" | "Setup Required" | "Verification Required" | "Sending Not Ready" | "Error";
  tone: "success" | "warning" | "danger";
};

/** Customer-facing mailbox labels derived only from the existing readiness result. */
export function mailboxReadinessBadges(
  row: Pick<SenderRoutingRow, "dnsStatus" | "providerStatus">,
): MailboxReadinessBadge[] {
  if (row.dnsStatus === "failed" || row.providerStatus === "error") {
    return [{ label: "Error", tone: "danger" }];
  }

  if (row.dnsStatus === "missing") {
    return [{ label: "Setup Required", tone: "warning" }];
  }

  if (row.dnsStatus === "pending") {
    return [{ label: "Verification Required", tone: "warning" }];
  }

  if (row.providerStatus === "not_verified") {
    return [
      { label: "DNS Verified", tone: "success" },
      { label: "Sending Not Ready", tone: "danger" },
    ];
  }

  if (row.providerStatus === "verified") {
    return [
      { label: "DNS Verified", tone: "success" },
      { label: "Sending Ready", tone: "success" },
    ];
  }

  return [
    { label: "DNS Verified", tone: "success" },
    { label: "Verification Required", tone: "warning" },
  ];
}

export function mailboxActivityLabel(row: Pick<SenderRoutingRow, "active" | "paused">) {
  if (row.paused) return "Paused";
  return row.active ? "Active" : "Inactive";
}

export function mailboxWarmupLabel(status: string) {
  if (status === "warming" || status === "active") return "Active";
  if (status === "complete" || status === "completed" || status === "stable") return "Complete";
  if (status === "paused" || status === "hold" || status === "recovery") return "Paused";
  return "Off";
}