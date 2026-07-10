const MAX_IDENT_LENGTH = 40;

/**
 * Turns an arbitrary file/display name into a safe SQL identifier, unique
 * among `existing`. Table names are the one place a user-derived string reaches
 * SQL, so this is strict: lowercase ASCII letters/digits/underscore, starting
 * with a letter or underscore. The result is still double-quoted at every use
 * site (and the virtual filename is derived from it) as defense in depth.
 *
 * Pure by design (no DuckDB import) so it can be unit-tested in isolation.
 */
export function deriveTableName(displayName: string, existing: string[] = []): string {
  const base =
    displayName
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "") // strip accents
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/i, "") // drop a trailing extension
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, MAX_IDENT_LENGTH) || "tabla";
  const safe = /^[a-z_]/.test(base) ? base : `t_${base}`;
  let name = safe;
  let i = 2;
  while (existing.includes(name)) name = `${safe}_${i++}`;
  return name;
}
