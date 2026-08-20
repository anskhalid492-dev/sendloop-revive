import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * Exchanges a private-bucket storage path for a short-lived signed URL.
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
    queryKey: ["storage-image", bucket, value],
    enabled: Boolean(value) && !isAbsolute && !isEphemeral,
    staleTime: 45 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(value, 60 * 60);
      if (error) return null;
      return data?.signedUrl ?? null;
    },
  });

  if (!value || isEphemeral) return null;
  if (isAbsolute) return value;
  return query.data ?? null;
}
