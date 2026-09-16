/**
 * Storage for MANUAL email attachments (Unified Inbox Compose + Reply).
 *
 * Files live in the same private Cloudflare R2 bucket as every other file the
 * product stores — there is no second storage system. Files still travel inline
 * through the mail relay; this keeps a copy so the same file can be downloaded
 * again from the thread view, handed out only as short-lived signed links.
 *
 * Keys are namespaced `campaigns/mail-attachments/<workspace>/…` so the generic
 * shared-file endpoints refuse them: the only way to a link is the inbox
 * download function, which checks the caller can read that message first.
 *
 * Campaign sending is untouched: campaigns do not send files.
 */
import { safeFileName } from "@/lib/files-model";
import type { OutboundAttachment } from "@/lib/mail-attachments";

const KEY_PREFIX = "campaigns/mail-attachments";

/** Stored attachment shape written into `conversation_messages.attachments`. */
export type ArchivedAttachment = {
  name: string;
  contentType: string;
  size: number;
  /** Object key in the private R2 bucket; absent for older messages. */
  path?: string;
  /** Legacy/provider-hosted link. */
  url?: string;
};

function decodeBase64(content: string): Uint8Array {
  const binary = atob(content.replace(/[\r\n\s]/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** True for keys this module owns, so the download path can never sign anything else. */
export function isMailAttachmentKey(key: string): boolean {
  return (
    key.startsWith(`${KEY_PREFIX}/`) && !key.includes("..") && !key.includes("//") && key.length < 512
  );
}

/**
 * Keeps a copy of every attachment that carries content and returns the archive
 * records for the message. A failed upload never fails the send — the message is
 * already delivered at that point, so the attachment is archived as metadata
 * only and simply is not downloadable.
 */
export async function storeOutboundAttachments(input: {
  workspaceId: string;
  attachments: OutboundAttachment[];
}): Promise<ArchivedAttachment[]> {
  const { attachmentBytes } = await import("@/lib/mail-attachments");
  const { putR2Object, r2Configured } = await import("@/lib/r2.server");
  const configured = r2Configured();
  const stored: ArchivedAttachment[] = [];

  for (const file of input.attachments) {
    const record: ArchivedAttachment = {
      name: file.name,
      contentType: file.contentType ?? "application/octet-stream",
      size: attachmentBytes(file),
      ...(file.url ? { url: file.url } : {}),
    };

    if (file.content && configured) {
      const key = `${KEY_PREFIX}/${input.workspaceId}/${randomId()}-${safeFileName(file.name)}`;
      try {
        await putR2Object(key, decodeBase64(file.content), record.contentType);
        record.path = key;
      } catch (error) {
        console.warn(
          `[mail-attachments] copy of "${file.name}" could not be kept — ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      }
    }

    stored.push(record);
  }

  return stored;
}

/** Short-lived download link for one stored attachment. */
export async function signAttachmentDownload(input: { path: string }): Promise<string> {
  if (!isMailAttachmentKey(input.path)) {
    throw new Error("This attachment reference is not valid.");
  }
  const { presignR2Url } = await import("@/lib/r2.server");
  return presignR2Url({ key: input.path, method: "GET", expiresInSeconds: 300 });
}
