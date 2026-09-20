import { avatarImageUrl } from "@/lib/files-model";

/**
 * Profile pictures live in the private R2 bucket and are served through the
 * app's own avatar image route, so the URL is stable, cacheable and readable by
 * teammates. Absolute URLs (e.g. Google profile pictures) are used as-is.
 */
export function useAvatarUrl(avatarPath: string | null | undefined) {
  return avatarImageUrl(avatarPath);
}
