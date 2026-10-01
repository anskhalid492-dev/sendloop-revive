import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { updateCampaign } from "@/lib/campaigns.functions";

/** Inline category editor. Category is stored as the campaign's tags. */
export function CategoryPopover({ campaignId, category }: { campaignId: string; category: string }) {
  const queryClient = useQueryClient();
  const updateFn = useServerFn(updateCampaign);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(category);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const name = value.trim().slice(0, 40);
    setSaving(true);
    try {
      await updateFn({ data: { id: campaignId, tags: name ? [name] : [] } });
      toast.success(name ? "Category saved" : "Category removed");
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save category");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(category);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-0.5 hover:text-primary ${category ? "" : "text-primary/80"}`}
        >
          {category ? (
            category
          ) : (
            <>
              <Plus className="size-3" /> Add category
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="start">
        <div className="space-y-1.5">
          <Label htmlFor={`cat-${campaignId}`}>Category</Label>
          <Input
            id={`cat-${campaignId}`}
            value={value}
            maxLength={40}
            autoFocus
            placeholder="e.g. Agencies, SaaS founders"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
