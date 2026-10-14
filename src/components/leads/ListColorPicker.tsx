import { Check, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LIST_COLORS, LIST_COLOR_CLASSES, listColor, type ListColor } from "@/lib/lead-list-color";

export function ListFolderIcon({ color, className }: { color?: string | null | undefined; className?: string }) {
  return <Folder aria-hidden="true" className={cn("size-4 shrink-0", LIST_COLOR_CLASSES[listColor(color)].text, className)} />;
}

export function ListColorPicker({ value, onChange }: { value: ListColor; onChange: (color: ListColor) => void }) {
  return (
    <div role="group" aria-label="Folder color" className="flex flex-wrap gap-2">
      {LIST_COLORS.map((color) => (
        <Button key={color} type="button" variant="outline" size="icon"
          aria-label={`${color[0]?.toUpperCase()}${color.slice(1)} folder`} aria-pressed={value === color}
          title={`${color[0]?.toUpperCase()}${color.slice(1)}`} onClick={() => onChange(color)}
          className={cn("size-8 rounded-full p-1", value === color && "border-ring ring-2 ring-ring/25")}>
          <span className={cn("flex size-5 items-center justify-center rounded-full", LIST_COLOR_CLASSES[color].swatch)}>
            {value === color && <Check className="size-3 text-background" />}
          </span>
        </Button>
      ))}
    </div>
  );
}