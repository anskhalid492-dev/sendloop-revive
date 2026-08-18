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
        "Only required when you want replies to this domain routed into the Sendloop inbox. Skip it if your mailbox provider already handles inbound mail.",
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

async function resolve(name: string, type: keyof typeof TYPE_CODE): Promise<DohAnswer[]> {
  const url = `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`;
  const res = await fetch(url, {
    headers: { Accept: "application/dns-json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`DNS lookup failed for ${name} (${res.status})`);
  const json = (await res.json()) as { Answer?: DohAnswer[]; Status?: number };
  return json.Answer ?? [];
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
      status: "failed",
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
