import { describe, expect, it } from "vitest";

import { catalogQuery, parseCatalogFilters } from "@/lib/catalog/filters";
import {
  chooseValue,
  defaultVariant,
  findVariant,
  selectionOf,
  valueStates,
  type VariantView,
} from "@/lib/catalog/variants";
import {
  categorySchema,
  productDetailsSchema,
  productStructureSchema,
  slugify,
  stockAdjustmentSchema,
  toStructurePayload,
} from "@/lib/validation/catalog";
import { parseSections, SECTION_REGISTRY } from "@/lib/storefront/sections";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("shop filters", () => {
  it("parses prices in major units into minor units and ignores junk", () => {
    const f = parseCatalogFilters(
      { q: "  café ", min: "10,5", max: "abc", sort: "price_desc", page: "3", available: "1" },
      2,
    );
    expect(f).toEqual({
      q: "café",
      minMinor: BigInt(1050),
      maxMinor: null,
      available: true,
      sort: "price_desc",
      page: 3,
    });
  });

  it("falls back to defaults and swaps an inverted price range", () => {
    const f = parseCatalogFilters({ sort: "drop table", page: "-2", min: "50", max: "20" }, 3);
    expect(f.sort).toBe("featured");
    expect(f.page).toBe(1);
    expect([f.minMinor, f.maxMinor]).toEqual([BigInt(20000), BigInt(50000)]);
  });

  it("builds short canonical query strings", () => {
    expect(catalogQuery({ sort: "featured", page: 1 }, 2)).toBe("");
    expect(catalogQuery({ q: "tea", minMinor: BigInt(1050), sort: "newest", page: 2 }, 2)).toBe(
      "?q=tea&min=10.5&sort=newest&page=2",
    );
  });
});

describe("variant selection", () => {
  const options = [
    {
      id: "size",
      name: "Size",
      values: [
        { id: "s", label: "S" },
        { id: "m", label: "M" },
      ],
    },
    {
      id: "color",
      name: "Colour",
      values: [
        { id: "red", label: "Red" },
        { id: "blue", label: "Blue" },
      ],
    },
  ];
  const variant = (id: string, ids: string[], availability: VariantView["availability"]): VariantView => ({
    id,
    optionValueIds: ids,
    priceMinor: "1000",
    compareAtMinor: null,
    availability,
    imageId: null,
  });
  const variants = [
    variant("v1", ["s", "red"], "out_of_stock"),
    variant("v2", ["m", "red"], "in_stock"),
    variant("v3", ["m", "blue"], "low_stock"),
  ];

  it("starts on the first purchasable variant", () => {
    expect(defaultVariant(variants)?.id).toBe("v2");
    expect(selectionOf(variants[1], options)).toEqual({ size: "m", color: "red" });
  });

  it("matches variants regardless of option order", () => {
    expect(findVariant(variants, { color: "blue", size: "m" })?.id).toBe("v3");
    expect(findVariant(variants, { size: "s", color: "blue" })).toBeUndefined();
  });

  it("reports which values exist and can be bought with the other choices", () => {
    const states = valueStates(options, variants, { size: "m", color: "red" });
    expect(states.s).toEqual({ exists: true, available: false });
    expect(states.blue).toEqual({ exists: true, available: true });
  });

  it("jumps to a valid combination when the chosen one does not exist", () => {
    expect(chooseValue(options, variants, { size: "m", color: "blue" }, "size", "s")).toEqual({
      size: "s",
      color: "red",
    });
    expect(chooseValue(options, variants, { size: "m", color: "red" }, "color", "blue")).toEqual({
      size: "m",
      color: "blue",
    });
  });
});

