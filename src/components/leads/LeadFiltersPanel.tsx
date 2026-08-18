import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LEAD_STATUSES, activeFilterCount, type LeadFilters } from "@/lib/lead-model";

const ANY = "__any__";

export function LeadFiltersPanel({
  filters,
  onChange,
  campaigns,
  tags,
}: {
  filters: LeadFilters;
  onChange: (next: LeadFilters) => void;
  campaigns: Array<{ id: string; name: string }>;
  tags: string[];
}) {
  const patch = (p: Partial<LeadFilters>) => onChange({ ...filters, ...p });
  const count = activeFilterCount(filters);

  return (
    <div className="surface-card space-y-4 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">
          Filters {count > 0 ? <span className="text-muted-foreground">({count} active)</span> : null}
        </p>
        <Button variant="ghost" size="sm" onClick={() => onChange({})} disabled={count === 0}>
          Clear all
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
        <Field label="Name" id="f-name">
          <Input
            id="f-name"
            value={filters.name ?? ""}
            onChange={(e) => patch({ name: e.target.value || undefined })}
          />
        </Field>
        <Field label="Email" id="f-email">
          <Input
            id="f-email"
            value={filters.email ?? ""}
            onChange={(e) => patch({ email: e.target.value || undefined })}
          />
        </Field>
        <Field label="Company" id="f-company">
          <Input
            id="f-company"
            value={filters.company ?? ""}
            onChange={(e) => patch({ company: e.target.value || undefined })}
          />
        </Field>
        <Field label="Job title" id="f-title">
          <Input
            id="f-title"
            value={filters.jobTitle ?? ""}
            onChange={(e) => patch({ jobTitle: e.target.value || undefined })}
          />
        </Field>
        <Field label="Location" id="f-loc">
          <Input
            id="f-loc"
            placeholder="City, region or country"
            value={filters.location ?? ""}
            onChange={(e) => patch({ location: e.target.value || undefined })}
          />
        </Field>
        <Field label="Campaign" id="f-campaign">
          <Select
            value={filters.campaignId ?? ANY}
            onValueChange={(v) => patch({ campaignId: v === ANY ? undefined : v })}
          >
            <SelectTrigger id="f-campaign">
              <SelectValue placeholder="Any campaign" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any campaign</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Created from" id="f-from">
          <Input
            id="f-from"
            type="date"
            value={filters.createdFrom ?? ""}
            onChange={(e) => patch({ createdFrom: e.target.value || undefined })}
          />
        </Field>
        <Field label="Created to" id="f-to">
          <Input
            id="f-to"
            type="date"
            value={filters.createdTo ?? ""}
            onChange={(e) => patch({ createdTo: e.target.value || undefined })}
          />
        </Field>
        <Field label="Custom field" id="f-ckey">
          <Input
            id="f-ckey"
            placeholder="Key"
            value={filters.customKey ?? ""}
            onChange={(e) => patch({ customKey: e.target.value || undefined })}
          />
        </Field>
        <Field label="Custom value" id="f-cvalue">
          <Input
            id="f-cvalue"
            placeholder="Value"
            value={filters.customValue ?? ""}
            onChange={(e) => patch({ customValue: e.target.value || undefined })}
          />
        </Field>
      </div>

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Lead status</Label>
        <div className="flex flex-wrap gap-3">
          {LEAD_STATUSES.map((status) => {
            const checked = filters.statuses?.includes(status.value) ?? false;
            return (
              <label key={status.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(value) => {
                    const current = filters.statuses ?? [];
                    const next = value
                      ? [...current, status.value]
                      : current.filter((s) => s !== status.value);
                    patch({ statuses: next.length ? next : undefined });
                  }}
                />
                {status.label}
              </label>
            );
          })}
        </div>
      </div>

      {tags.length > 0 ? (
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tags</Label>
          <div className="flex flex-wrap gap-3">
            {tags.map((tag) => {
              const checked = filters.tags?.includes(tag) ?? false;
              return (
                <label key={tag} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) => {
                      const current = filters.tags ?? [];
                      const next = value ? [...current, tag] : current.filter((t) => t !== tag);
                      patch({ tags: next.length ? next : undefined });
                    }}
                  />
                  {tag}
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
