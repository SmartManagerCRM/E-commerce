"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { formDataToObject } from "@/lib/form-data";
import { PUBLIC_MEDIA_BUCKET } from "@/lib/storage";
import {
  MAX_SECTIONS,
  SECTION_REGISTRY,
  SECTION_SCHEMAS,
  SECTION_TYPES,
  emptySectionProps,
  hrefSchema,
  parseSections,
  type Section,
  type SectionType,
} from "@/lib/storefront/sections";
import type { FormState } from "@/lib/validation/common";
import { actionContext, storefrontChanged } from "@/server/admin/guards";
import type { TenantAdminContext } from "@/server/admin/context";
import { ImageValidationError, processSectionImage } from "@/server/media/images";
import { createUserClient } from "@/server/supabase/clients";

import { loadEditableSections } from "./load";

const PATH = "/console/[locale]/t/[tenant]/appearance/homepage";

async function saveSections(context: TenantAdminContext, sections: Section[]): Promise<FormState> {
  const supabase = await createUserClient();
  const { error } = await supabase
    .from("storefront_configs")
    .update({ homepage_sections: sections as never })
    .eq("tenant_id", context.tenant.id);
  if (error) return { status: "error", error: "generic" };
  storefrontChanged();
  revalidatePath(PATH, "page");
  return { status: "success", message: "saved" };
}

async function withSections(
  slug: string,
  mutate: (sections: Section[], context: TenantAdminContext) => Promise<Section[] | FormState> | Section[] | FormState,
): Promise<FormState> {
  const context = await actionContext(slug, "appearance.write");
  if (!context) return { status: "error", error: "forbidden" };
  const sections = await loadEditableSections(context);
  const result = await mutate(sections, context);
  if (!Array.isArray(result)) return result;
  // Re-validate the whole document before persisting.
  return saveSections(context, parseSections(result));
}

const idSchema = z.uuid();

export async function addSection(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const type = z.enum(SECTION_TYPES as [SectionType, ...SectionType[]]).safeParse(formData.get("type"));
  if (!type.success || !SECTION_REGISTRY[type.data].available) return { status: "error", error: "invalid" };
  return withSections(slug, (sections) => {
    if (sections.length >= MAX_SECTIONS) return { status: "error", error: "tooManySections" };
    if (!SECTION_REGISTRY[type.data].multiple && sections.some((s) => s.type === type.data)) {
      return { status: "error", error: "sectionExists" };
    }
    return [
      ...sections,
      { id: randomUUID(), type: type.data, enabled: false, props: emptySectionProps(type.data) } as Section,
    ];
  });
}

export async function moveSection(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const id = idSchema.safeParse(formData.get("section_id"));
  const direction = formData.get("direction") === "up" ? -1 : 1;
  if (!id.success) return { status: "error", error: "invalid" };
  return withSections(slug, (sections) => {
    const index = sections.findIndex((s) => s.id === id.data);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= sections.length) return sections;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
}

export async function toggleSection(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const id = idSchema.safeParse(formData.get("section_id"));
  if (!id.success) return { status: "error", error: "invalid" };
  return withSections(slug, (sections) =>
    sections.map((s) => (s.id === id.data ? ({ ...s, enabled: !s.enabled } as Section) : s)),
  );
}

async function removeImages(paths: (string | null | undefined)[]) {
  const existing = paths.filter((p): p is string => Boolean(p));
  if (existing.length === 0) return;
  const supabase = await createUserClient();
  await supabase.storage.from(PUBLIC_MEDIA_BUCKET).remove(existing);
}

function imageOf(section: Section): string | null {
  return "image_path" in section.props ? (section.props.image_path as string | null) : null;
}

export async function removeSection(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const id = idSchema.safeParse(formData.get("section_id"));
  if (!id.success) return { status: "error", error: "invalid" };
  let orphan: string | null = null;
  const result = await withSections(slug, (sections) => {
    const target = sections.find((s) => s.id === id.data);
    orphan = target ? imageOf(target) : null;
    return sections.filter((s) => s.id !== id.data);
  });
  if (result.status === "success") await removeImages([orphan]);
  return result;
}

/** Normalizes a CTA sub-form: no href or no label in any language → no button. */
function normalizeCta(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const { label, href } = raw as { label?: Record<string, string>; href?: string };
  const hasLabel = label && Object.values(label).some((v) => typeof v === "string" && v.trim() !== "");
  return href && href.trim() !== "" && hasLabel ? { label, href: href.trim() } : null;
}

export async function updateSection(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const id = idSchema.safeParse(formData.get("section_id"));
  if (!id.success) return { status: "error", error: "invalid" };
  const input = formDataToObject(formData) as { props?: Record<string, unknown> };
  const raw: Record<string, unknown> = { ...(input.props ?? {}) };

  let newImagePath: string | null = null;
  let oldImagePath: string | null = null;

  const result = await withSections(slug, async (sections, context) => {
    const section = sections.find((s) => s.id === id.data);
    if (!section) return { status: "error", error: "notFound" };
    const type = section.type;

    if ("cta" in raw || type === "hero" || type === "promo_banner") {
      raw.cta = normalizeCta(raw.cta);
      // The read schema is lenient (drops bad links); writes must be strict so
      // the owner is told instead of the button silently disappearing.
      const cta = raw.cta as { href: string } | null;
      if (cta && !hrefSchema.safeParse(cta.href).success) return { status: "error", error: "invalidLink" };
    }
    if (type === "location") {
      raw.show_hours = raw.show_hours === "on";
      raw.show_map = raw.show_map === "on";
    }
    if (type === "testimonials" && raw.items && typeof raw.items === "object") {
      raw.items = Object.entries(raw.items as Record<string, unknown>)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, item]) => item as { quote?: Record<string, string>; author?: string; detail?: Record<string, string> })
        .filter((item) => item.quote && Object.values(item.quote).some((v) => v.trim() !== ""));
    }

    // Image handling (hero / brand story): keep, replace or remove.
    if (type === "hero" || type === "brand_story") {
      const current = imageOf(section);
      raw.image_path = current;
      const file = formData.get("image");
      if (file instanceof File && file.size > 0) {
        if (!context.permissions.includes("media.write") && !context.permissions.includes("appearance.write")) {
          return { status: "error", error: "forbidden" };
        }
        let image;
        try {
          image = await processSectionImage(file);
        } catch (error) {
          return {
            status: "error",
            error: error instanceof ImageValidationError ? `image_${error.code}` : "image_unsupported",
          };
        }
        const path = `${context.tenant.id}/sections/${randomUUID()}.${image.extension}`;
        const supabase = await createUserClient();
        const upload = await supabase.storage.from(PUBLIC_MEDIA_BUCKET).upload(path, image.buffer, {
          contentType: image.contentType,
          cacheControl: "31536000",
          upsert: false,
        });
        if (upload.error) return { status: "error", error: "uploadFailed" };
        newImagePath = path;
        oldImagePath = current;
        raw.image_path = path;
      } else if (formData.get("remove_image") === "on") {
        oldImagePath = current;
        raw.image_path = null;
      }
    }

    const props = SECTION_SCHEMAS[type].safeParse(raw);
    if (!props.success) return { status: "error", error: "invalid" };
    return sections.map((s) => (s.id === section.id ? ({ ...s, props: props.data } as Section) : s));
  });

  if (result.status === "success") await removeImages([oldImagePath]);
  else await removeImages([newImagePath]);
  return result;
}
