/**
 * Mirrors `app.normalize_search()` in the database so console searches match
 * the stored `search_text`: case, Latin accents, Arabic diacritics and
 * letter variants (أ إ آ → ا, ى → ي, ة → ه) are ignored.
 */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .trim();
}

/** Escapes LIKE wildcards in user input. */
export function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
