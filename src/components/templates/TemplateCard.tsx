import { Copy, Eye, MoreHorizontal, Pencil, Sparkles, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { templatePreview, type EmailTemplateRow } from "@/lib/templates-model";

export function TemplateCard({
  template,
  canManage,
  onPreview,
  onUse,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  template: EmailTemplateRow;
  canManage: boolean;
  onPreview: () => void;
  onUse: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}) {
  return (
    <article className="surface-card flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate font-semibold">{template.name}</h3>
            {template.featured ? (
              <Badge className="gap-1 bg-primary/10 text-primary hover:bg-primary/10">
                <Sparkles className="size-3" /> Featured
              </Badge>
            ) : null}
            {!template.published ? <Badge variant="outline">Unpublished</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {template.category} ·{" "}
            {template.is_official ? "Sendloop official" : "Created by your workspace"}
          </p>
        </div>
        {canManage ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Template actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit ? (
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="mr-2 size-4" /> Edit
                </DropdownMenuItem>
              ) : null}
              {onDuplicate ? (
                <DropdownMenuItem onClick={onDuplicate}>
                  <Copy className="mr-2 size-4" /> Duplicate
                </DropdownMenuItem>
              ) : null}
              {onDelete ? (
                <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                  <Trash2 className="mr-2 size-4" /> Delete
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : onDuplicate ? (
          <Button variant="ghost" size="icon" aria-label="Duplicate to my templates" onClick={onDuplicate}>
            <Copy className="size-4" />
          </Button>
        ) : null}
      </div>

      <p className="mt-3 line-clamp-1 text-sm font-medium">{template.subject || "No subject"}</p>
      <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
        {templatePreview(template.body)}
      </p>

      {template.variables.length ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {template.variables.slice(0, 4).map((v) => (
            <Badge key={v} variant="secondary" className="font-mono text-[10px]">
              {`{{${v}}}`}
            </Badge>
          ))}
          {template.variables.length > 4 ? (
            <Badge variant="secondary" className="text-[10px]">
              +{template.variables.length - 4}
            </Badge>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex gap-2 pt-1">
        <Button size="sm" className="flex-1" onClick={onUse}>
          Use template
        </Button>
        <Button size="sm" variant="outline" onClick={onPreview}>
          <Eye className="mr-1.5 size-4" /> Preview
        </Button>
      </div>
    </article>
  );
}
