/** Browser-side upload helper for support attachments (private bucket). */
import { supabase } from "@/integrations/supabase/client";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type UploadedAttachment = { path: string; name: string; size: number };

export async function uploadSupportAttachment(file: File): Promise<UploadedAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("Attachments must be 10 MB or smaller");
  }
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("You need to be signed in to attach a file");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `${userData.user.id}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from("support-attachments").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw new Error(error.message);
  return { path, name: file.name.slice(0, 200), size: file.size };
}
