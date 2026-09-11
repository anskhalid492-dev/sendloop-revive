import { useQuery } from "@tanstack/react-query";

import { getFileUrlByKey } from "@/lib/file-storage";
import { legacyKeyToR2 } from "@/lib/files-model";

/**
 * Avatars live in the private R2 bucket where each customer can only read their
 * own folder, so a stored key is exchanged for a short-lived signed URL.
 * Absolute URLs (e.g. Google profile pictures) are used as-is.
 */
export function useAvatarUrl(avatarPath: string | null | undefined) {
  const value = (avatarPath ?? "").trim();

  const query = useQuery({
    queryKey: ["avatar-url", value],
    enabled: Boolean(value) && !value.startsWith("http"),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      try {
        return await getFileUrlByKey(legacyKeyToR2("avatars", value));
      } catch {
        return null;
      }
    },
  });

  if (!value) return null;
  if (value.startsWith("http")) return value;
  return query.data ?? null;
}
