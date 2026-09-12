/**
 * Default MunchReach transactional templates.
 *
 * Each entry maps one application event key to a branded default template.
 * The defaults live in code so they can always be restored, even after an
 * admin has customised or disabled the stored copy.
 */
import { renderEmailLayout, renderEmailText, type EmailBlock } from "./layout";
import { extractVariables } from "./variables";

export const TEMPLATE_CATEGORIES = [
  "Authentication",
  "Account",
  "Workspace",
  "Billing",
  "Credits",
  "Campaigns",
  "Email Infrastructure",
  "Warmup",
  "Support",
  "Security",
  "System",
  "Transactional",
  "Lifecycle",
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

type Spec = {
  eventKey: string;
  name: string;
  category: TemplateCategory;
  subject: string;
  preheader: string;
  heading: string;
  blocks: EmailBlock[];
  reason?: string;
};

const p = (text: string): EmailBlock => ({ kind: "paragraph", text });
const cta = (label: string, url = "{{action_url}}"): EmailBlock => ({ kind: "button", label, url });
const note = (text: string): EmailBlock => ({ kind: "callout", text });

const DEFAULT_REASON =
  "You are receiving this message because it relates to your MunchReach account activity.";

const SPECS: Spec[] = [
  // ── Authentication ──────────────────────────────────────────────────────
  {
    eventKey: "user.email_verification_requested",
    name: "Email verification",
    category: "Authentication",
    subject: "Confirm your email address",
    preheader: "One click confirms your MunchReach email address.",
    heading: "Confirm your email address",
    blocks: [
      p("Hi {{user.first_name}}, please confirm {{user.email}} so we can activate your MunchReach account."),
      cta("Confirm email address"),
      p("If you did not create a MunchReach account, you can ignore this email."),
    ],
  },
  {
    eventKey: "user.password_reset_requested",
    name: "Password reset",
    category: "Authentication",
    subject: "Reset your MunchReach password",
    preheader: "Your password reset link is inside — it expires soon.",
    heading: "Reset your password",
    blocks: [
      p("Hi {{user.first_name}}, we received a request to reset the password for {{user.email}}."),
      cta("Choose a new password", "{{reset_password_url}}"),
      p("If you did not request this, no action is needed — your current password still works."),
    ],
  },
  {
    eventKey: "user.magic_link_requested",
    name: "Sign-in link",
    category: "Authentication",
    subject: "Your MunchReach sign-in link",
    preheader: "Use this link to sign in to MunchReach.",
    heading: "Sign in to MunchReach",
    blocks: [p("Hi {{user.first_name}}, here is your secure sign-in link."), cta("Sign in", "{{login_url}}")],
  },
  // ── Account ─────────────────────────────────────────────────────────────
  {
    eventKey: "user.created",
    name: "Welcome / account created",
    category: "Account",
    subject: "Welcome to MunchReach, {{user.first_name}}",
    preheader: "Your account is ready — here is how to send your first campaign.",
    heading: "Welcome to MunchReach",
    blocks: [
      p("Hi {{user.first_name}}, your MunchReach account is ready. We help you run cold outreach that actually lands in the inbox."),
      { kind: "list", items: ["Connect your sending domain", "Add an email account and start warmup", "Import leads and launch your first campaign"] },
      cta("Open your dashboard", "{{dashboard_url}}"),
    ],
    reason: "You are receiving this email because you created a MunchReach account.",
  },
  {
    eventKey: "user.password_changed",
    name: "Password changed",
    category: "Account",
    subject: "Your MunchReach password was changed",
    preheader: "Confirming a password change on your account.",
    heading: "Your password was changed",
    blocks: [
      p("Hi {{user.first_name}}, the password for {{user.email}} was changed on {{security.time}}."),
      note("If this wasn't you, reset your password immediately and contact support."),
      cta("Secure my account", "{{reset_password_url}}"),
    ],
  },
  {
    eventKey: "user.login_alert",
    name: "Login / security alert",
    category: "Account",
    subject: "New sign-in to your MunchReach account",
    preheader: "We noticed a new sign-in to your account.",
    heading: "New sign-in detected",
    blocks: [
      p("{{security.event}} at {{security.time}} from IP {{security.ip}}."),
      p("If this was you, nothing to do. Otherwise reset your password right away."),
      cta("Review account security", "{{dashboard_url}}"),
    ],
  },
  {
    eventKey: "user.suspended",
    name: "Account suspended",
    category: "Account",
    subject: "Your MunchReach account has been suspended",
    preheader: "Action is required to restore your account.",
    heading: "Your account has been suspended",
    blocks: [
      p("Hi {{user.first_name}}, sending for {{workspace.name}} has been suspended while we review recent activity."),
      p("Our team can walk you through what is needed to restore access."),
      cta("Contact support", "{{support_url}}"),
    ],
  },
  {
    eventKey: "user.reactivated",
    name: "Account reactivated",
    category: "Account",
    subject: "Your MunchReach account is active again",
    preheader: "Sending has been restored for your workspace.",
    heading: "Your account is active again",
    blocks: [p("Good news {{user.first_name}} — {{workspace.name}} is active again and sending has resumed."), cta("Open dashboard", "{{dashboard_url}}")],
  },
  {
    eventKey: "user.deleted",
    name: "Account deleted",
    category: "Account",
    subject: "Your MunchReach account has been deleted",
    preheader: "Confirmation that your account and data were removed.",
    heading: "Your account has been deleted",
    blocks: [p("Hi {{user.first_name}}, your MunchReach account and its workspace data have been removed as requested."), p("If this was a mistake, contact us within 30 days and we may be able to help.")],
  },
  // ── Workspace ───────────────────────────────────────────────────────────
  {
    eventKey: "workspace.created",
    name: "Workspace created",
    category: "Workspace",
    subject: "{{workspace.name}} is ready",
    preheader: "Your new workspace has been created.",
    heading: "{{workspace.name}} is ready",
    blocks: [p("Your workspace {{workspace.name}} was created. Next: connect a sending domain and an email account."), cta("Continue setup", "{{dashboard_url}}")],
  },
  {
    eventKey: "workspace.invitation_sent",
    name: "Workspace invitation",
    category: "Workspace",
    subject: "You've been invited to {{workspace.name}} on MunchReach",
    preheader: "Accept your invitation to join the workspace.",
    heading: "You've been invited to {{workspace.name}}",
    blocks: [p("{{user.first_name}} invited you to collaborate in {{workspace.name}} on MunchReach."), cta("Accept invitation")],
    reason: "You received this email because someone invited you to a MunchReach workspace.",
  },
  {
    eventKey: "workspace.invitation_accepted",
    name: "Invitation accepted",
    category: "Workspace",
    subject: "{{user.email}} joined {{workspace.name}}",
    preheader: "Your invitation was accepted.",
    heading: "Invitation accepted",
    blocks: [p("{{user.email}} accepted your invitation and now has access to {{workspace.name}}."), cta("View team", "{{dashboard_url}}")],
  },
  {
    eventKey: "workspace.member_joined",
    name: "Team member joined",
    category: "Workspace",
    subject: "New team member in {{workspace.name}}",
    preheader: "A new member joined your workspace.",
    heading: "New team member",
    blocks: [p("{{user.email}} is now part of {{workspace.name}}.")],
  },
  {
    eventKey: "workspace.member_removed",
    name: "Team member removed",
    category: "Workspace",
    subject: "A member was removed from {{workspace.name}}",
    preheader: "Workspace access was updated.",
    heading: "Team member removed",
    blocks: [p("{{user.email}} no longer has access to {{workspace.name}}.")],
  },
  {
    eventKey: "workspace.ownership_changed",
    name: "Workspace ownership changed",
    category: "Workspace",
    subject: "Ownership of {{workspace.name}} was transferred",
    preheader: "The workspace owner has changed.",
    heading: "Workspace ownership changed",
    blocks: [p("Ownership of {{workspace.name}} was transferred to {{user.email}}."), cta("Review workspace", "{{dashboard_url}}")],
  },
  // ── Billing ─────────────────────────────────────────────────────────────
  {
    eventKey: "account.birthday_gift",
    name: "Birthday Gift",
    category: "Billing",
    subject: "Happy Birthday from MunchReach! 🎁",
    preheader: "Your birthday gift: 1 month free on MunchReach.",
    heading: "Happy Birthday, {{user.first_name}}! 🎁",
    blocks: [
      p("Everyone at MunchReach wishes you a fantastic birthday. Thank you for building your outreach with us."),
      note("Our gift to you: 1 Month Free on {{plan.name}} — already added to your account."),
      p("Your free month runs until {{gift.expires_at}}. Nothing to pay, nothing to cancel."),
      cta("Claim your free month", "{{billing_url}}"),
    ],
    reason: "You are receiving this email because it's your birthday on your MunchReach account.",
  },

  {
    eventKey: "subscription.created",
    name: "Subscription started",
    category: "Billing",
    subject: "Your {{plan.name}} plan is active",
    preheader: "Subscription confirmed — here's what's included.",
    heading: "Your {{plan.name}} plan is active",
    blocks: [p("Thanks {{user.first_name}} — {{workspace.name}} is now on the {{plan.name}} plan at {{plan.price}}."), p("Next payment: {{billing.next_payment_date}}."), cta("View billing", "{{billing_url}}")],
  },
  {
    eventKey: "payment.succeeded",
    name: "Payment successful",
    category: "Billing",
    subject: "Payment received — {{invoice.total}}",
    preheader: "We received your payment. Receipt inside.",
    heading: "Payment received",
    blocks: [p("We received {{invoice.total}} for {{plan.name}} ({{workspace.name}})."), p("Invoice {{invoice.number}} · Next payment {{billing.next_payment_date}}."), cta("View invoice")],
  },
  {
    eventKey: "payment.failed",
    name: "Payment failed",
    category: "Billing",
    subject: "Action needed: payment failed",
    preheader: "We could not process your latest payment.",
    heading: "Your payment could not be processed",
    blocks: [
      p("We were unable to charge {{invoice.total}} for {{plan.name}}."),
      note("Sending stays active for a short grace period. Update your payment method to avoid interruption."),
      cta("Update payment method"),
    ],
  },
  {
    eventKey: "invoice.created",
    name: "Invoice created",
    category: "Billing",
    subject: "Invoice {{invoice.number}} is ready",
    preheader: "Your new invoice is available.",
    heading: "Invoice {{invoice.number}}",
    blocks: [p("A new invoice for {{invoice.total}} has been issued for {{workspace.name}}."), cta("View invoice")],
  },
  {
    eventKey: "invoice.paid",
    name: "Invoice paid",
    category: "Billing",
    subject: "Invoice {{invoice.number}} paid",
    preheader: "Thanks — your invoice is settled.",
    heading: "Invoice paid",
    blocks: [p("Invoice {{invoice.number}} for {{invoice.total}} has been paid. Thank you."), cta("Download receipt")],
  },
  {
    eventKey: "invoice.payment_failed",
    name: "Invoice payment failed",
    category: "Billing",
    subject: "Invoice {{invoice.number}} could not be paid",
    preheader: "Your invoice payment did not go through.",
    heading: "Invoice payment failed",
    blocks: [p("The payment for invoice {{invoice.number}} ({{invoice.total}}) failed."), cta("Retry payment")],
  },
  {
    eventKey: "trial.started",
    name: "Trial started",
    category: "Billing",
    subject: "Your MunchReach trial has started",
    preheader: "Explore everything on the {{plan.name}} plan.",
    heading: "Your trial has started",
    blocks: [p("Hi {{user.first_name}}, your trial of {{plan.name}} is live for {{workspace.name}}."), cta("Start sending", "{{dashboard_url}}")],
  },
  {
    eventKey: "trial.ending",
    name: "Trial ending",
    category: "Billing",
    subject: "Your trial ends soon",
    preheader: "Add a plan to keep sending without interruption.",
    heading: "Your trial ends soon",
    blocks: [p("Your MunchReach trial for {{workspace.name}} ends on {{billing.next_payment_date}}."), cta("Choose a plan")],
  },
  {
    eventKey: "trial.expired",
    name: "Trial expired",
    category: "Billing",
    subject: "Your trial has ended",
    preheader: "Reactivate to resume sending.",
    heading: "Your trial has ended",
    blocks: [p("Sending for {{workspace.name}} is paused now that the trial has ended. Your data is safe."), cta("Reactivate now")],
  },
  {
    eventKey: "subscription.cancelled",
    name: "Subscription cancelled",
    category: "Billing",
    subject: "Your subscription has been cancelled",
    preheader: "Confirmation of your cancellation.",
    heading: "Your subscription was cancelled",
    blocks: [p("The {{plan.name}} plan for {{workspace.name}} was cancelled. Access continues until {{billing.next_payment_date}}."), cta("Reactivate plan")],
  },
  {
    eventKey: "subscription.renewed",
    name: "Subscription renewed",
    category: "Billing",
    subject: "Your {{plan.name}} plan renewed",
    preheader: "Your subscription renewed successfully.",
    heading: "Subscription renewed",
    blocks: [p("{{plan.name}} renewed for {{workspace.name}} at {{plan.price}}. Next payment {{billing.next_payment_date}}.")],
  },
  {
    eventKey: "subscription.upgraded",
    name: "Plan upgraded",
    category: "Billing",
    subject: "You're now on {{plan.name}}",
    preheader: "Your plan upgrade is live.",
    heading: "Plan upgraded",
    blocks: [p("{{workspace.name}} moved up to {{plan.name}} ({{plan.price}}). Higher limits are available immediately."), cta("See your limits", "{{dashboard_url}}")],
  },
  {
    eventKey: "subscription.downgraded",
    name: "Plan downgraded",
    category: "Billing",
    subject: "Your plan changed to {{plan.name}}",
    preheader: "Your plan change has been applied.",
    heading: "Plan changed",
    blocks: [p("{{workspace.name}} is now on {{plan.name}}. Limits have been adjusted accordingly.")],
  },
  {
    eventKey: "payment.refunded",
    name: "Refund processed",
    category: "Billing",
    subject: "Your refund of {{invoice.total}} is on its way",
    preheader: "We processed your refund.",
    heading: "Refund processed",
    blocks: [p("We refunded {{invoice.total}} for invoice {{invoice.number}}. It can take 5–10 business days to appear.")],
  },
  // ── Credits ─────────────────────────────────────────────────────────────
  {
    eventKey: "credits.added",
    name: "Credits added",
    category: "Credits",
    subject: "{{credits.amount}} credits added",
    preheader: "Your credit balance has been topped up.",
    heading: "Credits added",
    blocks: [p("{{credits.amount}} credits were added to {{workspace.name}}. New balance: {{credits.balance}}."), cta("View usage", "{{dashboard_url}}")],
  },
  {
    eventKey: "credits.low",
    name: "Credits running low",
    category: "Credits",
    subject: "Your credits are running low",
    preheader: "Top up to keep your campaigns sending.",
    heading: "Credits running low",
    blocks: [p("{{workspace.name}} has {{credits.balance}} credits left. Campaigns pause automatically when credits run out."), cta("Add credits")],
  },
  {
    eventKey: "credits.exhausted",
    name: "Credits exhausted",
    category: "Credits",
    subject: "Sending paused — out of credits",
    preheader: "Add credits to resume sending.",
    heading: "You're out of credits",
    blocks: [p("Sending for {{workspace.name}} is paused because the credit balance reached zero."), cta("Add credits")],
  },
  {
    eventKey: "credits.allocated",
    name: "Credit allocation",
    category: "Credits",
    subject: "Your monthly credits have been allocated",
    preheader: "Your plan credits reset for the new period.",
    heading: "Monthly credits allocated",
    blocks: [p("{{credits.amount}} credits from {{plan.name}} were allocated to {{workspace.name}}. Balance: {{credits.balance}}.")],
  },
  {
    eventKey: "credits.adjusted",
    name: "Credit adjustment",
    category: "Credits",
    subject: "Your credit balance was adjusted",
    preheader: "A manual credit adjustment was applied.",
    heading: "Credit balance adjusted",
    blocks: [p("A support adjustment of {{credits.amount}} credits was applied to {{workspace.name}}. Balance: {{credits.balance}}."), cta("Contact support", "{{support_url}}")],
  },
  // ── Campaigns ───────────────────────────────────────────────────────────
  {
    eventKey: "campaign.launched",
    name: "Campaign launched",
    category: "Campaigns",
    subject: "{{campaign.name}} is now sending",
    preheader: "Your campaign has launched.",
    heading: "{{campaign.name}} is live",
    blocks: [p("Your campaign {{campaign.name}} started sending from {{workspace.name}}. We pace sends to protect deliverability."), cta("Monitor campaign", "{{dashboard_url}}")],
  },
  {
    eventKey: "campaign.completed",
    name: "Campaign completed",
    category: "Campaigns",
    subject: "{{campaign.name}} has finished",
    preheader: "All steps in your campaign have been sent.",
    heading: "{{campaign.name}} finished",
    blocks: [p("Every scheduled step in {{campaign.name}} has been sent. Review replies and performance in your dashboard."), cta("View results", "{{dashboard_url}}")],
  },
  {
    eventKey: "campaign.paused",
    name: "Campaign paused",
    category: "Campaigns",
    subject: "{{campaign.name}} was paused",
    preheader: "Your campaign is on hold.",
    heading: "{{campaign.name}} paused",
    blocks: [p("{{campaign.name}} is paused and no further emails will send until it is resumed."), cta("Resume campaign", "{{dashboard_url}}")],
  },
  {
    eventKey: "campaign.failed",
    name: "Campaign failed",
    category: "Campaigns",
    subject: "{{campaign.name}} stopped unexpectedly",
    preheader: "We hit a problem while sending your campaign.",
    heading: "{{campaign.name}} stopped",
    blocks: [p("We stopped {{campaign.name}} after repeated send failures so your sender reputation stays safe."), cta("Review campaign", "{{dashboard_url}}")],
  },
  {
    eventKey: "campaign.needs_attention",
    name: "Campaign requires attention",
    category: "Campaigns",
    subject: "{{campaign.name}} needs your attention",
    preheader: "A campaign issue needs a quick check.",
    heading: "{{campaign.name}} needs attention",
    blocks: [p("Something in {{campaign.name}} needs a quick review — check its email accounts, schedule and remaining leads."), cta("Open campaign", "{{dashboard_url}}")],
  },
  {
    eventKey: "positive_reply_notification",
    name: "Positive Reply Notification",
    category: "Transactional",
    subject: "\u{1F389} Positive reply from {{lead_name}}",
    preheader: "A prospect replied positively to your campaign.",
    heading: "You got a positive reply \u{1F389}",
    blocks: [
      p("{{lead_name}} from {{company_name}} replied positively to your campaign."),
      note("Campaign: {{campaign_name}}<br>From: {{lead_email}}"),
      p("\u201C{{reply_preview}}\u201D"),
      cta("View reply", "{{reply_url}}"),
      cta("Open campaign", "{{campaign_url}}"),
      p("This lead is interested. Jump into MunchReach to review the conversation and follow up."),
    ],
    reason:
      "You are receiving this because positive reply notifications are enabled for {{workspace_name}} in your MunchReach notification settings.",
  },
  {
    eventKey: "reply.received",
    name: "New Reply Received",
    category: "Transactional",
    subject: "New reply from {{lead_name}}",
    preheader: "A prospect replied to your campaign.",
    heading: "You have a new reply",
    blocks: [
      p("{{lead_name}} from {{company_name}} replied to {{campaign_name}}."),
      note("Subject: {{reply_subject}}<br>From: {{lead_email}}"),
      p("\u201C{{reply_preview}}\u201D"),
      cta("Open the conversation", "{{reply_url}}"),
      p("Replies land in your MunchReach Unified Inbox, where you can respond directly."),
    ],
    reason:
      "You are receiving this because new reply notifications are enabled for {{workspace_name}} in your MunchReach notification settings.",
  },
  // ── Email Infrastructure ────────────────────────────────────────────────
  {
    eventKey: "domain.verified",
    name: "Domain verified",
    category: "Email Infrastructure",
    subject: "{{domain.name}} is verified",
    preheader: "Your sending domain is ready.",
    heading: "{{domain.name}} is verified",
    blocks: [p("All DNS records for {{domain.name}} are in place, so this domain is ready for sending."), cta("Connect an email account", "{{dashboard_url}}")],
  },
  {
    eventKey: "domain.verification_failed",
    name: "Domain verification failed",
    category: "Email Infrastructure",
    subject: "We couldn't verify {{domain.name}}",
    preheader: "One or more DNS records are still missing.",
    heading: "{{domain.name}} is not verified yet",
    blocks: [p("Some DNS records for {{domain.name}} are missing or incorrect. Add them at your DNS host, then run the check again."), cta("Open domain setup", "{{dashboard_url}}")],
  },
  {
    eventKey: "mailbox.connected",
    name: "Email account connected",
    category: "Email Infrastructure",
    subject: "{{mailbox.email}} is connected",
    preheader: "Your email account is ready to send.",
    heading: "Email account connected",
    blocks: [p("{{mailbox.email}} is connected to {{workspace.name}}. We recommend starting warmup before high-volume sending."), cta("Start warmup", "{{dashboard_url}}")],
  },
  {
    eventKey: "mailbox.disconnected",
    name: "Email account disconnected",
    category: "Email Infrastructure",
    subject: "{{mailbox.email}} was disconnected",
    preheader: "This email account can no longer send.",
    heading: "Email account disconnected",
    blocks: [p("{{mailbox.email}} was disconnected from {{workspace.name}} and will not be used for sending.")],
  },
  {
    eventKey: "mailbox.connection_failed",
    name: "Email connection failed",
    category: "Email Infrastructure",
    subject: "Action needed: {{mailbox.email}} could not connect",
    preheader: "Please check this email account's connection.",
    heading: "We couldn't connect {{mailbox.email}}",
    blocks: [p("Your email account could not connect. Please check the connection settings and try again."), cta("Fix connection", "{{dashboard_url}}")],
  },
  {
    eventKey: "sending.paused",
    name: "Sending paused",
    category: "Email Infrastructure",
    subject: "Sending paused for {{workspace.name}}",
    preheader: "Outbound sending is temporarily on hold.",
    heading: "Sending paused",
    blocks: [p("Outbound sending for {{workspace.name}} is paused. No campaign emails will go out until it resumes."), cta("Review sending", "{{dashboard_url}}")],
  },
  {
    eventKey: "sending.resumed",
    name: "Sending resumed",
    category: "Email Infrastructure",
    subject: "Sending resumed for {{workspace.name}}",
    preheader: "Your campaigns are sending again.",
    heading: "Sending resumed",
    blocks: [p("Sending for {{workspace.name}} has resumed and queued emails are going out again.")],
  },
  {
    eventKey: "infrastructure.issue",
    name: "Sending infrastructure issue",
    category: "Email Infrastructure",
    subject: "We're investigating a sending issue",
    preheader: "A sending issue is affecting your workspace.",
    heading: "We're investigating a sending issue",
    blocks: [p("We detected a problem affecting sending for {{workspace.name}}. Our team is on it and your queued emails are preserved."), cta("Check status", "{{support_url}}")],
  },
  // ── Warmup ──────────────────────────────────────────────────────────────
  {
    eventKey: "warmup.started",
    name: "Warmup started",
    category: "Warmup",
    subject: "Warmup started for {{mailbox.email}}",
    preheader: "We're gradually building your sender reputation.",
    heading: "Warmup started",
    blocks: [p("Warmup is running for {{mailbox.email}}. We ramp volume gradually and keep engagement natural."), cta("View warmup", "{{dashboard_url}}")],
  },
  {
    eventKey: "warmup.paused",
    name: "Warmup paused",
    category: "Warmup",
    subject: "Warmup paused for {{mailbox.email}}",
    preheader: "Warmup is on hold for this email account.",
    heading: "Warmup paused",
    blocks: [p("Warmup for {{mailbox.email}} is paused. Resume it to continue building reputation."), cta("Resume warmup", "{{dashboard_url}}")],
  },
  {
    eventKey: "warmup.completed",
    name: "Warmup completed",
    category: "Warmup",
    subject: "{{mailbox.email}} finished warmup",
    preheader: "This email account is ready for full volume.",
    heading: "Warmup complete",
    blocks: [p("{{mailbox.email}} completed warmup and is ready for your normal sending volume."), cta("Launch a campaign", "{{dashboard_url}}")],
  },
  // ── Support ─────────────────────────────────────────────────────────────
  {
    eventKey: "support.ticket.created",
    name: "Support ticket created",
    category: "Support",
    subject: "We received your request ({{ticket.reference}})",
    preheader: "Our team is reviewing your support request.",
    heading: "We received your request",
    blocks: [p("Hi {{user.first_name}}, thanks for contacting MunchReach support about “{{ticket.subject}}”. Reference {{ticket.reference}}."), p("We reply to most requests within one business day."), cta("View ticket", "{{ticket_url}}")],
  },
  {
    eventKey: "support.ticket.replied",
    name: "Support ticket reply",
    category: "Support",
    subject: "Re: {{ticket.subject}} ({{ticket.reference}})",
    preheader: "There's a new reply on your support ticket.",
    heading: "New reply from MunchReach support",
    blocks: [note("{{ticket.message}}"), cta("Open ticket", "{{ticket_url}}")],
  },
  {
    eventKey: "support.ticket.resolved",
    name: "Support ticket resolved",
    category: "Support",
    subject: "Your ticket {{ticket.reference}} is resolved",
    preheader: "We closed your support request.",
    heading: "Your ticket is resolved",
    blocks: [p("We marked “{{ticket.subject}}” as resolved. Reply any time if the issue comes back."), cta("Reopen ticket", "{{ticket_url}}")],
  },
  // ── Security ────────────────────────────────────────────────────────────
  {
    eventKey: "security.new_login",
    name: "New login",
    category: "Security",
    subject: "New login to your MunchReach account",
    preheader: "A new device signed in to your account.",
    heading: "New login detected",
    blocks: [p("{{security.event}} · {{security.time}} · IP {{security.ip}}"), cta("Review activity", "{{dashboard_url}}")],
  },
  {
    eventKey: "security.email_changed",
    name: "Email address changed",
    category: "Security",
    subject: "Your account email was changed",
    preheader: "Your MunchReach sign-in email was updated.",
    heading: "Your account email was changed",
    blocks: [p("The email on your MunchReach account is now {{user.email}}."), note("If you did not make this change, contact support immediately."), cta("Contact support", "{{support_url}}")],
  },
  {
    eventKey: "security.suspicious_activity",
    name: "Suspicious activity",
    category: "Security",
    subject: "Unusual activity on your MunchReach account",
    preheader: "We noticed something unusual on your account.",
    heading: "Unusual activity detected",
    blocks: [p("We noticed unusual activity on {{workspace.name}}: {{security.event}} at {{security.time}}."), cta("Secure my account", "{{reset_password_url}}")],
  },
  {
    eventKey: "security.admin_alert",
    name: "Admin security notification",
    category: "Security",
    subject: "[MunchReach] Security alert: {{security.event}}",
    preheader: "Internal security notification.",
    heading: "Security alert",
    blocks: [p("{{security.event}}"), p("Workspace: {{workspace.name}} · Time: {{security.time}} · IP: {{security.ip}}"), cta("Open admin console", "{{dashboard_url}}")],
    reason: "You are receiving this because you are a MunchReach platform administrator.",
  },
  // ── System ──────────────────────────────────────────────────────────────
  {
    eventKey: "system.announcement",
    name: "Important platform announcement",
    category: "System",
    subject: "{{announcement.title}}",
    preheader: "An important update about MunchReach.",
    heading: "{{announcement.title}}",
    blocks: [p("{{announcement.message}}"), cta("Learn more", "{{dashboard_url}}")],
  },
  {
    eventKey: "system.maintenance",
    name: "Scheduled maintenance",
    category: "System",
    subject: "Scheduled maintenance: {{announcement.title}}",
    preheader: "Planned maintenance window details inside.",
    heading: "Scheduled maintenance",
    blocks: [p("{{announcement.message}}"), p("Queued campaign emails are preserved and sent after the window.")],
  },
  {
    eventKey: "system.disruption",
    name: "Service disruption",
    category: "System",
    subject: "Service disruption: {{announcement.title}}",
    preheader: "We're working on an active incident.",
    heading: "We're investigating a service disruption",
    blocks: [p("{{announcement.message}}"), cta("Follow updates", "{{support_url}}")],
  },
  {
    eventKey: "system.restored",
    name: "Service restored",
    category: "System",
    subject: "Service restored",
    preheader: "Everything is back to normal.",
    heading: "Service restored",
    blocks: [p("{{announcement.message}}"), p("All queued emails have resumed processing.")],
  },
  // ── Lifecycle ───────────────────────────────────────────────────────────
  {
    eventKey: "lifecycle.free_offer_5",
    name: "Free user — 5% upgrade offer",
    category: "Lifecycle",
    subject: "{{user.first_name}}, here's 5% off your MunchReach upgrade",
    preheader: "A private discount code to unlock your full sending capacity.",
    heading: "Ready to send at full capacity?",
    blocks: [
      p("Hi {{user.first_name}}, you set up {{workspace.name}} on MunchReach but haven't upgraded yet. Here is {{coupon.percent}}% off your first payment on any plan."),
      note("Your code: {{coupon.code}} — valid until {{coupon.expires_at}}. Enter it at checkout."),
      { kind: "list", items: ["Higher monthly sending limits", "Automated mailbox warmup", "Unified inbox for every reply", "AI personalisation on every lead"] },
      cta("Upgrade with {{coupon.percent}}% off", "{{upgrade_url}}"),
      p("Questions about which plan fits? Reply to this email and our team will help."),
    ],
    reason: "You are receiving this email because you have a MunchReach account that has not been upgraded yet.",
  },
  {
    eventKey: "lifecycle.free_offer_10",
    name: "Free user — 10% upgrade offer",
    category: "Lifecycle",
    subject: "Final offer: {{coupon.percent}}% off MunchReach",
    preheader: "A larger discount code before it expires.",
    heading: "{{coupon.percent}}% off — our best offer",
    blocks: [
      p("Hi {{user.first_name}}, your MunchReach workspace {{workspace.name}} is still on the free plan. We've increased the discount to {{coupon.percent}}% so you can get started properly."),
      note("Your code: {{coupon.code}} — valid until {{coupon.expires_at}}."),
      p("Everything is already set up in your account. Upgrading unlocks your sending limits, warmup and the unified inbox straight away."),
      cta("Claim {{coupon.percent}}% off", "{{upgrade_url}}"),
    ],
    reason: "You are receiving this email because you have a MunchReach account that has not been upgraded yet.",
  },
  {
    eventKey: "lifecycle.inactive_reengage_1",
    name: "Inactive customer — re-engagement 1",
    category: "Lifecycle",
    subject: "Your MunchReach account is waiting, {{user.first_name}}",
    preheader: "Pick up where you left off in a couple of clicks.",
    heading: "Pick up where you left off",
    blocks: [
      p("Hi {{user.first_name}}, we haven't seen any activity in {{workspace.name}} for {{inactive.days}} days. Your domains, mailboxes and leads are exactly where you left them."),
      { kind: "list", items: ["Resume or duplicate an existing campaign", "Check replies in your unified inbox", "Keep your mailboxes warm so deliverability holds"] },
      cta("Open your dashboard", "{{dashboard_url}}"),
    ],
    reason: "You are receiving this email because your MunchReach account has been inactive.",
  },
  {
    eventKey: "lifecycle.inactive_reengage_2",
    name: "Inactive customer — re-engagement 2",
    category: "Lifecycle",
    subject: "{{workspace.name}} has been quiet for {{inactive.days}} days",
    preheader: "Your sending reputation cools down when campaigns stop.",
    heading: "Cold mailboxes cost you replies",
    blocks: [
      p("Hi {{user.first_name}}, mailboxes that stop sending lose the reputation they built. Restarting now is far easier than rebuilding it later."),
      p("Your plan {{plan.name}} is still active, so you can relaunch a campaign today without any setup work."),
      cta("Restart your outreach", "{{dashboard_url}}"),
      p("If something got in the way, tell us what happened — we read every reply."),
    ],
    reason: "You are receiving this email because your MunchReach account has been inactive.",
  },
  {
    eventKey: "lifecycle.inactive_reengage_3",
    name: "Inactive customer — re-engagement 3",
    category: "Lifecycle",
    subject: "Do you still need your MunchReach account?",
    preheader: "Inactive accounts are eventually closed.",
    heading: "Do you still need your account?",
    blocks: [
      p("Hi {{user.first_name}}, {{workspace.name}} has now been inactive for {{inactive.days}} days. Accounts that stay unused are scheduled for closure so we can keep our sending infrastructure clean."),
      p("Signing in once is enough to keep everything as it is."),
      cta("Sign in to keep my account", "{{login_url}}"),
      p("Need a different plan or a hand getting restarted? Reply and we'll sort it out."),
    ],
    reason: "You are receiving this email because your MunchReach account has been inactive.",
  },
  {
    eventKey: "lifecycle.inactive_final_warning",
    name: "Inactive customer — final warning",
    category: "Lifecycle",
    subject: "Action required: {{workspace.name}} closes on {{termination.date}}",
    preheader: "Sign in before this date to keep your account open.",
    heading: "Your account is scheduled to close",
    blocks: [
      p("Hi {{user.first_name}}, {{workspace.name}} has been inactive for {{inactive.days}} days. Because of that, the account is scheduled to be closed on {{termination.date}}."),
      note("Signing in before {{termination.date}} cancels the closure automatically. Nothing else is needed."),
      cta("Sign in and keep my account", "{{login_url}}"),
      p("If you would rather close the account or need help with billing, contact our support team: {{support_url}}"),
    ],
    reason: "You are receiving this email because your MunchReach account is scheduled for closure due to inactivity.",
  },
  {
    eventKey: "lifecycle.account_terminated",
    name: "Account terminated",
    category: "Lifecycle",
    subject: "Your MunchReach account has been closed",
    preheader: "Your account was closed after a long period of inactivity.",
    heading: "Your account has been closed",
    blocks: [
      p("Hi {{user.first_name}}, your MunchReach account for {{workspace.name}} ({{user.email}}) was closed on {{termination.date}} after {{inactive.days}} days without activity, following the reminders we sent."),
      p("Sign-in is now disabled and campaigns, warmup and sending have stopped. Your workspace data is retained in a suspended state rather than deleted, so an account can be restored if this was a mistake."),
      note("Want your account back, or want your data deleted instead? Contact our support team and we'll handle it."),
      cta("Contact support", "{{support_url}}"),
    ],
    reason: "You are receiving this email because your MunchReach account was closed.",
  },
];

export type DefaultTemplate = {
  eventKey: string;
  name: string;
  category: TemplateCategory;
  subject: string;
  preheader: string;
  html: string;
  text: string;
  variables: string[];
};

function build(spec: Spec): DefaultTemplate {
  const layout = {
    heading: spec.heading,
    preheader: spec.preheader,
    blocks: spec.blocks,
    reason: spec.reason ?? DEFAULT_REASON,
  };
  const html = renderEmailLayout(layout);
  const text = renderEmailText(layout);
  return {
    eventKey: spec.eventKey,
    name: spec.name,
    category: spec.category,
    subject: spec.subject,
    preheader: spec.preheader,
    html,
    text,
    variables: extractVariables(spec.subject, html, text),
  };
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = SPECS.map(build);

const BY_KEY = new Map(DEFAULT_TEMPLATES.map((t) => [t.eventKey, t]));

export function defaultTemplate(eventKey: string): DefaultTemplate | null {
  return BY_KEY.get(eventKey) ?? null;
}

/** Event key → template key mapping. Application code triggers events only. */
export const EVENT_KEYS = DEFAULT_TEMPLATES.map((t) => t.eventKey);
export type TransactionalEvent = (typeof EVENT_KEYS)[number];
