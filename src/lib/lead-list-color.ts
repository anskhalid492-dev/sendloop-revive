import { z } from "zod";

export const LIST_COLORS = ["blue", "green", "amber", "rose", "violet", "gray"] as const;
export type ListColor = (typeof LIST_COLORS)[number];
export const DEFAULT_LIST_COLOR: ListColor = "blue";
export const listColorSchema = z.enum(LIST_COLORS);
export function listColor(value: unknown): ListColor {
  return listColorSchema.safeParse(value).data ?? DEFAULT_LIST_COLOR;
}
export const LIST_COLOR_CLASSES: Record<ListColor, { text: string; swatch: string }> = {
  blue: { text: "text-primary", swatch: "bg-primary" },
  green: { text: "text-success", swatch: "bg-success" },
  amber: { text: "text-warning", swatch: "bg-warning" },
  rose: { text: "text-destructive", swatch: "bg-destructive" },
  violet: { text: "text-chart-5", swatch: "bg-chart-5" },
  gray: { text: "text-muted-foreground", swatch: "bg-muted-foreground" },
};

/** Existing destinations are reused, never renamed/recolored by an import. */
export async function resolveImportList(
  existingId: string | null,
  draft: { name: string; color: ListColor } | null,
  create: (draft: { name: string; color: ListColor }) => Promise<{ id: string }>,
): Promise<string | null> {
  if (!draft) return existingId;
  return (await create(draft)).id;
}