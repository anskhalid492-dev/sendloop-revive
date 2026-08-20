/** Client-safe types and helpers for the blog media library. */

export type MediaItem = {
  id: string;
  storage_path: string;
  public_url: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  alt_text: string;
  caption: string;
  folder: string;
  created_at: string;
};

export const MEDIA_BUCKET = "blog-media";

export function mediaPublicUrl(storagePath: string): string {
  return `/api/public/media/${storagePath}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Storage keys stay predictable: folder/yyyy-mm/slugified-name-random.ext */
export function buildStoragePath(folder: string, fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const ext = (dot > -1 ? fileName.slice(dot + 1) : "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const base = (dot > -1 ? fileName.slice(0, dot) : fileName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "image";
  const stamp = new Date().toISOString().slice(0, 7);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${folder}/${stamp}/${base}-${rand}.${ext}`;
}
