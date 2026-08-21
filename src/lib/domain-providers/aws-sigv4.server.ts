/**
 * Minimal AWS SigV4 request signer built on WebCrypto (edge-runtime safe).
 * Used only by the internal Amazon SES adapter.
 */

const enc = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(value)));
}

export type SignedRequest = { url: string; method: string; headers: Record<string, string>; body?: string };

export async function signAwsRequest(input: {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | undefined;
  region: string;
  service: string;
  method: string;
  host: string;
  path: string;
  query?: string;
  body?: string;
}): Promise<SignedRequest> {
  const body = input.body ?? "";
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(body);

  const headers: Record<string, string> = {
    host: input.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
  };
  if (body) headers["content-type"] = "application/json";
  if (input.sessionToken) headers["x-amz-security-token"] = input.sessionToken;

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headers[h]}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");

  const canonicalRequest = [
    input.method,
    input.path,
    input.query ?? "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  let key: ArrayBuffer | Uint8Array = enc.encode(`AWS4${input.secretAccessKey}`);
  for (const part of [dateStamp, input.region, input.service, "aws4_request"]) {
    key = await hmac(key, part);
  }
  const signature = hex(await hmac(key, stringToSign));

  headers["authorization"] =
    `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${input.host}${input.path}${input.query ? `?${input.query}` : ""}`;
  return body ? { url, method: input.method, headers, body } : { url, method: input.method, headers };
}
