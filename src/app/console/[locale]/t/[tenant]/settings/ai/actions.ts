"use server";

import { revalidatePath } from "next/cache";

import { aiSettingsSchema } from "@/lib/validation/ai";
import type { FormState } from "@/lib/validation/common";
import { actionContext } from "@/server/admin/guards";
import { catalogError } from "@/server/catalog/admin";
import { createUserClient } from "@/server/supabase/clients";

const PATH = "/console/[locale]/t/[tenant]/settings/ai";

export async function saveAISettings(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const context = await actionContext(slug, "settings.write");
  if (!context) return { status: "error", error: "forbidden" };
  const parsed = aiSettingsSchema.safeParse({
    active: formData.get("active") === "on",
    assistant_name: formData.get("assistant_name"),
    greeting: formData.get("greeting") ?? undefined,
    tone: formData.get("tone"),
  });
  if (!parsed.success) return { status: "error", error: "invalid" };

  const supabase = await createUserClient();
  const { data: current } = await supabase
    .from("tenant_settings")
    .select("ai")
    .eq("tenant_id", context.tenant.id)
    .single();
  const { error } = await supabase
    .from("tenant_settings")
    .update({
      ai: {
        ...((current?.ai as Record<string, unknown>) ?? {}),
        active: parsed.data.active,
        assistant_name: parsed.data.assistant_name,
        greeting: parsed.data.greeting,
        tone: parsed.data.tone,
      },
    })
    .eq("tenant_id", context.tenant.id);
  if (error) return { status: "error", error: catalogError(error.code) };
  revalidatePath(PATH, "page");
  return { status: "success", message: "saved" };
}
