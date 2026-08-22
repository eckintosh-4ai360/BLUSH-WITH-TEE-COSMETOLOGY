// Storage helpers backed by Cloudinary.
//
// Every asset is uploaded as an `authenticated` Cloudinary resource, so the
// raw delivery URL is useless without a signature. Nothing hands a Cloudinary
// URL straight to the browser: `storageGet` returns an app-relative
// `/api/manus-storage/{key}` path, and that route handler (see ./proxyRoute)
// applies the app's own access rules before redirecting to a signed URL. That
// keeps admissions documents — transcripts, government IDs — behind the same
// authorization as the rest of the API.
//
// A storage key is `{resourceType}/{publicId}`, e.g.
// `image/blush-with-tee/media/product/1712-serum`. The resource type has to
// travel with the key because Cloudinary needs it to build a delivery URL and
// it is not recoverable from the public id alone.

import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { ENV } from "@blush/env";

export type StorageResourceType = "image" | "video" | "raw";

const RESOURCE_TYPES: readonly StorageResourceType[] = ["image", "video", "raw"];

let configured = false;

function getCloudinary() {
  const { cloudinaryCloudName, cloudinaryApiKey, cloudinaryApiSecret } = ENV;

  if (!cloudinaryCloudName || !cloudinaryApiKey || !cloudinaryApiSecret) {
    throw new Error(
      "Storage config missing: set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET",
    );
  }

  if (!configured) {
    cloudinary.config({
      cloud_name: cloudinaryCloudName,
      api_key: cloudinaryApiKey,
      api_secret: cloudinaryApiSecret,
      secure: true,
    });
    configured = true;
  }

  return cloudinary;
}

export function isStorageConfigured(): boolean {
  return Boolean(ENV.cloudinaryCloudName && ENV.cloudinaryApiKey && ENV.cloudinaryApiSecret);
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

/**
 * Turns a caller-supplied path into a Cloudinary public id: strips the file
 * extension (Cloudinary derives its own from the format), drops characters
 * Cloudinary treats specially, and scopes it under the configured folder.
 */
function buildPublicId(relKey: string): string {
  const cleaned = normalizeKey(relKey)
    .replace(/\.[^./]+$/, "")
    .replace(/[?#%<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/\/{2,}/g, "/");

  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const folder = ENV.cloudinaryFolder.replace(/^\/+|\/+$/g, "");

  return folder ? `${folder}/${cleaned}_${hash}` : `${cleaned}_${hash}`;
}

/** Cloudinary calls PDFs and office documents `image` and `raw` respectively. */
function toResourceType(value: string | undefined): StorageResourceType {
  if (value === "image" || value === "video" || value === "raw") return value;
  return "raw";
}

/** Splits `{resourceType}/{publicId}` back into its parts. */
export function parseStorageKey(key: string): {
  resourceType: StorageResourceType;
  publicId: string;
} {
  const normalized = normalizeKey(key);
  const slash = normalized.indexOf("/");

  if (slash > 0) {
    const prefix = normalized.slice(0, slash);
    if ((RESOURCE_TYPES as readonly string[]).includes(prefix)) {
      return { resourceType: prefix as StorageResourceType, publicId: normalized.slice(slash + 1) };
    }
  }

  // Keys written before the resource type was encoded, and hand-entered keys.
  return { resourceType: "image", publicId: normalized };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const client = getCloudinary();
  const publicId = buildPublicId(relKey);

  // Cloudinary's Node uploader takes a path, a remote URL, or a data URI; an
  // in-memory buffer has to go up as the last of those.
  const payload = `data:${contentType};base64,${Buffer.from(data).toString("base64")}`;

  let uploaded: UploadApiResponse;
  try {
    uploaded = await client.uploader.upload(payload, {
      public_id: publicId,
      resource_type: "auto",
      type: "authenticated",
      overwrite: false,
      unique_filename: false,
      use_filename: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Storage upload failed: ${message}`);
  }

  const key = `${toResourceType(uploaded.resource_type)}/${uploaded.public_id}`;
  return { key, url: `/api/manus-storage/${key}` };
}

/**
 * Resolves the app-relative URL for a stored object. The returned path is
 * served by the storage proxy route, never by Cloudinary directly.
 */
export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/api/manus-storage/${key}` };
}

/**
 * Builds a signed Cloudinary delivery URL. Only the storage proxy should call
 * this — handing the result to a browser bypasses the app's access rules.
 */
export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const client = getCloudinary();
  const { resourceType, publicId } = parseStorageKey(relKey);

  return client.url(publicId, {
    resource_type: resourceType,
    type: "authenticated",
    sign_url: true,
    secure: true,
  });
}

export async function storageDelete(relKey: string): Promise<void> {
  const client = getCloudinary();
  const { resourceType, publicId } = parseStorageKey(relKey);

  await client.uploader.destroy(publicId, {
    resource_type: resourceType,
    type: "authenticated",
  });
}
