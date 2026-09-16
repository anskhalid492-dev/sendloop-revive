/**
 * Storage for MANUAL email attachments (Unified Inbox Compose + Reply).
 *
 * Files still travel inline through the mail relay — this only keeps a copy so
 * the same file can be downloaded again from the thread view. Copies live in the
 * private `mail-attachments` bucket under the workspace id, and are only ever
 * handed out as short-lived signed links generated on the server.
 *
 * Campaign sending is untouched: campaigns do not send files.
 */
import type { OutboundAttachment } from "@/lib/mail-attachments";

type Admin = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: ArrayBuffer | Uint8Array | Blob,
        options?: { contentType?: string; upsert?: boolean },
      ) => Promise<{ error: { message: string } | null }>;
      createSignedUrl: (
        path: string,
        expiresIn: number,
        options?: { download?: string | boolean },
      ) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
    };
  };
};

export const MAIL_ATTACHMENT_BUCKET = "mail-attachments";

/** Stored attachment shape written into `conversation_messages.attachments`. */
export type ArchivedAttachment = {
  name: string;
  contentType: string;
  size: number;
  /** Object path inside the private bucket; absent for older messages. */
  path?: string;
  /** Legacy/provider-hosted link. */
  url?: string;
};

function safeName(name: string): string {
  return (name || "attachment").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
}

function decodeBase64(content: string): Uint8Array {
  const binary = atob(content.replace(/[\r\n\s]/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Keeps a copy of every attachment that carries content and returns the archive
 * records for the message. A failed upload never fails the send — the message is
 * already delivered at that point, so the attachment is archived as metadata
 * only and simply is not downloadable.
 */
export async function storeOutboundAttachments(
  admin: Admin,
  input: { workspaceId: string; attachments: OutboundAttachment[] },
): Promise<ArchivedAttachment[]> {
  const { attachmentBytes } = await import("@/lib/mail-attachments");
  const stored: ArchivedAttachment[] = [];

  for (const file of input.attachments) {
    const record: ArchivedAttachment = {
      name: file.name,
      contentType: file.contentType ?? "application/octet-stream",
      size: attachmentBytes(file),
      ...(file.url ? { url: file.url } : {}),
    };

    if (file.content) {
      const path = `${input.workspaceId}/${crypto.randomUUID()}-${safeName(file.name)}`;
      try {
        const { error } = await admin.storage
          .from(MAIL_ATTACHMENT_BUCKET)
          .upload(path, decodeBase64(file.content), {
            contentType: record.contentType,
            upsert: false,
          });
        if (error) throw new Error(error.message);
        record.path = path;
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
export async function signAttachmentDownload(
  admin: Admin,
  input: { path: string; filename: string },
): Promise<string> {
  const { data, error } = await admin.storage
    .from(MAIL_ATTACHMENT_BUCKET)
    .createSignedUrl(input.path, 300, { download: input.filename });
  if (error || !data?.signedUrl) {
    throw new Error("This attachment could not be prepared for download. Try again.");
  }
  return data.signedUrl;
}
