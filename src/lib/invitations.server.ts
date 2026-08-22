/**
 * Team invitation emails.
 *
 * Invitations go through the same managed MunchReach email pipeline as every
 * other system email (template + provider pool + failover). No raw provider
 * API keys or hardcoded sender domains here. Failures never break the invite:
 * the row already exists, so the owner can copy the link manually.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type InviteEmailInput = {
  to: string;
  workspaceName: string;
  inviterName: string;
  role: string;
  message: string | null;
  acceptUrl: string;
};

const GENERIC_ERROR = "The invitation email could not be delivered right now.";

export async function sendInvitationEmail(
  input: InviteEmailInput,
): Promise<{ sent: boolean; error?: string }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as Admin;

    const { sendTransactionalNow } = await import("@/lib/transactional-email.server");
    const result = await sendTransactionalNow(admin, {
      eventKey: "workspace.invitation_sent",
      to: input.to,
      variables: {
        "workspace.name": input.workspaceName,
        "user.first_name": input.inviterName,
        "user.email": input.to,
        action_url: input.acceptUrl,
        ...(input.message ? { "announcement.message": input.message } : {}),
      },
    });

    if (result.ok) return { sent: true };
    return { sent: false, error: GENERIC_ERROR };
  } catch (error) {
    console.error("invitation email failed", error);
    return { sent: false, error: GENERIC_ERROR };
  }
}
