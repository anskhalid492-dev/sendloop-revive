/**
 * SSRF guard for customer-supplied destinations (webhooks, notification URLs).
 *
 * Every outbound request to a URL a customer controls must go through
 * `assertPublicUrl` (validation only) or `safeFetch` (validation + request).
 *
 * Two layers:
 *  1. Syntactic — scheme allow-list, literal IP ranges, internal-only name
 *     suffixes. Cheap, runs on save so bad values never persist.
 *  2. Resolved — the hostname is resolved over DNS-over-HTTPS at request time
 *     and every A/AAAA answer is checked against the same block list. This is
 *     what stops DNS rebinding: a public-looking name that answers with
 *     10.x/169.254.x is refused even though the string looks fine.
 *
 * Known limit: the Workers runtime does not allow connecting to a pinned IP
 * with a chosen SNI, so the resolve-then-connect gap cannot be fully closed.
 * Re-resolving per request and re-validating every redirect hop removes the
 * practical attack.
 */

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

const BLOCKED_HOST_SUFFIXES = [".internal", ".local", ".localdomain", ".localhost"];

function parseIpv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    nums.push(n);
  }
  return nums;
}

/** True when an IPv4 address is anything other than a routable public address. */
function isBlockedIpv4(octets: number[]): boolean {
  const [a, b] = octets as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8 (includes 0.0.0.0)
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // 192.0.0.0/24, 192.0.2.0/24 test nets
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51) return true; // documentation
  if (a === 203 && b === 0) return true; // documentation
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function expandIpv6(value: string): number[] | null {
  let host = value.trim().toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  host = host.split("%")[0] ?? host; // strip zone id
  if (!host.includes(":")) return null;

  // Embedded IPv4 tail (::ffff:10.0.0.1)
  let tail: number[] = [];
  const lastColon = host.lastIndexOf(":");
  const maybeV4 = host.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    const v4 = parseIpv4(maybeV4);
    if (!v4) return null;
    tail = [((v4[0] as number) << 8) | (v4[1] as number), ((v4[2] as number) << 8) | (v4[3] as number)];
    host = host.slice(0, lastColon + 1);
    if (host.endsWith(":") && !host.endsWith("::")) host = host.slice(0, -1);
  }

  const halves = host.split("::");
  if (halves.length > 2) return null;
  const toGroups = (part: string) =>
    part
      .split(":")
      .filter((p) => p.length > 0)
      .map((p) => (/^[0-9a-f]{1,4}$/.test(p) ? parseInt(p, 16) : NaN));

  const head = toGroups(halves[0] ?? "");
  const rest = halves.length === 2 ? toGroups(halves[1] ?? "") : [];
  const groups = [...head, ...rest, ...tail];
  if (groups.some((g) => Number.isNaN(g))) return null;

  if (halves.length === 2) {
    const fill = 8 - (head.length + rest.length + tail.length);
    if (fill < 0) return null;
    return [...head, ...new Array<number>(fill).fill(0), ...rest, ...tail];
  }
  return groups.length === 8 ? groups : null;
}

