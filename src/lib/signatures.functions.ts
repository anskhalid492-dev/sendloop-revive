/**
 * Customer-facing signature management (Settings → Email Signature).
 *
 * Every call is authenticated, checked against workspace membership, and every
 * mailbox id is verified to belong to that workspace before anything is read or
 * written. HTML is sanitized here, server-side, before it is stored — the
 * browser's markup is never trusted.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SITE_URL } from "@/lib/seo";
import {
  MAX_SIGNATURE_IMAGE_BYTES,
  buildR2Key,
  fileExtension,
  isSignatureImageMimeType,
  safeFileName,
  signatureImageUrl,
} from "@/lib/files-model";
import {
  PREVIEW_SENDER_FIELDS,
  renderSignature,
  sanitizeSignatureHtml,
  senderFieldsFrom,
  signatureHtmlToText,
  type SignatureSenderFields,
} from "@/lib/signature-model";
import { senderFieldsForMailbox } from "@/lib/signatures.server";

type AuthContext = { supabase: any; userId: string };

const senderFieldsSchema = z
  .object({
    first_name: z.string().trim().max(120).optional(),
    last_name: z.string().trim().max(120).optional(),
    email: z.string().trim().max(200).optional(),
    company: z.string().trim().max(160).optional(),
    job_title: z.string().trim().max(160).optional(),
    phone: z.string().trim().max(60).optional(),
    website: z.string().trim().max(300).optional(),
  })
  .partial();

async function assertMember(context: AuthContext, workspaceId: string) {
  const { data, error } = await context.supabase.rpc("is_workspace_member", {
    _workspace_id: workspaceId,
    _user_id: context.userId,
  });
  if (error) throw new Error("Could not verify your workspace access.");
  if (!data) throw new Error("You do not have access to this workspace.");
}

/** Only mailboxes that really belong to this workspace may be touched. */
async function verifiedMailboxes(
  context: AuthContext,
  workspaceId: string,
  mailboxIds: string[],
): Promise<Map<string, { id: string; email_address: string; display_name: string | null }>> {
  const { data, error } = await context.supabase
    .from("mailboxes")
    .select("id, email_address, display_name")
    .eq("workspace_id", workspaceId)
    .in("id", mailboxIds);
  if (error) throw new Error(error.message);
  const map = new Map<string, { id: string; email_address: string; display_name: string | null }>();
  for (const row of (data ?? []) as Array<{ id: string; email_address: string; display_name: string | null }>) {
    map.set(row.id, row);
  }
  return map;
}

export type SignatureMailbox = {
  mailboxId: string;
  email: string;
  displayName: string | null;
  status: string | null;
  signature: {
    id: string;
    name: string;
    html: string;
    text: string;
    enabled: boolean;
    senderFields: SignatureSenderFields;
    updatedAt: string | null;
  } | null;
};

/** Every connected mailbox with its signature (null = "No signature configured"). */
export const listMailboxSignatures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ mailboxes: SignatureMailbox[]; storageReady: boolean }> => {
    await assertMember(context as AuthContext, data.workspaceId);

    const { data: mailboxes, error } = await context.supabase
      .from("mailboxes")
      .select("id, email_address, display_name, status")
      .eq("workspace_id", data.workspaceId)
      .order("email_address", { ascending: true });
    if (error) throw new Error(error.message);

    const rows = (mailboxes ?? []) as Array<{
      id: string;
      email_address: string;
      display_name: string | null;
      status: string | null;
    }>;

    let signatures: any[] = [];
    let storageReady = true;
    if (rows.length) {
      const result = await (context.supabase as any)
        .from("email_signatures")
        .select("id, mailbox_id, name, html_signature, plain_text_signature, enabled, sender_fields, updated_at")
        .eq("workspace_id", data.workspaceId);
      if (result.error) storageReady = false;
      else signatures = (result.data ?? []) as any[];
    }
    const byMailbox = new Map(signatures.map((s) => [s.mailbox_id as string, s]));

    return {
      storageReady,
      mailboxes: rows.map((mailbox) => {
        const row = byMailbox.get(mailbox.id);
        return {
          mailboxId: mailbox.id,
          email: mailbox.email_address,
          displayName: mailbox.display_name,
          status: mailbox.status,
          signature: row
            ? {
                id: row.id as string,
                name: (row.name as string) ?? "Signature",
                html: (row.html_signature as string) ?? "",
                text: (row.plain_text_signature as string) ?? "",
                enabled: row.enabled !== false,
                senderFields: senderFieldsFrom(row.sender_fields ?? null),
                updatedAt: (row.updated_at as string) ?? null,
              }
            : null,
        };
      }),
    };
  });

