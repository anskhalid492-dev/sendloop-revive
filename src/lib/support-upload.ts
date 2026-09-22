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

/**
 * Bug-report screenshot upload. Same private bucket and presign flow as support
 * attachments, with the tighter 5 MB image rules of the bug form.
 */
export async function uploadBugScreenshot(file: File): Promise<UploadedAttachment> {
  const { bugScreenshotError, MAX_BUG_SCREENSHOT_BYTES } = await import("@/lib/bug-report-model");
  const problem = bugScreenshotError(file);
  if (problem) throw new Error(problem);
  const uploaded = await uploadFileToR2(file, {
    category: "support",
    maxBytes: MAX_BUG_SCREENSHOT_BYTES,
  });
  return { path: uploaded.key, name: file.name.slice(0, 200), size: file.size };
}
