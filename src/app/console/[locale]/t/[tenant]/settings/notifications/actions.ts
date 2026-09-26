"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { FormState } from "@/lib/validation/common";
import { emailSchema } from "@/lib/validation/common";
import { actionContext } from "@/server/admin/guards";
import { catalogError } from "@/server/catalog/admin";
import { createUserClient } from "@/server/supabase/clients";

const PATH = "/console/[locale]/t/[tenant]/settings/notifications";
const checked = (formData: FormData, name: string) => formData.get(name) === "on";

const schema = z.object({
  order_emails: z.boolean(),
  daily_brief: z.boolean(),
  recipient_email: z.union([z.literal(""), emailSchema]),
});

export async function saveNotificationSettings(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const context = await actionContext(slug, "settings.write");
  if (!context) return { status: "error", error: "forbidden" };

  const parsed = schema.safeParse({
    order_emails: checked(formData, "order_emails"),
    daily_brief: checked(formData, "daily_brief"),
    recipient_email: String(formData.get("recipient_email") ?? "").trim(),
  });
  if (!parsed.success) return { status: "error", error: "invalid" };
  const input = parsed.data;

  const supabase = await createUserClient();
  const { error } = await supabase
    .from("tenant_settings")
    .update({
      notifications: {
        order_emails: input.order_emails,
        daily_brief: input.daily_brief,
        recipient_email: input.recipient_email || null,
      },
    })
    .eq("tenant_id", context.tenant.id);
  if (error) return { status: "error", error: catalogError(error.code) };
  revalidatePath(PATH, "page");
  return { status: "success", message: "saved" };
}
