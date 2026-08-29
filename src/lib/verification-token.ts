/**
 * Site-verification tokens (Google Search Console, Bing Webmaster).
 *
 * Admins routinely paste the whole snippet Google shows them:
 *   <meta name="google-site-verification" content="TOKEN" />
 * Storing that verbatim renders `content="&lt;meta ...&gt;"`, which the
 * verification crawler rejects. This helper extracts the token and otherwise
 * leaves the value byte-for-byte unchanged.
 */
export function normalizeVerificationToken(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  if (!value.includes("<")) return value;

  // Pull the content attribute out of a pasted meta tag (single or double quotes).
  const match =
    value.match(/content\s*=\s*"([^"]*)"/i) ?? value.match(/content\s*=\s*'([^']*)'/i);
  return match?.[1] ? match[1].trim() : value;
}
