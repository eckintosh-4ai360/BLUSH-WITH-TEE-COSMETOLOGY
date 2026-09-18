// Browser-side upload preparation, shared by the dashboard and the website. Photos are shrunk
// before they are sent: a camera original is far larger than any page needs, and hosts refuse large
// request bodies (Vercel stops at 4.5 MB), which failed with an unreadable "not valid JSON" error.

export const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp";

// Anything bigger than this is refused before it is read, rather than locking up the browser.
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

// The longest edge a website photo needs, and the size to aim for once encoded.
const MAX_EDGE = 2000;
const TARGET_BYTES = 900_000;
const QUALITIES = [0.85, 0.75, 0.65, 0.5];

export type PreparedImage = {
  dataUrl: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  bytes: number;
};

// The size to draw at: never enlarged, never longer than MAX_EDGE on either side.
export function fitWithin(
  width: number,
  height: number,
  maxEdge = MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!longest || longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// The format a data URL actually carries, which is not always the one that was asked for: a
// browser without WEBP encoding quietly hands back a PNG.
export function dataUrlMimeType(dataUrl: string): string {
  return dataUrl.slice(5, dataUrl.indexOf(";"));
}

// Roughly how many bytes a base64 data URL carries.
export function dataUrlBytes(dataUrl: string): number {
  const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  return Math.max(Math.floor((encoded.length * 3) / 4) - padding, 0);
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That file could not be read as a photo."));
    image.src = url;
  });
}

function toDataUrl(canvas: HTMLCanvasElement, mimeType: string, quality: number): string {
  return canvas.toDataURL(mimeType, quality);
}

// Reads a picked photo and returns it ready to upload: scaled down, re-encoded, and small enough
// to travel. A PNG keeps its transparency; everything else becomes a JPEG.
export async function prepareImageUpload(
  file: File,
  options: { maxEdge?: number; targetBytes?: number } = {},
): Promise<PreparedImage> {
  const maxEdge = options.maxEdge ?? MAX_EDGE;
  const targetBytes = options.targetBytes ?? TARGET_BYTES;
  if (!ACCEPTED_IMAGE_TYPES.split(",").includes(file.type)) {
    throw new Error("Use a JPEG, PNG or WEBP photo.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("That photo is larger than 40 MB. Export a smaller copy and try again.");
  }

  const sourceUrl = await readAsDataUrl(file);

  // A small photo that is already small enough travels as it is.
  if (file.size <= targetBytes) {
    return { dataUrl: sourceUrl, mimeType: file.type as PreparedImage["mimeType"], bytes: file.size };
  }

  const image = await loadImage(sourceUrl);
  const size = fitWithin(image.naturalWidth || image.width, image.naturalHeight || image.height, maxEdge);

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) return { dataUrl: sourceUrl, mimeType: file.type as PreparedImage["mimeType"], bytes: file.size };

  const keepsTransparency = file.type === "image/png" || file.type === "image/webp";
  if (!keepsTransparency) {
    // Flattened onto white, so a transparent corner does not turn black in a JPEG.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const asked = keepsTransparency ? file.type : "image/jpeg";
  let best = toDataUrl(canvas, asked, QUALITIES[0]!);
  if (!keepsTransparency) {
    for (const quality of QUALITIES.slice(1)) {
      if (dataUrlBytes(best) <= targetBytes) break;
      best = toDataUrl(canvas, asked, quality);
    }
  }

  // The server checks the file's contents against the type it is told, so the type comes from what
  // the browser actually produced. If it could not re-encode it smaller, the original goes up.
  const encoded = dataUrlMimeType(best);
  const bytes = dataUrlBytes(best);
  if (bytes >= file.size || !ACCEPTED_IMAGE_TYPES.split(",").includes(encoded)) {
    return { dataUrl: sourceUrl, mimeType: file.type as PreparedImage["mimeType"], bytes: file.size };
  }
  return { dataUrl: best, mimeType: encoded as PreparedImage["mimeType"], bytes };
}

// Files the browser cannot shrink, such as a PDF, have to arrive small enough on their own.
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

export function documentTooLargeMessage(file: { size: number }): string | null {
  if (file.size <= MAX_DOCUMENT_BYTES) return null;
  return `That file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. PDFs have to be under 4 MB - upload a photo of the document instead, or save a smaller PDF.`;
}

// A body the host refused never reaches tRPC as JSON, so the raw error is unreadable.
export function uploadErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/not valid JSON|Request En|too large|413/i.test(message)) {
    return "That file was too large to upload. Try a smaller one.";
  }
  return message || "The file could not be uploaded.";
}
