"use server";

import { randomBytes, randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";

import { redirect } from "@/i18n/navigation";
import { formDataToObject } from "@/lib/form-data";
import type { LocalizedText } from "@/lib/localized";
import { PUBLIC_MEDIA_BUCKET } from "@/lib/storage";
import type { FormState } from "@/lib/validation/common";
import { categorySchema, slugify } from "@/lib/validation/catalog";
import { actionContext } from "@/server/admin/guards";
import { catalogError } from "@/server/catalog/admin";
import { ImageValidationError, processProductImage } from "@/server/media/images";
import { createUserClient } from "@/server/supabase/clients";

const LIST = "/console/[locale]/t/[tenant]/categories";
const EDITOR = "/console/[locale]/t/[tenant]/categories/[id]";
const idSchema = z.uuid();

function changed() {
  revalidatePath(LIST, "page");
  revalidatePath(EDITOR, "page");
  revalidatePath("/console/[locale]/t/[tenant]/products/[id]", "page");
}

function categorySlug(typed: string, name: LocalizedText): string {
  if (typed) return typed;
  const fromName = Object.values(name)
    .map((n) => slugify(n ?? "", 60))
    .find(Boolean);
  return fromName || `c-${randomBytes(3).toString("hex")}`;
}

function errorFor(code: string | undefined): string {
  if (code === "23505") return "slugTaken";
  if (code === "23514") return "categoryCycle";
  return catalogError(code);
}

export async function createCategory(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const context = await actionContext(slug, "catalog.write");
  if (!context) return { status: "error", error: "forbidden" };
  const parsed = categorySchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", error: "invalid" };
  const input = parsed.data;

  const supabase = await createUserClient();
  const { error } = await supabase.from("categories").insert({
    tenant_id: context.tenant.id,
    name: input.name,
    description: input.description,
    slug: categorySlug(input.slug, input.name),
    parent_id: input.parent_id,
    status: input.status,
    position: input.position,
  });
  if (error) return { status: "error", error: errorFor(error.code) };
  changed();
  return { status: "success", message: "categoryCreated" };
}

export async function updateCategory(
  slug: string,
  categoryId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await actionContext(slug, "catalog.write");
  if (!context) return { status: "error", error: "forbidden" };
  if (!idSchema.safeParse(categoryId).success) return { status: "error", error: "notFound" };
  const parsed = categorySchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", error: "invalid" };
  const input = parsed.data;

  const supabase = await createUserClient();
  const { data: current } = await supabase
    .from("categories")
    .select("id, image_path")
    .eq("tenant_id", context.tenant.id)
    .eq("id", categoryId)
    .maybeSingle();
  if (!current) return { status: "error", error: "notFound" };

  let imagePath = current.image_path;
  let uploaded: string | null = null;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    if (!context.permissions.includes("media.write")) return { status: "error", error: "forbidden" };
    let image;
    try {
      image = await processProductImage(file);
    } catch (error) {
      return {
        status: "error",
        error: error instanceof ImageValidationError ? `photo_${error.code}` : "image_unsupported",
      };
    }
    uploaded = `${context.tenant.id}/categories/${randomUUID()}.${image.extension}`;
    const upload = await supabase.storage.from(PUBLIC_MEDIA_BUCKET).upload(uploaded, image.buffer, {
      contentType: image.contentType,
      cacheControl: "31536000",
      upsert: false,
    });
    if (upload.error) return { status: "error", error: "uploadFailed" };
    imagePath = uploaded;
  } else if (formData.get("remove_image") === "on") {
    imagePath = null;
  }

  const { error } = await supabase
    .from("categories")
    .update({
      name: input.name,
      description: input.description,
      slug: categorySlug(input.slug, input.name),
      parent_id: input.parent_id,
      status: input.status,
      position: input.position,
      image_path: imagePath,
    })
    .eq("tenant_id", context.tenant.id)
    .eq("id", categoryId);
  if (error) {
    if (uploaded) await supabase.storage.from(PUBLIC_MEDIA_BUCKET).remove([uploaded]);
    return { status: "error", error: errorFor(error.code) };
  }
  if (current.image_path && current.image_path !== imagePath) {
    await supabase.storage.from(PUBLIC_MEDIA_BUCKET).remove([current.image_path]);
  }
  changed();
  return { status: "success", message: "saved" };
}

export async function deleteCategory(slug: string, categoryId: string, _prev: FormState): Promise<FormState> {
  const context = await actionContext(slug, "catalog.write");
  if (!context) return { status: "error", error: "forbidden" };
  if (!idSchema.safeParse(categoryId).success) return { status: "error", error: "notFound" };
  const supabase = await createUserClient();
  const { data: current } = await supabase
    .from("categories")
    .select("image_path")
    .eq("tenant_id", context.tenant.id)
    .eq("id", categoryId)
    .maybeSingle();
  // Products stay; only their link to this category is removed (sub-categories move up a level).
  const { error } = await supabase.from("categories").delete().eq("tenant_id", context.tenant.id).eq("id", categoryId);
  if (error) return { status: "error", error: errorFor(error.code) };
  if (current?.image_path && context.permissions.includes("media.write")) {
    await supabase.storage.from(PUBLIC_MEDIA_BUCKET).remove([current.image_path]);
  }
  changed();
  redirect({ href: `/t/${slug}/categories`, locale: await getLocale() });
  return { status: "success" };
}
