/**
 * One green / yellow / red indicator per connected mailbox.
 *
 * Every surface (mailbox list, sending page, dashboard) reads this so one
 * mailbox can never show two different colours.
 */
import type { AuthCheckState } from "@/lib/mailbox-auth-check";

export type MailboxHealthColour = "green" | "yellow" | "red";

export type MailboxHealth = {
  colour: MailboxHealthColour;
  label: string;
  /** One line telling the customer what to do, if anything. */
  reason: string;
};

export type MailboxHealthInput = {
  /** Connection state of the mailbox row ("connected", "pending", …). */
  status?: string | null;
  isActive?: boolean | null;
  authStatus?: AuthCheckState | null;
  authReason?: string | null;
  /** True when the mailbox is held out of sending for a safety reason. */
  paused?: boolean | null;
  pauseReason?: string | null;
};

export function mailboxHealth(input: MailboxHealthInput): MailboxHealth {
  if (input.status && input.status !== "connected") {
    return {
      colour: "red",
      label: "Not connected",
      reason: "The mailbox login has not passed yet. Re-enter the password and test the connection.",
    };
  }
  if (input.authStatus === "fail") {
    return {
      colour: "red",
      label: "Authentication failing",
      reason: input.authReason ?? "This domain's email authentication records are missing or broken.",
    };
  }
  if (input.paused) {
    return {
      colour: "red",
      label: "Paused",
      reason: input.pauseReason ?? "This mailbox is paused and is not sending.",
    };
  }
  if (input.isActive === false) {
    return {
      colour: "red",
      label: "Inactive",
      reason: "This mailbox is switched off and is not included in campaigns.",
    };
  }
  if (input.authStatus === "warn") {
    return {
      colour: "yellow",
      label: "Needs attention",
      reason: input.authReason ?? "One of this domain's authentication records needs attention.",
    };
  }
  if (!input.authStatus || input.authStatus === "unchecked") {
    return {
      colour: "yellow",
      label: "Checking",
      reason: "We have not been able to check this domain's authentication records yet.",
    };
  }
  return {
    colour: "green",
    label: "Healthy",
    reason: "Connected, authenticated and sending normally.",
  };
}

export const MAILBOX_HEALTH_CLASS: Record<MailboxHealthColour, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-destructive",
};
