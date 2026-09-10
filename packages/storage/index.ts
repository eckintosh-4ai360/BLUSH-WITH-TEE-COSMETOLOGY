// Cloudinary storage helpers with authenticated access control.

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

// Converts caller relative path to unique Cloudinary public id.
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

// Maps file format to appropriate Cloudinary resource type.
function toResourceType(value: string | undefined): StorageResourceType {
  if (value === "image" || value === "video" || value === "raw") return value;
  return "raw";
}

// Splits storage key into resource type and public id.
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

  // Fallback for legacy keys stored without resource prefix.
  return { resourceType: "image", publicId: normalized };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const client = getCloudinary();
  const publicId = buildPublicId(relKey);

  // Convert buffer to data URI for upload.
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

// Resolves relative storage proxy path for a key.
export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/api/manus-storage/${key}` };
}

// Generates time-limited signed delivery URL for authenticated access.
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
