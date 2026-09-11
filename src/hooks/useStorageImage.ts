import { useQuery } from "@tanstack/react-query";

import { getFileUrlByKey } from "@/lib/file-storage";
import { legacyKeyToR2 } from "@/lib/files-model";

/**
 * Exchanges a stored object key for a short-lived Cloudflare R2 link.
 *
 * The `bucket` argument is kept for call-site clarity and maps legacy keys
 * (written before files moved to R2) onto their R2 prefix.
 *
 * Absolute URLs (already-public assets, Google avatars, the media proxy) are
 * returned untouched. Session-only blob/data URLs are rejected so a preview can
 * never be mistaken for a persisted asset.
 */
export function useStorageImage(bucket: string, path: string | null | undefined) {
  const value = (path ?? "").trim();
  const isAbsolute = value.startsWith("http") || value.startsWith("/");
  const isEphemeral = value.startsWith("blob:") || value.startsWith("data:");

  const query = useQuery({
    queryKey: ["r2-image", bucket, value],
    enabled: Boolean(value) && !isAbsolute && !isEphemeral,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      try {
        return await getFileUrlByKey(legacyKeyToR2(bucket, value));
      } catch {
        return null;
      }
    },
  });

  if (!value || isEphemeral) return null;
  if (isAbsolute) return value;
  return query.data ?? null;
}
