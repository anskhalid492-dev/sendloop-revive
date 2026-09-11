/**
 * Browser-side helpers for the R2 file service.
 *
 * Uploads go straight from the browser to Cloudflare R2 with a short-lived
 * presigned URL — the bytes never pass through the app or the backend.
 */
import {
  confirmFileUpload,
  requestFileDownload,
  requestFileUpload,
  requestSharedFileDownload,
} from "@/lib/files.functions";
import { MAX_UPLOAD_BYTES, type FileCategory } from "@/lib/files-model";

export type UploadedFile = {
  fileId: string;
  key: string;
  name: string;
  size: number;
  mimeType: string;
};

export async function uploadFileToR2(
  file: File,
  options: {
    category: FileCategory;
    workspaceId?: string | null;
    campaignId?: string | null;
    invoiceId?: string | null;
    maxBytes?: number;
  },
): Promise<UploadedFile> {
  const maxBytes = Math.min(options.maxBytes ?? MAX_UPLOAD_BYTES, MAX_UPLOAD_BYTES);
  if (file.size > maxBytes) {
    throw new Error(`Files must be ${Math.round(maxBytes / (1024 * 1024))} MB or smaller`);
  }

  const mimeType = file.type || "application/octet-stream";
  const prepared = await requestFileUpload({
    data: {
      category: options.category,
      fileName: file.name,
      mimeType,
      size: file.size,
      workspaceId: options.workspaceId ?? null,
      campaignId: options.campaignId ?? null,
      invoiceId: options.invoiceId ?? null,
    },
  });

  const response = await fetch(prepared.uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": mimeType },
  });

  if (!response.ok) {
    await confirmFileUpload({ data: { fileId: prepared.fileId, status: "failed" } }).catch(() => undefined);
    throw new Error("Upload failed — please try again");
  }

  await confirmFileUpload({ data: { fileId: prepared.fileId, size: file.size, status: "ready" } });

  return {
    fileId: prepared.fileId,
    key: prepared.key,
    name: file.name,
    size: file.size,
    mimeType,
  };
}

/** Short-lived link for an object the signed-in user owns. */
export async function getFileUrlById(fileId: string, expiresIn = 300): Promise<string | null> {
  const result = await requestFileDownload({ data: { fileId, expiresIn } });
  return result.url ?? null;
}

/** Short-lived link for an object key (own files or shared workspace assets). */
export async function getFileUrlByKey(key: string, expiresIn = 900): Promise<string | null> {
  const result = await requestSharedFileDownload({ data: { key, expiresIn } });
  return result.url ?? null;
}

/** Triggers a browser download for a stored object. */
export async function downloadStoredFile(key: string, fileName?: string): Promise<void> {
  const url = await getFileUrlByKey(key);
  if (!url) throw new Error("Could not prepare the download link");
  const anchor = document.createElement("a");
  anchor.href = url;
  if (fileName) anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Saves a generated CSV/TXT export to R2 and hands the browser a short-lived
 * download link. Falls back to a plain in-browser download if the file store
 * is unreachable, so exporting never fails outright.
 */
export async function saveAndDownloadExport(options: {
  content: string;
  fileName: string;
  mimeType?: string;
  category?: FileCategory;
  campaignId?: string | null;
  workspaceId?: string | null;
}): Promise<void> {
  const mimeType = options.mimeType ?? "text/csv;charset=utf-8";
  try {
    const { saveGeneratedFile } = await import("@/lib/files.functions");
    const saved = await saveGeneratedFile({
      data: {
        category: options.category ?? "exports",
        fileName: options.fileName,
        mimeType: mimeType.split(";")[0] as string,
        content: options.content,
        campaignId: options.campaignId ?? null,
        workspaceId: options.workspaceId ?? null,
      },
    });
    const anchor = document.createElement("a");
    anchor.href = saved.url;
    anchor.download = options.fileName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } catch {
    const url = URL.createObjectURL(new Blob([options.content], { type: mimeType }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = options.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
