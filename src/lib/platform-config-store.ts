/**
 * Client-safe store for the public platform configuration.
 *
 * The root loader fetches the config once and writes it here before children
 * render, so SSR and hydration read identical branding, localization, legal
 * and consent values (same pattern as the site-content store).
 */
export type PublicConfigValues = Record<string, string | number | boolean | null>;

export type PublicPlatformConfigShape = {
  branding: PublicConfigValues;
  consent: PublicConfigValues;
  legal: PublicConfigValues;
  localization: PublicConfigValues;
  api: PublicConfigValues;
  limits: PublicConfigValues;
  general: PublicConfigValues;
};

let current: PublicPlatformConfigShape | null = null;

export function setPlatformConfig(config: PublicPlatformConfigShape | null) {
  current = config;
}

export function getPlatformConfig(): PublicPlatformConfigShape | null {
  return current;
}

function read(group: keyof PublicPlatformConfigShape, key: string): string {
  const value = current?.[group]?.[key];
  return value === null || value === undefined ? "" : String(value);
}

export function brandingValue(key: string): string {
  return read("branding", key);
}

export function legalValue(key: string): string {
  return read("legal", key);
}

export function localizationValue(key: string): string {
  return read("localization", key);
}

/** Numeric validation limit with a caller-supplied fallback. */
export function limitValue(key: string, fallback: number): number {
  const raw = current?.limits?.[key];
  const parsed = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function booleanValue(
  group: keyof PublicPlatformConfigShape,
  key: string,
  fallback = false,
): boolean {
  const raw = current?.[group]?.[key];
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === "boolean") return raw;
  return raw === "true" || raw === 1 || raw === "1";
}
