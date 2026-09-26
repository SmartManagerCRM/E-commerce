import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/locales";
import { STOCK_TONE, stockStatus } from "@/lib/catalog/stock";
import { pickLocalized } from "@/lib/localized";
import { minorToDecimal } from "@/lib/money";
import { requireTenantAdmin, type TenantAdminContext } from "@/server/admin/context";
import { catalogSettings } from "@/server/catalog/admin";
import { optionLabels, variantLabel } from "@/server/catalog/inventory";
import { createUserClient } from "@/server/supabase/clients";

import { adjustStock, updateInventorySettings } from "../actions";
import { AdjustForm, SettingsForm } from "./stock-forms";
import { ModuleGate } from "../../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/inventory/[item]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "console.nav" });
  return { title: t("inventory") };
}

export default async function InventoryItemPage({ params }: Props) {
  const { locale, tenant: slug, item } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);
  return (
    <ModuleGate context={context} moduleKey="inventory">
      <Item slug={slug} locale={locale} id={item} context={context} />
    </ModuleGate>
  );
}

async function Item({
  slug,
  locale,
  id,
  context,
}: {
  slug: string;
  locale: Locale;
  id: string;
  context: TenantAdminContext;
}) {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await getTranslations("inventory");
  const format = await getFormatter();
  const settings = await catalogSettings(context);
  const supabase = await createUserClient();

  const { data: item } = await supabase
    .from("inventory_items")
    .select(
      "id, on_hand, reserved, min_stock, cost_minor, track_stock, allow_backorder, product_variants!inner(sku, option_value_ids, products!inner(id, name))",
    )
    .eq("tenant_id", context.tenant.id)
    .eq("id", id)
    .maybeSingle();
  if (!item) notFound();

  const [labels, { data: movements }] = await Promise.all([
    optionLabels(supabase, item.product_variants.option_value_ids, locale, settings.defaultLocale),
    supabase
      .from("stock_movements")
      .select("id, delta, on_hand_after, reason, note, created_at")
      .eq("inventory_item_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const canWrite = context.permissions.includes("inventory.write");
  const product = item.product_variants.products;
  const variant = variantLabel(item.product_variants.option_value_ids, labels);
  const status = stockStatus(item);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={`/t/${slug}/inventory`} className="text-sm text-muted hover:text-fg">
          ← {t("title")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {pickLocalized(product.name, locale, settings.defaultLocale)}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
          {variant ? <span>{variant}</span> : null}
          {item.product_variants.sku ? <span dir="ltr">{item.product_variants.sku}</span> : null}
          <Badge tone={STOCK_TONE[status]}>{t(`status.${status}`)}</Badge>
          <Link href={`/t/${slug}/products/${product.id}`} className="text-primary hover:underline">
            {t("editProduct")}
          </Link>
        </p>
      </div>

      <dl className="grid grid-cols-3 gap-4">
        {[
          { label: t("onHand"), value: item.on_hand },
          { label: t("reserved"), value: item.reserved },
          { label: t("available"), value: item.on_hand - item.reserved },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-surface p-4">
            <dt className="text-sm text-muted">{stat.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {canWrite ? (
        <SectionCard title={t("adjustTitle")} description={t("adjustDescription")}>
          <AdjustForm action={adjustStock.bind(null, slug)} itemId={item.id} />
        </SectionCard>
      ) : null}

      <SectionCard title={t("settingsTitle")}>
        <SettingsForm
          action={updateInventorySettings.bind(null, slug)}
          itemId={item.id}
          disabled={!canWrite}
          currency={settings.currency}
          exponent={settings.exponent}
          values={{
            minStock: item.min_stock,
            trackStock: item.track_stock,
            allowBackorder: item.allow_backorder,
            cost: item.cost_minor === null ? "" : minorToDecimal(BigInt(item.cost_minor), settings.exponent),
          }}
        />
      </SectionCard>

      <SectionCard title={t("historyTitle")}>
        {movements && movements.length > 0 ? (
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b border-border text-muted">
                <tr>
                  <th scope="col" className="px-5 py-2 text-start font-medium sm:px-6">
                    {t("date")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    {t("reason")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">
                    {t("change")}
                  </th>
                  <th scope="col" className="px-5 py-2 text-end font-medium sm:px-6">
                    {t("after")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="px-5 py-2 sm:px-6">
                      {format.dateTime(new Date(m.created_at), { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="px-3 py-2">
                      {t(`reasons.${m.reason as "restock"}`)}
                      {m.note ? <p className="text-xs text-muted">{m.note}</p> : null}
                    </td>
                    <td
                      className={`px-3 py-2 text-end tabular-nums ${m.delta > 0 ? "text-success" : "text-danger"}`}
                      dir="ltr"
                    >
                      {m.delta > 0 ? `+${m.delta}` : m.delta}
                    </td>
                    <td className="px-5 py-2 text-end tabular-nums sm:px-6">{m.on_hand_after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">{t("noHistory")}</p>
        )}
      </SectionCard>
    </div>
  );
}
