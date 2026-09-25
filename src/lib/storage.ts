import { publicEnv } from "@/lib/env.public";

/** Public bucket holding tenant brand and product media (created in Phase 4). */
export const PUBLIC_MEDIA_BUCKET = "tenant-public";

export function publicMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const clean = path.replace(/^\/+/, "");
  return `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PUBLIC_MEDIA_BUCKET}/${clean}`;
}
