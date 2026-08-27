/**
 * Authentication emails sent through the MunchReach transactional engine
 * instead of the auth provider's built-in mailer. The From address comes
 * from the centralized system sender mapping (accounts purpose).
 *
 * The link itself is still minted by the auth service, so sessions, token
 * expiry and single-use semantics are unchanged — only the delivery path and
 * the branding differ.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { emitTransactionalEvent } from "@/lib/transactional-events.server";

const input = z.object({
  email: z.string().trim().toLowerCase().email(),
  redirectTo: z.string().trim().url().max(500),
});

async function sendAuthLink(
  type: "recovery" | "magiclink",
  email: string,
  redirectTo: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
    type,
    email,
    options: { redirectTo },
  });
  // A missing account must look identical to a delivered link.
  if (error || !link?.properties?.action_link) return;

  const userId = link.user?.id ?? null;
  const actionUrl = link.properties.action_link;

  await emitTransactionalEvent({
    eventKey: type === "recovery" ? "user.password_reset_requested" : "user.magic_link_requested",
    to: email,
    userId,
    variables: {
      "user.email": email,
      reset_password_url: actionUrl,
      login_url: actionUrl,
      action_url: actionUrl,
    },
    // One link per request, so the idempotency key is request-unique.
    idempotencyKey: `${type}:${userId ?? email}:${Date.now()}`,
    immediate: true,
  });
}

export const requestPasswordResetEmail = createServerFn({ method: "POST" })
  .inputValidator((raw) => input.parse(raw))
  .handler(async ({ data }) => {
    await sendAuthLink("recovery", data.email, data.redirectTo);
    return { ok: true };
  });

export const requestMagicLinkEmail = createServerFn({ method: "POST" })
  .inputValidator((raw) => input.parse(raw))
  .handler(async ({ data }) => {
    await sendAuthLink("magiclink", data.email, data.redirectTo);
    return { ok: true };
  });