describe("catalog validation", () => {
  it("slugifies Latin names and leaves Arabic-only names to a fallback", () => {
    expect(slugify("Éthiopie Yirgacheffe — 250 g")).toBe("ethiopie-yirgacheffe-250-g");
    expect(slugify("قهوة عربية")).toBe("");
  });

  it("requires a name in at least one language and validates slugs", () => {
    const base = { subtitle: {}, description: {}, status: "active" };
    expect(productDetailsSchema.safeParse({ ...base, name: { en: " " } }).success).toBe(false);
    expect(productDetailsSchema.safeParse({ ...base, name: { ar: "قهوة" }, slug: "Bad Slug" }).success).toBe(false);
    const ok = productDetailsSchema.parse({
      ...base,
      name: { ar: "قهوة" },
      featured: "on",
      category_ids: [uuid(1), uuid(1)],
    });
    expect(ok.featured).toBe(true);
    expect(ok.category_ids).toEqual([uuid(1)]);
  });

  it("converts prices exactly and rejects bad amounts", () => {
    const schema = productStructureSchema(3);
    const valid = schema.parse({ options: [], variants: [{ keys: [], price: "12.345", compare_at: "" }] });
    expect(valid.variants[0].price).toBe(BigInt(12345));
    expect(valid.variants[0].compare_at).toBeNull();
    expect(schema.safeParse({ options: [], variants: [{ keys: [], price: "1.2345" }] }).success).toBe(false);
    expect(schema.safeParse({ options: [], variants: [{ keys: [], price: "-1" }] }).success).toBe(false);
    expect(schema.safeParse({ options: [], variants: [{ keys: [], price: "1e3" }] }).success).toBe(false);
  });

  it("checks variants against options, sale prices and duplicate SKUs", () => {
    const schema = productStructureSchema(2);
    const options = [
      {
        name: { en: "Size" },
        values: [
          { key: "a", label: { en: "S" } },
          { key: "b", label: { en: "M" } },
        ],
      },
    ];
    const run = (variants: unknown[]) => schema.safeParse({ options, variants });
    expect(
      run([
        { keys: ["a"], price: "5" },
        { keys: ["b"], price: "6" },
      ]).success,
    ).toBe(true);
    expect(
      run([
        { keys: ["a"], price: "5" },
        { keys: ["a"], price: "6" },
      ]).success,
    ).toBe(false);
    expect(run([{ keys: ["z"], price: "5" }]).success).toBe(false);
    expect(run([{ keys: ["a"], price: "5", compare_at: "4" }]).success).toBe(false);
    expect(
      run([
        { keys: ["a"], price: "5", sku: "X-1" },
        { keys: ["b"], price: "6", sku: "x-1" },
      ]).success,
    ).toBe(false);
    expect(run([{ keys: ["a"], price: "5", sku: "has space" }]).success).toBe(false);
  });

  it("never sends initial stock for existing variants", () => {
    const parsed = productStructureSchema(2).parse({
      options: [],
      variants: [{ id: uuid(9), keys: [], price: "1", initial_stock: "5" }],
    });
    expect(toStructurePayload(parsed).variants[0]).toMatchObject({ price: 100, initial_stock: null });
  });

  it("validates categories and manual stock adjustments", () => {
    expect(categorySchema.parse({ name: { fr: "Cafés" }, status: "active", parent_id: "" }).parent_id).toBeNull();
    const adj = { inventory_item_id: uuid(1), direction: "add", quantity: "3", reason: "restock" };
    expect(stockAdjustmentSchema.parse(adj).quantity).toBe(3);
    expect(stockAdjustmentSchema.safeParse({ ...adj, reason: "sale" }).success).toBe(false);
    expect(stockAdjustmentSchema.safeParse({ ...adj, quantity: "0" }).success).toBe(false);
  });
});

describe("catalog homepage sections", () => {
  it("unlocks catalog sections with safe defaults; best sellers waits for orders", () => {
    const parsed = parseSections([
      { id: uuid(1), type: "featured_products", enabled: true, props: { limit: 7 } },
      { id: uuid(2), type: "product_collection", enabled: true, props: { category: "../etc", limit: 4 } },
      { id: uuid(3), type: "best_sellers", enabled: true, props: {} },
    ]);
    expect(parsed.map((s) => s.type)).toEqual(["featured_products", "product_collection"]);
    expect(parsed[0].props).toMatchObject({ limit: 8 });
    expect(parsed[1].props).toMatchObject({ category: null, limit: 4 });
    expect(SECTION_REGISTRY.best_sellers).toMatchObject({ available: false, reason: "orders" });
  });
});
