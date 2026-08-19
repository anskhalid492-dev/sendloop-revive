import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * Avatars live in a private bucket where each customer can only read their own
 * folder, so a stored path is exchanged for a short-lived signed URL.
 * Absolute URLs (e.g. Google profile pictures) are used as-is.
 */
export function useAvatarUrl(avatarPath: string | null | undefined) {
  const query = useQuery({
    queryKey: ["avatar-url", avatarPath],
    enabled: Boolean(avatarPath) && !avatarPath!.startsWith("http"),
    staleTime: 45 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("avatars")
        .createSignedUrl(avatarPath!, 60 * 60);
      if (error) return null;
      return data?.signedUrl ?? null;
    },
  });

  if (!avatarPath) return null;
  if (avatarPath.startsWith("http")) return avatarPath;
  return query.data ?? null;
}
