/**
 * Real DNS verification for customer-owned sending domains.
 *
 * Lookups go over DNS-over-HTTPS (Google public resolver), which is the only
 * DNS transport available in the edge worker runtime. Nothing here ever returns
 * "verified" unless the record was actually observed in DNS.
 */

export type DnsRecordKind = "spf" | "dkim" | "dmarc" | "mx" | "tracking";
export type DnsRecordStatus = "pending" | "verified" | "failed";

export type DnsRecordSpec = {
  kind: DnsRecordKind;
  type: "TXT" | "CNAME" | "MX";
  /** Host/name to create at the registrar, relative form plus the full FQDN. */
  host: string;
  fqdn: string;
  value: string;
  ttl: number;
  priority?: number;
  required: boolean;
  purpose: string;
};

/** Sending infrastructure hostnames. Configurable so infra can move safely. */
function infra() {
  const base = process.env["SENDING_DNS_HOST"] || "sendloop.email";
  return {
    base,
    spfInclude: process.env["SENDING_SPF_INCLUDE"] || `_spf.${base}`,
    dkimHost: process.env["SENDING_DKIM_HOST"] || `dkim.${base}`,
    mxHost: process.env["SENDING_MX_HOST"] || `mx.${base}`,
    trackingHost: process.env["SENDING_TRACKING_HOST"] || `track.${base}`,
    dmarcRua: process.env["SENDING_DMARC_RUA"] || `dmarc@${base}`,
  };
}

export function buildDnsRecords(domain: string, dkimSelector: string): DnsRecordSpec[] {
  const d = domain.toLowerCase().replace(/^\.+|\.+$/g, "");
  const cfg = infra();
  return [
    {
      kind: "spf",
      type: "TXT",
      host: "@",
      fqdn: d,
      value: `v=spf1 include:${cfg.spfInclude} ~all`,
      ttl: 3600,
      required: true,
      purpose: "Authorises the sending infrastructure to send as your domain.",
    },
    {
      kind: "dkim",
      type: "CNAME",
      host: `${dkimSelector}._domainkey`,
      fqdn: `${dkimSelector}._domainkey.${d}`,
      value: `${dkimSelector}.${cfg.dkimHost}`,
      ttl: 3600,
      required: true,
      purpose: "Signs every outgoing email so mailbox providers can verify it.",
    },
    {
      kind: "dmarc",
      type: "TXT",
      host: "_dmarc",
      fqdn: `_dmarc.${d}`,
      value: `v=DMARC1; p=none; rua=mailto:${cfg.dmarcRua}; fo=1`,
      ttl: 3600,
      required: true,
      purpose: "Publishes your alignment policy and reporting address.",
    },
    {
      kind: "mx",
      type: "MX",
      host: "@",
      fqdn: d,
      value: cfg.mxHost,
      ttl: 3600,
      priority: 10,
      required: false,
      purpose:
        "Only required when you want replies to this domain routed into the MunchReach inbox. Skip it if your mailbox provider already handles inbound mail.",
    },
    {
      kind: "tracking",
      type: "CNAME",
      host: "track",
      fqdn: `track.${d}`,
      value: cfg.trackingHost,
      ttl: 3600,
      required: false,
      purpose: "Custom tracking domain for open and click links (recommended).",
    },
  ];
}

type DohAnswer = { name: string; type: number; data: string };

const TYPE_CODE = { TXT: 16, CNAME: 5, MX: 15 } as const;

/**
 * Transient lookup problem (resolver unreachable, SERVFAIL, timeout). These must
 * never be reported as "failed" — a record that is actually published would
 * otherwise flap between verified and unverified on every check.
 */
export class TransientDnsError extends Error {}

const RESOLVERS = [
  "https://dns.google/resolve",
  "https://cloudflare-dns.com/dns-query",
] as const;

type ResolverOutcome =
  | { ok: true; answers: DohAnswer[] }
  | { ok: false; transient: true }
  | { ok: false; transient: false }; // authoritative NXDOMAIN / empty answer

