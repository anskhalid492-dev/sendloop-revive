/**
 * Official brand marks for the companies MunchReach integrates with.
 *
 * Paths come from the Simple Icons set, which distributes the vendors' own
 * marks. When a company has no official asset available we render nothing and
 * the caller falls back to its neutral icon — we never draw a look-alike logo.
 */
import * as simpleIcons from "simple-icons";

import { cn } from "@/lib/utils";

type IconRecord = { title: string; hex: string; path: string };

const ICONS = simpleIcons as unknown as Record<string, IconRecord | undefined>;

function iconKey(brand: string): string {
  const clean = brand.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return `si${clean.charAt(0).toUpperCase()}${clean.slice(1)}`;
}

export function brandIcon(brand: string | undefined | null): IconRecord | null {
  if (!brand) return null;
  return ICONS[iconKey(brand)] ?? null;
}

export function BrandGlyph({
  brand,
  className,
  title,
  colored = true,
}: {
  brand: string | undefined | null;
  className?: string;
  title?: string;
  colored?: boolean;
}) {
  const icon = brandIcon(brand);
  if (!icon) return null;
  return (
    <svg
      role="img"
      aria-label={title ?? icon.title}
      viewBox="0 0 24 24"
      className={cn("size-5", className)}
      fill={colored ? `#${icon.hex}` : "currentColor"}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={icon.path} />
    </svg>
  );
}
