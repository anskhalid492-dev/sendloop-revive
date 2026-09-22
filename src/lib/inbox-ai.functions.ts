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

const SYSTEM_PROMPT = [
  "You write replies for a B2B sales rep answering a prospect's email.",
  "Write only the reply body: no subject line, no signature, no placeholders.",
  "Be concise (2-5 short sentences), specific to what the prospect wrote, plain and human.",
  "Never invent facts, prices, case studies or commitments that are not in the thread.",
  "If the prospect asked a question you cannot answer from the thread, offer to follow up.",
  "Plain text only.",
].join(" ");

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
      .select("id, workspace_id, subject, prospect_email, prospect_name, lead_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conversation) throw new Error("Conversation not found.");

    const { data: messages } = await context.supabase
      .from("conversation_messages")
      .select("direction, from_name, from_email, body, occurred_at")
      .eq("conversation_id", conversation.id)
      .order("occurred_at", { ascending: false })
      .limit(8);

    const { data: lead } = conversation.lead_id
      ? await context.supabase
          .from("leads")
          .select("first_name, last_name, company, job_title")
          .eq("id", conversation.lead_id)
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
    const thread = [...(messages ?? [])]
      .reverse()
      .map((message) => {
        const who = message.direction === "inbound" ? "PROSPECT" : "US";
        const text = splitReplyBody(message.body as string | null).reply.slice(0, 2000);
        return `${who} (${message.from_email}):\n${text}`;
      })
      .join("\n\n---\n\n");

    const facts = [
      `Prospect: ${conversation.prospect_name || conversation.prospect_email}`,
      lead?.company ? `Company: ${lead.company}` : "",
      lead?.job_title ? `Role: ${lead.job_title}` : "",
      conversation.subject ? `Subject: ${conversation.subject}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const { generateWithWorkspaceAi } = await import("@/lib/ai-personalization.server");
    const text = await generateWithWorkspaceAi({
      credentials,
      system: SYSTEM_PROMPT,
      prompt: [
        facts,
        "",
        "Conversation so far (oldest first):",
        thread || "(no messages yet)",
        "",
        data.instruction ? `Extra instruction from the rep: ${data.instruction}` : "",
        "Write the next reply from US.",
      ]
        .filter(Boolean)
        .join("\n"),
      maxTokens: 600,
      temperature: 0.5,
    });

    const draft = (text ?? "").trim();
    if (!draft) throw new Error("The AI didn't return a draft. Please try again.");
    return { text: draft, provider: credentials.provider };
  });