async function queryResolver(
  endpoint: string,
  name: string,
  type: keyof typeof TYPE_CODE,
): Promise<ResolverOutcome> {
  try {
    const res = await fetch(`${endpoint}?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, transient: true };
    const json = (await res.json()) as { Answer?: DohAnswer[]; Status?: number };
    const status = json.Status ?? 0;
    // 0 = NOERROR, 3 = NXDOMAIN (authoritative "not there"). Anything else is transient.
    if (status !== 0 && status !== 3) return { ok: false, transient: true };
    const answers = (json.Answer ?? []).filter((a) => a.type === TYPE_CODE[type]);
    if (answers.length > 0) return { ok: true, answers };
    return { ok: false, transient: false };
  } catch {
    return { ok: false, transient: true };
  }
}

/**
 * Queries several public resolvers and returns the first positive answer.
 * A record counts as present if ANY resolver sees it (propagation is uneven);
 * it counts as absent only when at least one resolver answered authoritatively
 * with nothing. If every resolver failed, a TransientDnsError is thrown.
 */
async function resolve(name: string, type: keyof typeof TYPE_CODE): Promise<DohAnswer[]> {
  let sawAuthoritativeEmpty = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const outcomes = await Promise.all(RESOLVERS.map((r) => queryResolver(r, name, type)));
    const hit = outcomes.find((o): o is { ok: true; answers: DohAnswer[] } => o.ok);
    if (hit) return hit.answers;
    if (outcomes.some((o) => !o.ok && !o.transient)) {
      sawAuthoritativeEmpty = true;
      break;
    }
  }
  if (sawAuthoritativeEmpty) return [];
  throw new TransientDnsError(`Could not reach a DNS resolver for ${name}. Will retry.`);
}

function clean(value: string): string {
  return value.replace(/^"|"$/g, "").replace(/"\s+"/g, "").trim().toLowerCase();
}

export type DnsCheckResult = {
  kind: DnsRecordKind;
  status: DnsRecordStatus;
  observed: string | null;
  message: string;
};

async function checkRecord(spec: DnsRecordSpec): Promise<DnsCheckResult> {
  try {
    if (spec.type === "TXT") {
      const answers = await resolve(spec.fqdn, "TXT");
      const values = answers.map((a) => clean(a.data));
      if (spec.kind === "spf") {
        const spf = values.find((v) => v.startsWith("v=spf1"));
        if (!spf)
          return { kind: spec.kind, status: "failed", observed: null, message: "No SPF record found." };
        const include = clean(spec.value).match(/include:([^\s]+)/)?.[1] ?? "";
        return spf.includes(`include:${include}`)
          ? { kind: spec.kind, status: "verified", observed: spf, message: "SPF include found." }
          : {
              kind: spec.kind,
              status: "failed",
              observed: spf,
              message: `SPF record exists but does not include ${include}.`,
            };
      }
      const dmarc = values.find((v) => v.startsWith("v=dmarc1"));
      if (!dmarc)
        return { kind: spec.kind, status: "failed", observed: null, message: "No DMARC record found." };
      return { kind: spec.kind, status: "verified", observed: dmarc, message: "DMARC policy found." };
    }

    if (spec.type === "CNAME") {
      const answers = await resolve(spec.fqdn, "CNAME");
      const target = answers
        .map((a) => clean(a.data).replace(/\.$/, ""))
        .find((v) => v === clean(spec.value));
      return target
        ? { kind: spec.kind, status: "verified", observed: target, message: "CNAME target matches." }
        : {
            kind: spec.kind,
            status: "failed",
            observed: answers[0] ? clean(answers[0].data) : null,
            message: answers.length
              ? "CNAME exists but points somewhere else."
              : "No CNAME record found.",
          };
    }

    const answers = await resolve(spec.fqdn, "MX");
    const expected = clean(spec.value).replace(/\.$/, "");
    const match = answers
      .map((a) => clean(a.data).replace(/\.$/, "").split(/\s+/).pop() ?? "")
      .find((host) => host === expected);
    return match
      ? { kind: spec.kind, status: "verified", observed: match, message: "MX host matches." }
      : {
          kind: spec.kind,
          status: "failed",
          observed: answers[0] ? clean(answers[0].data) : null,
          message: answers.length ? "MX records exist but none match." : "No MX record found.",
        };
  } catch (error) {
    return {
      kind: spec.kind,
      status: error instanceof TransientDnsError ? "pending" : "failed",
      observed: null,
      message: (error as Error).message,
    };
  }
}

export async function verifyDomainRecords(
  domain: string,
  dkimSelector: string,
): Promise<{ records: DnsRecordSpec[]; results: DnsCheckResult[] }> {
  const records = buildDnsRecords(domain, dkimSelector);
  const results = await Promise.all(records.map(checkRecord));
  return { records, results };
}

export function makeDkimSelector(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return `sl${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/* ------------------------------------------------------------------ */
/* Generic checks for provider-issued DNS records                      */
/* ------------------------------------------------------------------ */

import type { ProviderDnsRecord } from "@/lib/domain-providers/types";

export type ProviderRecordCheck = {
  id: string;
  status: DnsRecordStatus;
  observed: string | null;
  message: string;
};

/** Verifies an arbitrary provider-issued record against live DNS. */
export async function checkProviderRecord(spec: ProviderDnsRecord): Promise<ProviderRecordCheck> {
  const expected = clean(spec.value).replace(/\.$/, "");
  try {
    if (spec.type === "TXT") {
      const answers = await resolve(spec.fqdn, "TXT");
      const values = answers.map((a) => clean(a.data));
      if (values.length === 0)
        return { id: spec.id, status: "failed", observed: null, message: "No TXT record found." };
      const include = expected.match(/include:([^\s]+)/)?.[1];
      const hit = values.find((v) =>
        include ? v.startsWith("v=spf1") && v.includes(`include:${include}`) : v === expected || v.includes(expected),
      );
      return hit
        ? { id: spec.id, status: "verified", observed: hit, message: "Record found." }
        : {
            id: spec.id,
            status: "failed",
            observed: values[0] ?? null,
            message: "A TXT record exists but the value does not match.",
          };
    }

    if (spec.type === "CNAME") {
      const answers = await resolve(spec.fqdn, "CNAME");
      const target = answers.map((a) => clean(a.data).replace(/\.$/, "")).find((v) => v === expected);
      return target
        ? { id: spec.id, status: "verified", observed: target, message: "CNAME target matches." }
        : {
            id: spec.id,
            status: "failed",
            observed: answers[0] ? clean(answers[0].data) : null,
            message: answers.length ? "CNAME exists but points somewhere else." : "No CNAME record found.",
          };
    }

    const answers = await resolve(spec.fqdn, "MX");
    const host = expected.split(/\s+/).pop() ?? expected;
    const match = answers
      .map((a) => clean(a.data).replace(/\.$/, "").split(/\s+/).pop() ?? "")
      .find((h) => h === host);
    return match
      ? { id: spec.id, status: "verified", observed: match, message: "MX host matches." }
      : {
          id: spec.id,
          status: "failed",
          observed: answers[0] ? clean(answers[0].data) : null,
          message: answers.length ? "MX records exist but none match." : "No MX record found.",
        };
  } catch (error) {
    return {
      id: spec.id,
      status: error instanceof TransientDnsError ? "pending" : "failed",
      observed: null,
      message: (error as Error).message,
    };
  }
}

export async function checkProviderRecords(
  specs: ProviderDnsRecord[],
): Promise<ProviderRecordCheck[]> {
  return Promise.all(specs.map(checkProviderRecord));
}

/** Recommended DMARC policy record. Advisory only — never blocks verification. */
export function recommendedDmarcRecord(domain: string): ProviderDnsRecord {
  const d = domain.toLowerCase();
  const rua = process.env["SENDING_DMARC_RUA"] || `dmarc@${d}`;
  return {
    id: `dmarc:_dmarc.${d}:TXT`,
    kind: "dmarc",
    type: "TXT",
    host: "_dmarc",
    fqdn: `_dmarc.${d}`,
    value: `v=DMARC1; p=none; rua=mailto:${rua}; fo=1`,
    ttl: 3600,
    required: false,
    purpose: "Publishes your alignment policy and reporting address (recommended).",
  };
}
