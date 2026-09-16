/**
 * Attachments for MANUAL sends only (Compose + Reply in the Unified Inbox).
 *
 * Files are carried inline as base64 from the browser, straight through the
 * mail relay into one real multipart MIME message on the customer's own SMTP
 * connection. Nothing is written to file storage: the bytes live only for the
 * duration of the send, and the message archive keeps just the file's name,
 * type and size (the same shape the thread view already renders).
 *
 * Campaign sending is deliberately untouched — campaigns do not send files.
 */

/**
 * Total raw bytes allowed across all attachments in one message. Mail servers
 * commonly cap a message at 20–25 MB *after* base64 encoding, which inflates
 * content by roughly a third, so 15 MB of real files is the safe ceiling.
 */
export const MAX_TOTAL_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

export type OutboundAttachment = {
  name: string;
  contentType?: string | undefined;
  size?: number | undefined;
  /** Base64-encoded file content. Absent on archived (already sent) records. */
  content?: string | undefined;
  /** Legacy link-style attachment (a URL typed by the user). */
  url?: string | undefined;
};

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * Real byte size of one attachment. When base64 content is present its decoded
 * length is authoritative — a client-reported `size` is never trusted for the
 * limit check.
 */
export function attachmentBytes(file: {
  size?: number | null | undefined;
  content?: string | null | undefined;
}): number {
  if (file.content) return Math.floor((file.content.replace(/[\r\n\s=]/g, "").length * 3) / 4);
  return file.size ?? 0;
}

export function totalAttachmentBytes(
  attachments: { size?: number | null | undefined; content?: string | null | undefined }[],
): number {
  return attachments.reduce((sum, file) => sum + attachmentBytes(file), 0);
}

export const ATTACHMENT_LIMIT_MESSAGE = `Attachments are too large. Keep the total under ${formatBytes(
  MAX_TOTAL_ATTACHMENT_BYTES,
)} — most email providers reject anything bigger.`;

/** Throws a customer-facing error when the files exceed what mail can carry. */
export function assertAttachmentsWithinLimit(
  attachments: { size?: number | null | undefined; content?: string | null | undefined }[],
): void {
  if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new Error(`You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files to one email.`);
  }
  if (totalAttachmentBytes(attachments) > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new Error(ATTACHMENT_LIMIT_MESSAGE);
  }
}

/** Base64 for arbitrary binary content, chunked so large files never blow the stack. */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

/** Reads a picked file into the inline shape the send path expects. */
export async function fileToOutboundAttachment(file: File): Promise<OutboundAttachment> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    name: (file.name || "attachment").slice(0, 200),
    contentType: file.type || "application/octet-stream",
    size: file.size,
    content: toBase64(bytes),
  };
}

/** What gets written to the message archive: metadata only, never file bytes. */
export function archivedAttachments(attachments: OutboundAttachment[]) {
  return attachments.map((file) => ({
    name: file.name,
    contentType: file.contentType ?? "application/octet-stream",
    size: attachmentBytes(file),
    ...(file.url ? { url: file.url } : {}),
  }));
}

/** What the relay needs to build the MIME parts. Link-only entries are skipped. */
export function relayAttachments(attachments: OutboundAttachment[]) {
  return attachments
    .filter((file) => !!file.content)
    .map((file) => ({
      filename: file.name,
      contentType: file.contentType || "application/octet-stream",
      contentBase64: file.content as string,
    }));
}
