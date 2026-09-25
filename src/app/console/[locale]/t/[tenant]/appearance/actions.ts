"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { PUBLIC_MEDIA_BUCKET } from "@/lib/storage";
import type { FormState } from "@/lib/validation/common";
import { appearanceSchema } from "@/lib/validation/tenant";
import { actionContext, storefrontChanged } from "@/server/admin/guards";
import { ImageValidationError, processFavicon, processLogo } from "@/server/media/images";
import { createUserClient } from "@/server/supabase/clients";

const PATH = "/console/[locale]/t/[tenant]/appearance";

export async function updateAppearance(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const context = await actionContext(slug, "appearance.write");
  if (!context) return { status: "error", error: "forbidden" };

  const parsed = appearanceSchema.safeParse({
    theme_key: formData.get("theme_key"),
    primary: formData.get("primary") ?? "",
    accent: formData.get("accent") ?? "",
  });
  if (!parsed.success) return { status: "error", error: "invalid" };

  const supabase = await createUserClient();
  const { data: current } = await supabase
    .from("storefront_configs")
    .select("tokens")
    .eq("tenant_id", context.tenant.id)
    .single();
  const tokens = (current?.tokens ?? {}) as Record<string, unknown>;
  const colors = { ...((tokens.colors as Record<string, string> | undefined) ?? {}) };
  for (const key of ["primary", "accent"] as const) {
    const value = parsed.data[key];
    if (value) colors[key] = value.toUpperCase();
    else delete colors[key];
  }

  const { error } = await supabase
    .from("storefront_configs")
    .update({ theme_key: parsed.data.theme_key, tokens: { ...tokens, colors } })
    .eq("tenant_id", context.tenant.id);
  if (error) return { status: "error", error: "generic" };

  storefrontChanged();
  revalidatePath(PATH, "page");
  return { status: "success", message: "saved" };
}

type BrandingKind = "logo" | "favicon";

export async function uploadBranding(
  slug: string,
  kind: BrandingKind,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // Brand files live on the tenant row, which requires settings.write too.
  const context = await actionContext(slug, "appearance.write");
  if (!context || !context.permissions.includes("settings.write")) return { status: "error", error: "forbidden" };

  let image;
  try {
    const file = formData.get("file");
    image = await (kind === "logo" ? processLogo : processFavicon)(file instanceof File ? file : null);
  } catch (error) {
    if (error instanceof ImageValidationError) return { status: "error", error: `image_${error.code}` };
    return { status: "error", error: "image_unsupported" };
  }

  const supabase = await createUserClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("logo_path, favicon_path")
    .eq("id", context.tenant.id)
    .single();

  // New file name on every upload so caches never serve a stale logo.
  const path = `${context.tenant.id}/branding/${kind}-${randomUUID()}.${image.extension}`;
  const upload = await supabase.storage.from(PUBLIC_MEDIA_BUCKET).upload(path, image.buffer, {
    contentType: image.contentType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (upload.error) return { status: "error", error: "uploadFailed" };

  const column = kind === "logo" ? "logo_path" : "favicon_path";
  const { error } = await supabase
    .from("tenants")
    .update(kind === "logo" ? { logo_path: path } : { favicon_path: path })
    .eq("id", context.tenant.id);
  if (error) {
    await supabase.storage.from(PUBLIC_MEDIA_BUCKET).remove([path]);
    return { status: "error", error: "generic" };
  }

  const previous = tenant?.[column];
  if (previous) await supabase.storage.from(PUBLIC_MEDIA_BUCKET).remove([previous]);

  storefrontChanged();
  revalidatePath(PATH, "page");
  return { status: "success", message: "uploaded" };
}

export async function removeBranding(slug: string, kind: BrandingKind, _prev: FormState): Promise<FormState> {
  const context = await actionContext(slug, "appearance.write");
  if (!context || !context.permissions.includes("settings.write")) return { status: "error", error: "forbidden" };

  const supabase = await createUserClient();
  const column = kind === "logo" ? "logo_path" : "favicon_path";
  const { data: tenant } = await supabase.from("tenants").select(column).eq("id", context.tenant.id).single();
  const { error } = await supabase
    .from("tenants")
    .update(kind === "logo" ? { logo_path: null } : { favicon_path: null })
    .eq("id", context.tenant.id);
  if (error) return { status: "error", error: "generic" };

  const previous = (tenant as Record<string, string | null> | null)?.[column];
  if (previous) await supabase.storage.from(PUBLIC_MEDIA_BUCKET).remove([previous]);

  storefrontChanged();
  revalidatePath(PATH, "page");
  return { status: "success", message: "removed" };
}
