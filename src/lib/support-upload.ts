/** Browser-side upload helper for support attachments (private R2 bucket). */
import { uploadFileToR2 } from "@/lib/file-storage";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type UploadedAttachment = { path: string; name: string; size: number };

export async function uploadSupportAttachment(file: File): Promise<UploadedAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("Attachments must be 10 MB or smaller");
  }
  const uploaded = await uploadFileToR2(file, {
    category: "support",
    maxBytes: MAX_ATTACHMENT_BYTES,
  });
  return { path: uploaded.key, name: file.name.slice(0, 200), size: file.size };
}
