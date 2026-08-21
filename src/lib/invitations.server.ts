/**
 * Team invitation emails.
 *
 * Sent through the managed Resend account. Failures never break the invite:
 * the row is already created, so the owner can copy the link manually.
 */
const FROM = "MunchReach <support@munchreach.com>";
const REPLY_TO = "support@munchreach.com";

export type InviteEmailInput = {
  to: string;
  workspaceName: string;
  inviterName: string;
  role: string;
  message: string | null;
  acceptUrl: string;
};

export async function sendInvitationEmail(
  input: InviteEmailInput,
): Promise<{ sent: boolean; error?: string }> {
  const key = process.env["RESEND_API_KEY"];
  if (!key) return { sent: false, error: "Email sending is not configured" };

  const note = input.message
    ? `<p style="margin:16px 0;padding:12px 16px;background:#f5f5f7;border-radius:8px">${escapeHtml(input.message)}</p>`
    : "";

  const html = `
    <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:0 auto">
      <h1 style="font-size:20px">You've been invited to ${escapeHtml(input.workspaceName)}</h1>
      <p>${escapeHtml(input.inviterName)} invited you to join the workspace as <strong>${escapeHtml(
        input.role,
      )}</strong> on MunchReach.</p>
      ${note}
      <p style="margin:24px 0">
        <a href="${input.acceptUrl}" style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Accept invitation</a>
      </p>
      <p style="color:#666;font-size:12px">If the button doesn't work, paste this link:<br>${input.acceptUrl}</p>
    </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        reply_to: [REPLY_TO],
        to: [input.to],
        subject: `Join ${input.workspaceName} on MunchReach`,
        html,
      }),
    });
    if (!res.ok) return { sent: false, error: `Email provider returned ${res.status}` };
    return { sent: true };
  } catch {
    return { sent: false, error: "Could not reach the email provider" };
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