const saveSchema = z.object({
  workspaceId: z.string().uuid(),
  mailboxIds: z.array(z.string().uuid()).min(1).max(200),
  name: z.string().trim().min(1).max(120).default("Signature"),
  html: z.string().max(40_000),
  text: z.string().max(20_000).optional(),
  enabled: z.boolean().default(true),
  senderFields: senderFieldsSchema.optional(),
});

/**
 * Create or update the signature of one mailbox — or, when several mailbox ids
 * are given, apply the same signature to exactly those mailboxes. Mailboxes that
 * were not selected are never touched.
 */
export const saveMailboxSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertMember(context as AuthContext, data.workspaceId);

    const allowed = await verifiedMailboxes(context as AuthContext, data.workspaceId, data.mailboxIds);
    const html = sanitizeSignatureHtml(data.html);
    const text = (data.text ?? "").trim() || signatureHtmlToText(html);
    const senderFields = senderFieldsFrom(data.senderFields ?? null);

    let updated = 0;
    const failed: Array<{ mailboxId: string; reason: string }> = [];

    for (const mailboxId of data.mailboxIds) {
      if (!allowed.has(mailboxId)) {
        failed.push({ mailboxId, reason: "Mailbox is not in this workspace" });
        continue;
      }
      const { error } = await (context.supabase as any).from("email_signatures").upsert(
        {
          workspace_id: data.workspaceId,
          mailbox_id: mailboxId,
          name: data.name,
          html_signature: html,
          plain_text_signature: text,
          enabled: data.enabled,
          sender_fields: senderFields,
        },
        { onConflict: "mailbox_id" },
      );
      if (error) failed.push({ mailboxId, reason: error.message });
      else updated += 1;
    }

    const { clearSignatureCache } = await import("@/lib/signatures.server");
    clearSignatureCache();

    return { updated, failedCount: failed.length, failed, html, text };
  });

export const setSignatureEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        mailboxId: z.string().uuid(),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context as AuthContext, data.workspaceId);
    const allowed = await verifiedMailboxes(context as AuthContext, data.workspaceId, [data.mailboxId]);
    if (!allowed.has(data.mailboxId)) throw new Error("Mailbox is not in this workspace.");

    const { error } = await (context.supabase as any)
      .from("email_signatures")
      .update({ enabled: data.enabled })
      .eq("workspace_id", data.workspaceId)
      .eq("mailbox_id", data.mailboxId);
    if (error) throw new Error(error.message);

    const { clearSignatureCache } = await import("@/lib/signatures.server");
    clearSignatureCache();
    return { ok: true, enabled: data.enabled };
  });

export const deleteMailboxSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), mailboxId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context as AuthContext, data.workspaceId);
    const allowed = await verifiedMailboxes(context as AuthContext, data.workspaceId, [data.mailboxId]);
    if (!allowed.has(data.mailboxId)) throw new Error("Mailbox is not in this workspace.");

    const { error } = await (context.supabase as any)
      .from("email_signatures")
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("mailbox_id", data.mailboxId);
    if (error) throw new Error(error.message);

    const { clearSignatureCache } = await import("@/lib/signatures.server");
    clearSignatureCache();
    return { ok: true };
  });

/**
 * Rendered preview. With a mailbox selected the real mailbox values are used;
 * otherwise clearly-labelled example values fill the sender tokens.
 */
