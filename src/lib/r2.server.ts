/**
 * Cloudflare R2 access through the S3-compatible API.
 *
 * Signing is implemented directly with Web Crypto (AWS SigV4) instead of the
 * AWS SDK: the SDK is Node-oriented and heavy for the edge worker runtime,
 * while presigning only needs HMAC-SHA256.
 *
 * Nothing here streams user files through the app by default — the browser
 * talks to R2 with the presigned URLs produced below. The direct object
 * helpers exist only for server-side jobs (one-time migration, media proxy).
 */

const REGION = "auto";
const SERVICE = "s3";
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

export type R2Config = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
};

function readEnv(name: string): string {
  const value = typeof process !== "undefined" ? process.env[name] : undefined;
  return (value ?? "").trim();
}

export function r2Configured(): boolean {
  return Boolean(
    readEnv("R2_ACCOUNT_ID") && readEnv("R2_ACCESS_KEY_ID") && readEnv("R2_SECRET_ACCESS_KEY"),
  );
}

export function r2Config(): R2Config {
  const accountId = readEnv("R2_ACCOUNT_ID");
  const accessKeyId = readEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = readEnv("R2_SECRET_ACCESS_KEY");
  const bucket = readEnv("R2_BUCKET_NAME") || "munchreach-files";
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("File storage is not configured");
  }
  return {
    accountId,
    bucket,
    accessKeyId,
    secretAccessKey,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

const encoder = new TextEncoder();

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  const bytes =
    typeof data === "string" ? encoder.encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
  return hex(await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer));
}

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
}

async function signingKey(secret: string, date: string): Promise<ArrayBuffer> {
  let key: ArrayBuffer | Uint8Array = encoder.encode(`AWS4${secret}`);
  for (const part of [date, REGION, SERVICE, "aws4_request"]) {
    key = await hmac(key, part);
  }
  return key as ArrayBuffer;
}

/** Percent-encodes a key for the canonical URI while keeping path separators. */
export function encodeObjectKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

function amzDates(now = new Date()): { amzDate: string; shortDate: string } {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, shortDate: amzDate.slice(0, 8) };
}

function canonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k] as string)}`)
    .join("&");
}

/**
 * Query-string presigned URL. The browser uses these directly, so the app
 * server never sees the file bytes.
 */
export async function presignR2Url(options: {
  key: string;
  method: "PUT" | "GET" | "DELETE";
  expiresInSeconds?: number;
  contentType?: string | null;
}): Promise<string> {
  const config = r2Config();
  const expires = Math.min(Math.max(options.expiresInSeconds ?? 300, 30), 3600);
  const { amzDate, shortDate } = amzDates();
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${config.bucket}/${encodeObjectKey(options.key)}`;

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${config.accessKeyId}/${shortDate}/${REGION}/${SERVICE}/aws4_request`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
  };

  const canonicalRequest = [
    options.method,
    canonicalUri,
    canonicalQuery(query),
    `host:${host}\n`,
    "host",
    UNSIGNED_PAYLOAD,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    `${shortDate}/${REGION}/${SERVICE}/aws4_request`,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = hex(await hmac(await signingKey(config.secretAccessKey, shortDate), stringToSign));
  return `https://${host}${canonicalUri}?${canonicalQuery(query)}&X-Amz-Signature=${signature}`;
}

/** Header-signed request for server-side object operations. */
async function signedFetch(options: {
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  path: string;
  query?: Record<string, string>;
  body?: Uint8Array | ArrayBuffer | null;
  contentType?: string | null;
}): Promise<Response> {
  const config = r2Config();
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const { amzDate, shortDate } = amzDates();
  const body = options.body ? new Uint8Array(options.body as ArrayBuffer) : undefined;
  const payloadHash = await sha256Hex(body ?? "");

  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (options.contentType) headers["content-type"] = options.contentType;

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((n) => `${n}:${headers[n]}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");
  const query = options.query ?? {};

  const canonicalRequest = [
    options.method,
    options.path,
    canonicalQuery(query),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    `${shortDate}/${REGION}/${SERVICE}/aws4_request`,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = hex(await hmac(await signingKey(config.secretAccessKey, shortDate), stringToSign));
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${shortDate}/${REGION}/${SERVICE}/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const search = canonicalQuery(query);
  const url = `https://${host}${options.path}${search ? `?${search}` : ""}`;
  const requestHeaders: Record<string, string> = { ...headers, authorization };
  delete requestHeaders["host"];

  return fetch(url, {
    method: options.method,
    headers: requestHeaders,
    ...(body ? { body: body as unknown as BodyInit } : {}),
  });
}

export async function putR2Object(
  key: string,
  body: Uint8Array | ArrayBuffer,
  contentType = "application/octet-stream",
): Promise<void> {
  const config = r2Config();
  const response = await signedFetch({
    method: "PUT",
    path: `/${config.bucket}/${encodeObjectKey(key)}`,
    body,
    contentType,
  });
  if (!response.ok) {
    throw new Error(`R2 upload failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
  }
}

export async function getR2Object(key: string): Promise<Response> {
  const config = r2Config();
  return signedFetch({ method: "GET", path: `/${config.bucket}/${encodeObjectKey(key)}` });
}

export async function headR2Object(key: string): Promise<{ exists: boolean; size: number }> {
  const config = r2Config();
  const response = await signedFetch({ method: "HEAD", path: `/${config.bucket}/${encodeObjectKey(key)}` });
  if (!response.ok) return { exists: false, size: 0 };
  return { exists: true, size: Number(response.headers.get("content-length") ?? 0) };
}

export async function deleteR2Object(key: string): Promise<void> {
  const config = r2Config();
  const response = await signedFetch({
    method: "DELETE",
    path: `/${config.bucket}/${encodeObjectKey(key)}`,
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 delete failed (${response.status})`);
  }
}
