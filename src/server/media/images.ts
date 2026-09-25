import "server-only";

import sharp from "sharp";

/**
 * Validates and re-encodes uploaded brand images. Re-encoding strips metadata
 * and any non-image payload; SVG is not accepted (script injection risk).
 */
const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp"]);
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export type ProcessedImage = { buffer: Buffer; contentType: string; extension: string };

export class ImageValidationError extends Error {
  constructor(public readonly code: "missing" | "too_large" | "unsupported") {
    super(code);
  }
}

async function readValidated(file: File | null): Promise<Buffer> {
  if (!file || file.size === 0) throw new ImageValidationError("missing");
  if (file.size > MAX_UPLOAD_BYTES) throw new ImageValidationError("too_large");
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
