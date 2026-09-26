import "server-only";

import sharp from "sharp";

/**
 * Validates and re-encodes uploaded brand images. Re-encoding strips metadata
 * and any non-image payload; SVG is not accepted (script injection risk).
 */
const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp"]);
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
/** Total per upload request; matches `serverActions.bodySizeLimit` in next.config.ts (minus multipart overhead). */
export const MAX_REQUEST_UPLOAD_BYTES = 19 * 1024 * 1024;

export type ProcessedImage = { buffer: Buffer; contentType: string; extension: string };

export class ImageValidationError extends Error {
  constructor(public readonly code: "missing" | "too_large" | "unsupported") {
    super(code);
  }
}

async function readValidated(file: File | null, maxBytes = MAX_UPLOAD_BYTES): Promise<Buffer> {
  if (!file || file.size === 0) throw new ImageValidationError("missing");
  if (file.size > maxBytes) throw new ImageValidationError("too_large");
  if (!ACCEPTED.has(file.type)) throw new ImageValidationError("unsupported");
  const buffer = Buffer.from(await file.arrayBuffer());
  // Trust the decoded content, not the declared type.
  const meta = await sharp(buffer)
    .metadata()
    .catch(() => null);
  if (!meta?.format || !["png", "jpeg", "webp"].includes(meta.format)) throw new ImageValidationError("unsupported");
  return buffer;
}

/** Logo: fit within 512×512, keep transparency, WebP. */
export async function processLogo(file: File | null): Promise<ProcessedImage> {
  const input = await readValidated(file);
  const buffer = await sharp(input)
    .rotate()
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer();
  return { buffer, contentType: "image/webp", extension: "webp" };
}

/** Favicon: 64×64 PNG (universally supported). */
export async function processFavicon(file: File | null): Promise<ProcessedImage> {
  const input = await readValidated(file);
  const buffer = await sharp(input)
    .resize(64, 64, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return { buffer, contentType: "image/png", extension: "png" };
}

/** Section photography: max 2400px on the long edge, WebP q82 (next/image serves smaller sizes). */
export async function processSectionImage(file: File | null): Promise<ProcessedImage> {
  const input = await readValidated(file, MAX_PHOTO_BYTES);
  const buffer = await sharp(input)
    .rotate()
    .resize(2400, 2400, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  return { buffer, contentType: "image/webp", extension: "webp" };
}

export type ProcessedPhoto = ProcessedImage & { width: number; height: number };

/** Product and category photos: max 2000px on the long edge, WebP q82, with final dimensions. */
export async function processProductImage(file: File | null): Promise<ProcessedPhoto> {
  const input = await readValidated(file, MAX_PHOTO_BYTES);
  const { data, info } = await sharp(input)
    .rotate()
    .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, contentType: "image/webp", extension: "webp", width: info.width, height: info.height };
}