export const previewMailboxSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        mailboxId: z.string().uuid().nullish(),
        html: z.string().max(40_000),
        text: z.string().max(20_000).optional(),
        senderFields: senderFieldsSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context as AuthContext, data.workspaceId);

    let fields: SignatureSenderFields = senderFieldsFrom(data.senderFields ?? null);
    let usingExamples = true;
    if (data.mailboxId) {
      const allowed = await verifiedMailboxes(context as AuthContext, data.workspaceId, [data.mailboxId]);
      const mailbox = allowed.get(data.mailboxId);
      if (mailbox) {
        fields = senderFieldsForMailbox(mailbox, data.senderFields ?? null);
        usingExamples = false;
      }
    }
    for (const key of Object.keys(fields) as Array<keyof SignatureSenderFields>) {
      if (!fields[key]) {
        fields[key] = PREVIEW_SENDER_FIELDS[key];
        usingExamples = true;
      }
    }

    const rendered = renderSignature(
      { html_signature: data.html, plain_text_signature: data.text ?? "", enabled: true },
      fields,
    );
    return {
      html: rendered?.html ?? "",
      text: rendered?.text ?? "",
      usingExamples,
      fields,
    };
  });

/**
 * Presigned upload for a signature image. Images live in the private R2 bucket
 * under a workspace-scoped key and are served to email clients through the
 * public passthrough route — no storage credentials ever leave the server.
 */
export const requestSignatureImageUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        mailboxId: z.string().uuid().nullish(),
        fileName: z.string().trim().min(1).max(255),
        mimeType: z.string().trim().max(120),
        size: z.number().int().positive().max(MAX_SIGNATURE_IMAGE_BYTES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context as AuthContext, data.workspaceId);

    const mimeType = data.mimeType.toLowerCase();
    if (!isSignatureImageMimeType(mimeType)) {
      throw new Error("Signature images must be PNG, JPEG, WebP or GIF.");
    }
    if (data.size > MAX_SIGNATURE_IMAGE_BYTES) {
      throw new Error("Signature images must be 2 MB or smaller.");
    }

    const key = buildR2Key({
      category: "signatures",
      userId: context.userId,
      workspaceId: data.workspaceId,
      extension: fileExtension(data.fileName, "png"),
      fileName: data.fileName,
    });

    const { presignR2Url } = await import("@/lib/r2.server");
    const uploadUrl = await presignR2Url({ key, method: "PUT", expiresInSeconds: 300 });

    await (context.supabase as any).from("files").insert({
      user_id: context.userId,
      workspace_id: data.workspaceId,
      type: "signatures",
      r2_key: key,
      file_name: safeFileName(data.fileName),
      size: data.size,
      mime_type: mimeType,
      status: "pending",
    });

    return { key, uploadUrl, url: signatureImageUrl(key, SITE_URL), expiresIn: 300 };
  });

export const confirmSignatureImageUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ key: z.string().trim().min(3).max(512), status: z.enum(["ready", "failed"]).default("ready") })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!data.key.startsWith(`signatures/${context.userId}/`)) throw new Error("Forbidden");
    await context.supabase
      .from("files")
      .update({ status: data.status })
      .eq("r2_key", data.key)
      .eq("user_id", context.userId);
    return { ok: true, url: signatureImageUrl(data.key, SITE_URL) };
  });

/**
 * The signature a campaign/sequence preview should show: resolved from the
 * mailbox behind the selected sending account, exactly as the send path does.
 * Returns empty strings when that mailbox has no active signature.
 */
export const getSendingAccountSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sendingAccountId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: account, error } = await context.supabase
      .from("sending_accounts")
      .select("id, workspace_id, from_email, from_name")
      .eq("id", data.sendingAccountId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!account) return { html: "", text: "", mailbox: null };

    await assertMember(context as AuthContext, account.workspace_id as string);

    const { resolveSignatureForSender } = await import("@/lib/signatures.server");
    const rendered = await resolveSignatureForSender(
      context.supabase,
      account.workspace_id as string,
      account.from_email as string,
      account.from_name as string | null,
    );
    return {
      html: rendered?.html ?? "",
      text: rendered?.text ?? "",
      mailbox: (account.from_email as string) ?? null,
    };
  });
