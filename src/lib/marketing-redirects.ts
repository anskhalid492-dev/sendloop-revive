/**
 * Shared server-side 301 redirect helper for short marketing URLs.
 */
export function permanentRedirect(destination: string) {
  return new Response(null, {
    status: 301,
    headers: {
      location: destination,
      "cache-control": "public, max-age=86400",
    },
  });
}
