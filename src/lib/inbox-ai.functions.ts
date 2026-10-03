/**
 * AI Reply for the Unified Inbox.
 *
 * Uses the workspace's OWN connected AI provider key (OpenAI or Claude) through
 * the existing bring-your-own-key store and the shared generation gateway — no
 * second AI system, no MunchReach-billed AI. The draft is returned to the
 * composer for the customer to read and edit; nothing is ever sent from here.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Which AI providers this workspace can use for AI Reply (never the key). */
export const listInboxAiProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: conversation } = await context.supabase
      .from("conversations")
      .select("workspace_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conversation?.workspace_id) return { providers: [] as Array<{ id: string; label: string }> };
    const { workspaceAiKeys } = await import("@/lib/ai-keys.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const keys = await workspaceAiKeys(supabaseAdmin, conversation.workspace_id as string);
    return {
      providers: keys
        .filter((key) => key.connected && key.status !== "invalid")
        .map((key) => ({ id: key.provider, label: key.providerLabel })),
    };
  });

/** Draft a reply for the open conversation. Returns text only — never sends. */
export const draftAiReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        provider: z.enum(["openai", "anthropic"]).optional(),
        instruction: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // RLS decides whether the caller may read this conversation at all.
    const { data: conversation } = await context.supabase
      .from("conversations")
      .select("id, workspace_id, subject, prospect_email, lead_id, sending_account_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conversation) throw new Error("Conversation not found.");

    // Only THIS thread, in THIS workspace: newest N, re-ordered oldest-first.
    const { THREAD_MESSAGE_LIMIT, buildReplyPrompt, cleanAiEmail } = await import("@/lib/inbox-ai-prompt");
    const { data: messages, error: msgError } = await context.supabase
      .from("conversation_messages")
      .select("direction, from_name, from_email, body, occurred_at, sending_account_id")
      .eq("conversation_id", conversation.id)
      .eq("workspace_id", conversation.workspace_id)
      .order("occurred_at", { ascending: false })
      .limit(THREAD_MESSAGE_LIMIT);
    if (msgError) throw new Error("Couldn't read this conversation. Please try again.");

    const { data: lead } = conversation.lead_id
      ? await context.supabase
          .from("leads")
          .select("first_name, last_name, company, job_title")
          .eq("id", conversation.lead_id)
          .eq("workspace_id", conversation.workspace_id)
          .maybeSingle()
      : { data: null };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { workspaceAiCredentials } = await import("@/lib/ai-keys.server");
    const credentials = await workspaceAiCredentials(
      supabaseAdmin,
      conversation.workspace_id as string,
      data.provider ?? null,
    );
    if (!credentials) {
      throw new Error(
        "Connect your OpenAI or Claude key in Settings → Integrations to use AI Reply.",
      );
    }

    const { splitReplyBody } = await import("@/lib/email-body");
    const built = buildReplyPrompt(
      {
        prospectEmail: conversation.prospect_email as string,
        subject: conversation.subject as string | null,
        lead: lead ?? null,
        messages: [...(messages ?? [])].reverse(),
        instruction: data.instruction ?? null,
      },
      (body) => splitReplyBody(body).reply.trim(),
    );

    const { generateWithWorkspaceAi } = await import("@/lib/ai-personalization.server");
    const text = await generateWithWorkspaceAi({
      credentials,
      system: built.system,
      prompt: built.prompt,
      maxTokens: 700,
      temperature: 0.6,
    });

    const draft = cleanAiEmail(text ?? "");
    if (!draft) throw new Error("The AI didn't return a draft. Please try again.");
    return { text: draft, provider: credentials.provider, intent: built.intent };
  });

/**
 * AI Email Composer: rewrites the user's own New Email draft body. Returns a
 * suggestion only — the composer keeps the original until the user picks it.
 * Uses the workspace's own AI key (never the AI Sales Agent provider).
 */
export const composeAiEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        mode: z.enum(["improve", "human", "shorter", "professional", "warmer", "first_touch"]),
        draft: z.string().trim().min(1, "Write a draft first.").max(8000),
        recipientEmail: z.string().max(320).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member) throw new Error("Workspace not found.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { workspaceAiCredentials } = await import("@/lib/ai-keys.server");
    const credentials = await workspaceAiCredentials(supabaseAdmin, data.workspaceId, null);
    if (!credentials) {
      throw new Error("Connect your OpenAI or Claude key in Settings → Integrations to use AI Email Composer.");
    }
    const { buildComposePrompt, cleanAiEmail } = await import("@/lib/inbox-ai-prompt");
    const built = buildComposePrompt({ mode: data.mode, draft: data.draft, recipientEmail: data.recipientEmail ?? null });
    const { generateWithWorkspaceAi } = await import("@/lib/ai-personalization.server");
    const text = cleanAiEmail(
      await generateWithWorkspaceAi({ credentials, system: built.system, prompt: built.prompt, maxTokens: 900, temperature: 0.5 }),
    );
    if (!text) throw new Error("The AI didn't return a version. Please try again.");
    return { text };
  });