function isBlockedIpv6(groups: number[]): boolean {
  const [g0, g1] = groups as number[];
  const isZero = groups.every((g) => g === 0);
  if (isZero) return true; // ::
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1
  if (((g0 as number) & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if (((g0 as number) & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g0 as number) === 0xff00 || ((g0 as number) & 0xff00) === 0xff00) return true; // multicast
  // IPv4-mapped / IPv4-translated: ::ffff:a.b.c.d
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const v4 = [
      ((groups[6] as number) >> 8) & 0xff,
      (groups[6] as number) & 0xff,
      ((groups[7] as number) >> 8) & 0xff,
      (groups[7] as number) & 0xff,
    ];
    return isBlockedIpv4(v4);
  }
  // 2002::/16 6to4 and 2001:0::/32 Teredo can wrap private v4 space.
  if ((g0 as number) === 0x2002 || ((g0 as number) === 0x2001 && (g1 as number) === 0)) return true;
  return false;
}

/** Checks a bare IP literal (v4 or v6). Returns null when the value is not an IP. */
export function ipIsBlocked(value: string): boolean | null {
  const v4 = parseIpv4(value);
  if (v4) return isBlockedIpv4(v4);
  const v6 = expandIpv6(value);
  if (v6) return isBlockedIpv6(v6);
  return null;
}

export type UrlCheckOptions = {
  /** Allow plain http as well as https. Webhooks stay https-only. */
  allowHttp?: boolean;
};

/**
 * Scheme + literal-host validation. Synchronous, safe to use in zod schemas
 * and form validation. Does not resolve DNS — pair with `safeFetch` for that.
 */
export function checkUrlSyntax(raw: string, options: UrlCheckOptions = {}): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "That is not a valid URL." };
  }
  const allowed = options.allowHttp ? ["http:", "https:"] : ["https:"];
  if (!allowed.includes(url.protocol)) {
    return {
      ok: false,
      reason: options.allowHttp
        ? "Only http and https URLs are allowed."
        : "Only https URLs are allowed.",
    };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "URLs with embedded credentials are not allowed." };
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, reason: "The URL is missing a host." };
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: "The URL must point at a public host, not an internal one." };
  }
  const literal = ipIsBlocked(host.startsWith("[") ? host.slice(1, -1) : host);
  if (literal === true) {
    return { ok: false, reason: "The URL must point at a public address, not a private or internal one." };
  }
  return { ok: true, url };
}

const DOH_RESOLVERS = ["https://dns.google/resolve", "https://cloudflare-dns.com/dns-query"] as const;

async function resolveAddresses(host: string): Promise<string[]> {
  const queries: Promise<string[]>[] = [];
  for (const endpoint of DOH_RESOLVERS) {
    for (const type of ["A", "AAAA"] as const) {
      queries.push(
        (async () => {
          try {
            const res = await fetch(`${endpoint}?name=${encodeURIComponent(host)}&type=${type}`, {
              headers: { Accept: "application/dns-json" },
              signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) return [];
            const json = (await res.json()) as { Answer?: { type: number; data: string }[] };
            return (json.Answer ?? [])
              .filter((a) => a.type === (type === "A" ? 1 : 28))
              .map((a) => a.data.trim());
          } catch {
            return [];
          }
        })(),
      );
    }
  }
  const results = await Promise.all(queries);
  return [...new Set(results.flat())];
}

/**
 * Full check: syntax, then resolved addresses at request time (DNS rebinding).
 * Throws BlockedUrlError when the destination is not safe to reach.
 */
export async function assertPublicUrl(raw: string, options: UrlCheckOptions = {}): Promise<URL> {
  const syntax = checkUrlSyntax(raw, options);
  if (!syntax.ok) throw new BlockedUrlError(syntax.reason);
  const url = syntax.url;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");

  // Literal IPs were already checked and need no resolution.
  if (ipIsBlocked(host.startsWith("[") ? host.slice(1, -1) : host) !== null) return url;

  const addresses = await resolveAddresses(host);
  if (addresses.length === 0) {
    throw new BlockedUrlError("The webhook host could not be resolved to a public address.");
  }
  for (const address of addresses) {
    if (ipIsBlocked(address) === true) {
      throw new BlockedUrlError("The webhook host resolves to a private or internal address.");
    }
  }
  return url;
}

const MAX_REDIRECTS = 3;

/**
 * fetch() for customer-supplied destinations. Validates before the request and
 * re-validates every redirect hop, so a 302 to 169.254.169.254 is refused.
 */
export async function safeFetch(
  raw: string,
  init: RequestInit = {},
  options: UrlCheckOptions = {},
): Promise<Response> {
  let target = (await assertPublicUrl(raw, options)).toString();
  let body = init.body;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(target, { ...init, body: body ?? null, redirect: "manual" });
    if (response.status < 300 || response.status > 399) return response;

    const location = response.headers.get("location");
    if (!location) return response;
    const next = new URL(location, target).toString();
    target = (await assertPublicUrl(next, options)).toString();
    if (response.status === 303) {
      init = { ...init, method: "GET" };
      body = undefined;
    }
  }
  throw new BlockedUrlError("The webhook destination redirected too many times.");
}
