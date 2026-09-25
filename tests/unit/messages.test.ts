import { describe, expect, it } from "vitest";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  return Object.entries(obj).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") Object.assign(acc, flatten(value as Record<string, unknown>, path));
    else acc[path] = String(value);
    return acc;
  }, {});
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("translations", () => {
  const base = flatten(en);

  it.each([
    ["fr", flatten(fr)],
    ["ar", flatten(ar)],
  ])("%s has exactly the same keys as en", (_locale, messages) => {
    expect(Object.keys(messages).sort()).toEqual(Object.keys(base).sort());
  });

  it.each([
    ["fr", flatten(fr)],
    ["ar", flatten(ar)],
  ])("%s keeps the same placeholders and has no empty strings", (_locale, messages) => {
    for (const [key, value] of Object.entries(base)) {
      expect(messages[key].trim(), key).not.toBe("");
      expect(placeholders(messages[key]), key).toEqual(placeholders(value));
    }
  });
});
