import type { SenderRoutingRow } from "@/lib/sender-status.functions";

export type MailboxReadinessBadge = {
  label:
    | "DNS Verified"
    | "Sending Ready"
    | "Setup Required"
    | "Verification Required"
    | "Sending Not Ready"
    | "DNS Not Checked"
    | "Error";
  tone: "success" | "warning" | "danger";
};

/** Customer-facing mailbox labels derived only from the existing readiness result. */
export function mailboxReadinessBadges(
  row: Pick<SenderRoutingRow, "dnsStatus" | "providerStatus">,
): MailboxReadinessBadge[] {
  if (row.dnsStatus === "failed" || row.providerStatus === "error") {
    return [{ label: "Error", tone: "danger" }];
  }

  // A connected mailbox is ready to send even before its domain records are
  // checked — it is not a setup problem, so it never reads "Setup Required".
  if (row.dnsStatus === "unchecked") {
    return row.providerStatus === "not_verified"
      ? [{ label: "Setup Required", tone: "warning" }]
      : [
          { label: "Sending Ready", tone: "success" },
          { label: "DNS Not Checked", tone: "warning" },
        ];
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
export type SelfConnectedMailbox = {
  status: string;
  is_active: boolean | null;
  auth_status: string | null;
  auth_reason: string | null;
  auth_checked_at: string | null;
};

/**
 * Readiness for a customer-connected mailbox.
 *
 * These mailboxes have no managed sending domain record, so readiness comes
 * from the mailbox connection plus its own authentication check. A connected,
 * active mailbox is sending-ready even when its records were never checked.
 */
export function selfConnectedReadiness(
  mailbox: SelfConnectedMailbox | null,
  accountStatus: string,
): {
  dnsStatus: SenderRoutingRow["dnsStatus"];
  dnsVerifiedAt: string | null;
  providerStatus: SenderRoutingRow["providerStatus"];
  providerDetail: string;
} {
  const auth = mailbox?.auth_status ?? null;
  const dnsStatus: SenderRoutingRow["dnsStatus"] =
    auth === "pass" || auth === "warn" ? "verified" : auth === "fail" ? "failed" : "unchecked";
  const dnsVerifiedAt = dnsStatus === "verified" ? mailbox?.auth_checked_at ?? null : null;

  const connected = mailbox
    ? (mailbox.status === "connected" || mailbox.status === "verified") && mailbox.is_active !== false
    : accountStatus === "verified" || accountStatus === "active";

  const providerDetail = !connected
    ? "This mailbox is not connected yet. Finish the mailbox setup to start sending."
    : dnsStatus === "verified"
      ? mailbox?.auth_reason ?? "This mailbox is connected and ready to send."
      : dnsStatus === "failed"
        ? mailbox?.auth_reason ?? "This mailbox is connected, but its domain records need attention."
        : "This mailbox is connected and ready to send. Its domain records have not been checked yet.";

  return {
    dnsStatus,
    dnsVerifiedAt,
    providerStatus: connected ? "verified" : "not_verified",
    providerDetail,
  };
}
