"use server";

import { randomBytes, randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";

import { redirect } from "@/i18n/navigation";
import { formDataToObject } from "@/lib/form-data";
import { localizedInput } from "@/lib/validation/common";
import type { FormState } from "@/lib/validation/common";
import type { LocalizedText } from "@/lib/localized";
import { PUBLIC_MEDIA_BUCKET } from "@/lib/storage";
import {
  newProductSchema,
  productDetailsSchema,
  productStructureSchema,
  slugify,
  toStructurePayload,
} from "@/lib/validation/catalog";
import { actionContext } from "@/server/admin/guards";
import type { TenantAdminContext } from "@/server/admin/context";
import { catalogError, catalogSettings } from "@/server/catalog/admin";
import { ImageValidationError, MAX_REQUEST_UPLOAD_BYTES, processProductImage } from "@/server/media/images";
import { createUserClient } from "@/server/supabase/clients";

const LIST = "/console/[locale]/t/[tenant]/products";
const EDITOR = "/console/[locale]/t/[tenant]/products/[id]";
const MAX_IMAGES = 20;
const idSchema = z.uuid();

function changed() {
  revalidatePath(LIST, "page");
  revalidatePath(EDITOR, "page");
}

/** Slug from the typed value, else from a Latin name, else a short random one. */
function productSlug(typed: string, name: LocalizedText): string {
  if (typed) return typed;
  const fromName = Object.values(name)
    .map((n) => slugify(n ?? "", 100))
    .find(Boolean);
  return fromName || `p-${randomBytes(4).toString("hex")}`;
}

/** Loads the product only if it belongs to this tenant (and is visible under RLS). */
async function ownProduct(context: TenantAdminContext, productId: string) {
  if (!idSchema.safeParse(productId).success) return null;
  const supabase = await createUserClient();
  const { data } = await supabase
    .from("products")
    .select("id, slug")
    .eq("tenant_id", context.tenant.id)
    .eq("id", productId)
    .maybeSingle();
  return data;
}

export async function createProduct(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const context = await actionContext(slug, "catalog.write");
  if (!context) return { status: "error", error: "forbidden" };
  const { exponent } = await catalogSettings(context);
  const parsed = newProductSchema(exponent).safeParse(formDataToObject(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { status: "error", error: issue?.message === "invalidPrice" ? "invalidPrice" : "invalid" };
  }

  const supabase = await createUserClient();
  const { data: product, error } = await supabase
    .from("products")
    .insert({
      tenant_id: context.tenant.id,
      name: parsed.data.name,
      slug: productSlug(parsed.data.slug, parsed.data.name),
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !product) {
    return { status: "error", error: error?.code === "23505" ? "slugTaken" : catalogError(error?.code) };
  }

  const { error: structureError } = await supabase.rpc("save_product_structure", {
    p_product: product.id,
    p_options: [],
    p_variants: [{ keys: [], price: Number(parsed.data.price) }],
  });
  if (structureError) {
    await supabase.from("products").delete().eq("id", product.id);
    return { status: "error", error: catalogError(structureError.code) };
  }

  changed();
  redirect({ href: `/t/${slug}/products/${product.id}`, locale: await getLocale() });
  return { status: "success" };
}

export async function updateProductDetails(
  slug: string,
  productId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await actionContext(slug, "catalog.write");
  if (!context) return { status: "error", error: "forbidden" };
  if (!(await ownProduct(context, productId))) return { status: "error", error: "notFound" };

  const parsed = productDetailsSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    const slugIssue = parsed.error.issues.some((i) => i.message === "invalidSlug");
    return { status: "error", error: slugIssue ? "invalidSlug" : "invalid" };
  }
  const input = parsed.data;

  const supabase = await createUserClient();
  const { error } = await supabase
    .from("products")
    .update({
      name: input.name,
      subtitle: input.subtitle,
      description: input.description,
      slug: productSlug(input.slug, input.name),
      status: input.status,
      featured: input.featured,
    })
    .eq("tenant_id", context.tenant.id)
    .eq("id", productId);
  if (error) return { status: "error", error: error.code === "23505" ? "slugTaken" : catalogError(error.code) };

  // Categories: replace the set (composite foreign keys keep them within the tenant).
  const { error: removeError } = await supabase
    .from("product_categories")
    .delete()
    .eq("tenant_id", context.tenant.id)
    .eq("product_id", productId)
    .not("category_id", "in", `(${input.category_ids.join(",") || "00000000-0000-0000-0000-000000000000"})`);
  if (removeError) return { status: "error", error: catalogError(removeError.code) };
  if (input.category_ids.length > 0) {
    const { error: addError } = await supabase.from("product_categories").upsert(
      input.category_ids.map((category_id, position) => ({
        tenant_id: context.tenant.id,
        product_id: productId,
        category_id,
        position,
      })),
      { onConflict: "product_id,category_id" },
    );
    if (addError) return { status: "error", error: catalogError(addError.code) };
  }

  changed();
  return { status: "success", message: "saved" };
}

export async function saveProductStructure(
  slug: string,
  productId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await actionContext(slug, "catalog.write");
  if (!context) return { status: "error", error: "forbidden" };
  if (!(await ownProduct(context, productId))) return { status: "error", error: "notFound" };
  const { exponent } = await catalogSettings(context);

  let json: unknown;
  try {
    json = JSON.parse(String(formData.get("structure") ?? ""));
  } catch {
    return { status: "error", error: "invalid" };
  }
  const parsed = productStructureSchema(exponent).safeParse(json);
  if (!parsed.success) {
    const messages = new Set(parsed.error.issues.map((i) => i.message));
    for (const key of ["invalidPrice", "compareAtTooLow", "skuTaken", "invalidSku", "duplicateValue"]) {
      if (messages.has(key)) return { status: "error", error: key };
    }
    return { status: "error", error: "invalid" };
  }

  const payload = toStructurePayload(parsed.data);
  // Opening stock is an inventory change: only for members who may adjust stock.
  const canStock = context.permissions.includes("inventory.write") && context.features.inventory?.enabled === true;
  if (!canStock) payload.variants.forEach((v) => (v.initial_stock = null));

  const supabase = await createUserClient();
  const { error } = await supabase.rpc("save_product_structure", {
    p_product: productId,
    p_options: payload.options,
    p_variants: payload.variants,
  });
  if (error) return { status: "error", error: error.code === "23505" ? "skuTaken" : catalogError(error.code) };

  changed();
  revalidatePath("/console/[locale]/t/[tenant]/inventory", "page");
  return { status: "success", message: "saved" };
}

export async function uploadProductImages(
  slug: string,
  productId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await actionContext(slug, "catalog.write");
  if (!context || !context.permissions.includes("media.write")) return { status: "error", error: "forbidden" };
  if (!(await ownProduct(context, productId))) return { status: "error", error: "notFound" };

  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { status: "error", error: "image_missing" };
  if (files.reduce((n, f) => n + f.size, 0) > MAX_REQUEST_UPLOAD_BYTES)
    return { status: "error", error: "uploadTooLarge" };

  const supabase = await createUserClient();
  const { data: existing } = await supabase
    .from("product_images")
    .select("position")
    .eq("product_id", productId)
    .order("position", { ascending: false });
  if ((existing?.length ?? 0) + files.length > MAX_IMAGES) return { status: "error", error: "tooManyImages" };
  let position = (existing?.[0]?.position ?? -1) + 1;

  for (const file of files) {
    let image;
    try {
      image = await processProductImage(file);
    } catch (error) {
      return {
        status: "error",
        error: error instanceof ImageValidationError ? `photo_${error.code}` : "image_unsupported",
      };
    }
    const path = `${context.tenant.id}/products/${randomUUID()}.${image.extension}`;
    const upload = await supabase.storage.from(PUBLIC_MEDIA_BUCKET).upload(path, image.buffer, {
      contentType: image.contentType,
      cacheControl: "31536000",
      upsert: false,
    });
    if (upload.error) return { status: "error", error: "uploadFailed" };
    const { error } = await supabase.from("product_images").insert({
      tenant_id: context.tenant.id,
      product_id: productId,
      storage_path: path,
      width: image.width,
      height: image.height,
      position: position++,
    });
    if (error) {
      await supabase.storage.from(PUBLIC_MEDIA_BUCKET).remove([path]);
      return { status: "error", error: catalogError(error.code) };
    }
  }

  changed();
  return { status: "success", message: "uploaded" };
}

const imageActionSchema = z.object({
  image_id: z.uuid(),
  intent: z.enum(["alt", "up", "down", "delete"]),
  alt: localizedInput(200).optional(),
});

export async function updateProductImage(
  slug: string,
  productId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await actionContext(slug, "catalog.write");
  if (!context) return { status: "error", error: "forbidden" };
  const parsed = imageActionSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", error: "invalid" };
  const { image_id, intent, alt } = parsed.data;

  const supabase = await createUserClient();
  const { data: images } = await supabase
    .from("product_images")
    .select("id, storage_path, position")
    .eq("tenant_id", context.tenant.id)
    .eq("product_id", productId)
    .order("position");
  const index = images?.findIndex((i) => i.id === image_id) ?? -1;
  if (!images || index < 0) return { status: "error", error: "notFound" };
  const image = images[index];

  if (intent === "alt") {
    const { error } = await supabase
      .from("product_images")
      .update({ alt: alt ?? {} })
      .eq("id", image_id);
    if (error) return { status: "error", error: catalogError(error.code) };
  } else if (intent === "delete") {
    if (!context.permissions.includes("media.write")) return { status: "error", error: "forbidden" };
    const { error } = await supabase.from("product_images").delete().eq("id", image_id);
    if (error) return { status: "error", error: catalogError(error.code) };
    await supabase.storage.from(PUBLIC_MEDIA_BUCKET).remove([image.storage_path]);
  } else {
    const neighbour = images[intent === "up" ? index - 1 : index + 1];
    if (!neighbour) return { status: "success" };
    const order = images.map((i) => i.id);
    order[index] = neighbour.id;
    order[intent === "up" ? index - 1 : index + 1] = image.id;
    for (const [position, id] of order.entries()) {
      const { error } = await supabase.from("product_images").update({ position }).eq("id", id);
      if (error) return { status: "error", error: catalogError(error.code) };
    }
  }

  changed();
  return { status: "success", message: intent === "delete" ? "removed" : "saved" };
}

export async function deleteProduct(slug: string, productId: string, _prev: FormState): Promise<FormState> {
  const context = await actionContext(slug, "catalog.write");
  if (!context) return { status: "error", error: "forbidden" };
  if (!(await ownProduct(context, productId))) return { status: "error", error: "notFound" };

  const supabase = await createUserClient();
  const { data: images } = await supabase.from("product_images").select("storage_path").eq("product_id", productId);
  const { error } = await supabase.from("products").delete().eq("tenant_id", context.tenant.id).eq("id", productId);
  if (error) return { status: "error", error: catalogError(error.code) };
  const paths = (images ?? []).map((i) => i.storage_path);
  if (paths.length > 0 && context.permissions.includes("media.write")) {
    await supabase.storage.from(PUBLIC_MEDIA_BUCKET).remove(paths);
  }

  changed();
  redirect({ href: `/t/${slug}/products`, locale: await getLocale() });
  return { status: "success" };
}
