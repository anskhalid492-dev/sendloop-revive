/**
 * Client-safe vocabulary for the R2-backed file service.
 *
 * Every file the product stores — imports, exports, invoices, reports,
 * attachments, avatars, temporary artefacts — is an object in the private R2
 * bucket. The database only ever keeps metadata (see the `files` table).
 */

export const FILE_CATEGORIES = [
  "imports",
  "exports",
  "invoices",
  "reports",
  "campaigns",
  "leads",
  "tmp",
  "avatars",
  "workspace-logos",
  "support",
  "media",
] as const;

export type FileCategory = (typeof FILE_CATEGORIES)[number];

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Temporary artefacts are swept by the R2 lifecycle rule on the tmp/ prefix. */
export const TMP_TTL_HOURS = 24;

export type FileRecord = {
  id: string;
  user_id: string;
  workspace_id: string | null;
  type: FileCategory;
  r2_key: string;
  file_name: string | null;
  size: number;
  mime_type: string;
  status: "pending" | "ready" | "failed";
  created_at: string;
  expires_at: string | null;
};

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Keeps a user-supplied filename safe to embed in an object key. */
export function safeFileName(name: string): string {
  return (name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
}

export function fileExtension(name: string, fallback = "bin"): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return fallback;
  const ext = name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext || fallback;
}

/**
 * Object keys always start with the category and the owning user id so that a
 * presign request can be authorised by comparing the key prefix to the caller.
 */
export function buildR2Key(input: {
  category: FileCategory;
  userId: string;
  extension?: string;
  campaignId?: string | null;
  invoiceId?: string | null;
  fileName?: string | null;
}): string {
  const ext = (input.extension ?? "bin").replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  switch (input.category) {
    case "invoices":
      return `invoices/${input.userId}/${input.invoiceId ?? randomId()}.pdf`;
    case "campaigns":
      return `campaigns/${input.userId}/${input.campaignId ?? "general"}/${randomId()}.${ext}`;
    case "tmp":
      return `tmp/${input.userId}/${randomId()}.tmp`;
    case "media":
      return `media/${input.userId}/${randomId()}-${safeFileName(input.fileName ?? `file.${ext}`)}`;
    case "support":
      return `support/${input.userId}/${randomId()}-${safeFileName(input.fileName ?? `file.${ext}`)}`;
    default:
      return `${input.category}/${input.userId}/${randomId()}.${ext}`;
  }
}

/** The user id segment an object key must carry for the caller to own it. */
export function ownerFromKey(key: string): { category: string; userId: string } | null {
  const parts = key.split("/");
  if (parts.length < 3) return null;
  return { category: parts[0] as string, userId: parts[1] as string };
}

export function isValidR2Key(key: string): boolean {
  if (!key || key.length > 512) return false;
  if (key.includes("..") || key.startsWith("/") || key.includes("//")) return false;
  const owner = ownerFromKey(key);
  return Boolean(owner && (FILE_CATEGORIES as readonly string[]).includes(owner.category));
}

/**
 * Legacy objects that used to live in the old storage buckets keep working
 * because the migration copies them to a deterministic R2 prefix.
 */
export const LEGACY_BUCKET_PREFIX: Record<string, string> = {
  avatars: "avatars",
  "workspace-logos": "workspace-logos",
  "support-attachments": "support",
  "blog-media": "media",
  "review-media": "media/reviews",
};

export function legacyKeyToR2(bucket: string, path: string): string {
  const prefix = LEGACY_BUCKET_PREFIX[bucket] ?? bucket;
  const clean = path.replace(/^\/+/, "");
  return clean.startsWith(`${prefix}/`) ? clean : `${prefix}/${clean}`;
}

export const IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
];

export const DOCUMENT_MIME_TYPES = [
  "text/csv",
  "text/plain",
  "application/csv",
  "application/pdf",
  "application/json",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/octet-stream",
];

export const ALLOWED_MIME_TYPES = [...IMAGE_MIME_TYPES, ...DOCUMENT_MIME_TYPES];

export function isAllowedMimeType(mime: string): boolean {
  return ALLOWED_MIME_TYPES.includes((mime || "").toLowerCase());
}
