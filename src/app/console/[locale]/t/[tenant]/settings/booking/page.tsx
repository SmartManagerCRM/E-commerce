import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SectionCard } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/locales";
import { asLocalizedText } from "@/lib/localized";
import { requireTenantAdmin, type TenantAdminContext } from "@/server/admin/context";
import { catalogSettings } from "@/server/catalog/admin";
import * as bookingsService from "@/server/services/bookings";
import { createUserClient } from "@/server/supabase/clients";

import { deleteBookingResource, saveBookingResource, saveBookingSettings } from "./actions";
import { BookingResourceForm, BookingSettingsForm } from "./booking-forms";
import { ModuleGate } from "../../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/settings/booking">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "bookingSettings" });
  return { title: t("title") };
}

export default async function BookingSettingsPage({ params }: Props) {
  const { locale, tenant: slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);
  return (
    <ModuleGate context={context} moduleKey="settings">
      <Content slug={slug} locale={locale} context={context} />
    </ModuleGate>
  );
}

async function Content({ slug, context }: { slug: string; locale: Locale; context: TenantAdminContext }) {
  const t = await getTranslations("bookingSettings");
  const settings = await catalogSettings(context);
  const entitled = context.features.booking?.enabled === true;
  const supabase = await createUserClient();
  const [{ data: row }, resources] = await Promise.all([
    supabase.from("tenant_settings").select("booking").eq("tenant_id", context.tenant.id).single(),
    bookingsService.listBookingResources(context),
  ]);
  const booking = (row?.booking ?? {}) as Record<string, unknown>;
  const canEdit = context.permissions.includes("settings.write") && entitled;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Link href={`/t/${slug}/settings`} className="text-sm text-muted hover:text-fg">
          ← {t("back")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </div>

      {!entitled ? (
        <p role="alert" className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
          {t("notEntitled")}
        </p>
      ) : null}

      <SectionCard title={t("acceptingTitle")} description={t("acceptingDescription")}>
        <BookingSettingsForm
          action={saveBookingSettings.bind(null, slug)}
          disabled={!canEdit}
          values={{
            acceptingBookings: booking.accepting_bookings === true,
            defaultDurationMinutes: typeof booking.default_duration_minutes === "number" ? booking.default_duration_minutes : 60,
            bufferMinutes: typeof booking.buffer_minutes === "number" ? booking.buffer_minutes : 0,
            minNoticeMinutes: typeof booking.min_notice_minutes === "number" ? booking.min_notice_minutes : 30,
            maxAdvanceDays: typeof booking.max_advance_days === "number" ? booking.max_advance_days : 30,
            maxPartySize: typeof booking.max_party_size === "number" ? booking.max_party_size : null,
          }}
        />
      </SectionCard>

      <SectionCard title={t("resourcesTitle")} description={t("resourcesDescription")}>
        <div className="space-y-4">
          {resources.map((resource) => (
            <BookingResourceForm
              key={resource.id}
              action={saveBookingResource.bind(null, slug)}
              remove={deleteBookingResource.bind(null, slug, resource.id)}
              locales={settings.locales}
              disabled={!canEdit}
              resource={{
                id: resource.id,
                name: asLocalizedText(resource.name),
                kind: resource.kind,
                capacityMin: resource.capacityMin === null ? "" : String(resource.capacityMin),
                capacityMax: resource.capacityMax === null ? "" : String(resource.capacityMax),
                active: resource.active,
                position: resource.position,
              }}
            />
          ))}
          {resources.length === 0 ? <p className="text-sm text-muted">{t("noResources")}</p> : null}
          {canEdit ? (
            <BookingResourceForm
              key="new-resource"
              action={saveBookingResource.bind(null, slug)}
              locales={settings.locales}
              disabled={false}
              resource={null}
              position={resources.length}
            />
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
