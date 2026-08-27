/**
 * Amazon SNS HTTPS delivery security for SES inbound.
 *
 * SES receipt rules publish to an SNS topic, and SNS POSTs the notification to
 * the MunchReach inbound endpoint. SNS signs every delivery with an RSA key
 * whose certificate is published on an amazonaws.com host, so this module:
 *
 *   1. refuses any certificate URL that is not an AWS SNS HTTPS host,
 *   2. rebuilds the canonical string exactly as SNS specifies,
 *   3. verifies the RSA signature (SignatureVersion 1 = SHA-1, 2 = SHA-256),
 *   4. confirms topic subscriptions only after the signature is valid.
 *
 * Server-only. Nothing here trusts a payload field before verification.
 */
import { parseSnsEnvelope, type SnsEnvelope } from "./ses-inbound";
import type { WebhookVerification } from "./types";

const CERT_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/i;
const certCache = new Map<string, CryptoKey>();

function verdict(
  valid: boolean,
  status: string,
  reason: string,
  method = "sns-signature",
): WebhookVerification {
  return { valid, detail: reason, verification: { status, method, reason } };
}

/** SNS canonical string: sorted, fixed key set, `key\nvalue\n` per entry. */
export function snsCanonicalString(envelope: SnsEnvelope): string | null {
  const fields =
    envelope.type === "Notification"
      ? ([
          ["Message", envelope.message],
          ["MessageId", envelope.messageId],
          ...(envelope.subject === null ? [] : [["Subject", envelope.subject] as const]),
          ["Timestamp", envelope.timestamp],
          ["TopicArn", envelope.topicArn],
          ["Type", envelope.type],
        ] as const)
      : ([
          ["Message", envelope.message],
          ["MessageId", envelope.messageId],
          ["SubscribeURL", envelope.subscribeUrl],
          ["Timestamp", envelope.timestamp],
          ["Token", envelope.token],
          ["TopicArn", envelope.topicArn],
          ["Type", envelope.type],
        ] as const);

  let out = "";
  for (const [key, value] of fields) {
    if (value === null || value === undefined) return null;
    out += `${key}\n${value}\n`;
  }
  return out;
}

/**
 * Extracts the SubjectPublicKeyInfo from an X.509 certificate.
 * WebCrypto cannot import certificates directly, so the RSA SPKI block is
 * located by its algorithm identifier and re-wrapped as a DER SEQUENCE.
 */
export function spkiFromCertificate(der: Uint8Array): Uint8Array | null {
  const algId = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  let start = -1;
  outer: for (let i = 0; i + algId.length < der.length; i += 1) {
    for (let j = 0; j < algId.length; j += 1) if (der[i + j] !== algId[j]) continue outer;
    start = i;
    break;
  }
  if (start === -1) return null;

  // BIT STRING with the public key follows the algorithm identifier.
  let p = start + algId.length;
  if (der[p] !== 0x03) return null;
  p += 1;
  const first = der[p]!;
  let length = 0;
  let headerLen = 1;
  if (first < 0x80) {
    length = first;
  } else {
    const count = first & 0x7f;
    if (count < 1 || count > 4) return null;
    for (let i = 1; i <= count; i += 1) length = (length << 8) | der[p + i]!;
    headerLen = 1 + count;
  }
  const contentEnd = p + headerLen + length;
  if (contentEnd > der.length) return null;

  const content = der.slice(start, contentEnd);
  const lengthBytes = encodeDerLength(content.length);
  const out = new Uint8Array(1 + lengthBytes.length + content.length);
  out[0] = 0x30;
  out.set(lengthBytes, 1);
  out.set(content, 1 + lengthBytes.length);
  return out;
}

function encodeDerLength(length: number): Uint8Array {
  if (length < 0x80) return Uint8Array.from([length]);
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }
  return Uint8Array.from([0x80 | bytes.length, ...bytes]);
}

function pemToDer(pem: string): Uint8Array | null {
  const body = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, "");
  if (!body) return null;
  try {
    const binary = atob(body);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function base64ToBytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value.replace(/\s/g, ""));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function loadCertificateKey(url: string, hash: string): Promise<CryptoKey | null> {
  const cacheKey = `${url}|${hash}`;
  const cached = certCache.get(cacheKey);
  if (cached) return cached;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const der = pemToDer(await res.text());
  if (!der) return null;
  const spki = spkiFromCertificate(der);
  if (!spki) return null;

  const key = await crypto.subtle.importKey(
    "spki",
    spki as unknown as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash },
    false,
    ["verify"],
  );
  certCache.set(cacheKey, key);
  return key;
}

/** Clears cached SNS signing keys (tests + admin tooling). */
export function resetSnsCertificateCache(): void {
  certCache.clear();
}

/** Verifies an SNS delivery. The parsed body is only used to rebuild the canonical string. */
export async function verifySnsDelivery(rawBody: string): Promise<WebhookVerification> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return verdict(false, "invalid", "Delivery body is not valid JSON.");
  }

  const envelope = parseSnsEnvelope(parsed);
  if (!envelope) return verdict(false, "invalid", "Delivery is not a recognised notification.");
  if (!envelope.signature || !envelope.signingCertUrl) {
    return verdict(false, "missing", "Delivery is not signed.");
  }

  let certUrl: URL;
  try {
    certUrl = new URL(envelope.signingCertUrl);
  } catch {
    return verdict(false, "invalid", "Signing certificate URL is malformed.");
  }
  if (certUrl.protocol !== "https:" || !CERT_HOST.test(certUrl.hostname)) {
    return verdict(false, "invalid", "Signing certificate is not hosted on a trusted host.");
  }

  const canonical = snsCanonicalString(envelope);
  if (!canonical) return verdict(false, "invalid", "Delivery is missing signed fields.");

  const hash = envelope.signatureVersion === "2" ? "SHA-256" : "SHA-1";
  const signature = base64ToBytes(envelope.signature);
  if (!signature) return verdict(false, "invalid", "Signature is not valid base64.");

  try {
    const key = await loadCertificateKey(certUrl.toString(), hash);
    if (!key) return verdict(false, "failed", "Signing certificate could not be loaded.");
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      signature as unknown as ArrayBuffer,
      new TextEncoder().encode(canonical) as unknown as ArrayBuffer,
    );
    return ok
      ? verdict(true, "valid", "Signature verified against the published certificate.")
      : verdict(false, "invalid", "Signature does not match the delivery body.");
  } catch (error) {
    return verdict(false, "failed", `Signature check failed: ${(error as Error).message}`);
  }
}

/**
 * Completes an SNS topic subscription. Only ever called after the delivery's
 * signature has been verified, so the confirmation URL can be trusted.
 */
export async function confirmSnsSubscription(subscribeUrl: string): Promise<boolean> {
  try {
    const url = new URL(subscribeUrl);
    if (url.protocol !== "https:" || !/\.amazonaws\.com(\.cn)?$/i.test(url.hostname)) return false;
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
    return res.ok;
  } catch {
    return false;
  }
}
