import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Eye,
  Loader2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Rocket,
  Save,
  Send,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { LaunchReadinessBar } from "./LaunchReadinessBar";
import type { CampaignBuilder } from "./useCampaignBuilder";

export const CAMPAIGN_TABS = [
  "Overview",
  "Leads",
  "Sequences",
  
  "Schedule",
  "Email Accounts",
  "Options",
  "Queue",
  "Analytics",
  "Settings",
] as const;

export type CampaignTab = (typeof CAMPAIGN_TABS)[number];

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  scheduled: "bg-sky-500/10 text-sky-700 border-sky-500/20",
  active: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  paused: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  completed: "bg-primary/10 text-primary border-primary/20",
  archived: "bg-muted text-muted-foreground border-border",
};

export function CampaignHeader({
  builder,
  tab,
  onTabChange,
  onPreview,
  onTest,
  onLaunch,
  onDuplicate,
  onArchive,
}: {
  builder: CampaignBuilder;
  tab: CampaignTab;
  onTabChange: (tab: CampaignTab) => void;
  onPreview: () => void;
  onTest: () => void;
  onLaunch: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
}) {
  const {
    campaign,
    settings,
    patchSettings,
    save,
    dirty,
    savedAt,
    toggleStatus,
    readiness,
    readinessLoading,
    launch,
  } = builder;
  const [editingName, setEditingName] = useState(false);

  if (!campaign || !settings) return null;
  const status = campaign.status;

  return (
    <div className="-mx-4 border-b border-border bg-background/80 px-4 backdrop-blur md:-mx-6 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4 pt-1">
        <div className="min-w-0 flex-1">
          <Button variant="ghost" size="sm" className="-ml-2 h-7 px-2 text-muted-foreground" asChild>
            <Link to="/campaigns">
              <ArrowLeft className="mr-1.5 size-3.5" /> Back to campaigns
            </Link>
          </Button>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {editingName ? (
              <Input
                autoFocus
                aria-label="Campaign name"
                className="h-9 w-72 text-lg font-semibold"
                value={settings.name}
                onChange={(e) => patchSettings({ name: e.target.value })}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="group flex items-center gap-2 text-left text-xl font-semibold tracking-tight"
              >
                {settings.name}
                <Pencil className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}
            <Badge variant="outline" className={cn("capitalize", STATUS_STYLES[status])}>
              {status}
            </Badge>
            {settings.tags.map((t) => (
              <Badge key={t} variant="secondary" className="font-normal">
                {t}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 hidden text-xs text-muted-foreground sm:inline">
            {save.isPending ? (
              "Saving…"
            ) : dirty ? (
              "Unsaved changes"
            ) : savedAt ? (
              <span className="inline-flex items-center gap-1">
                <Check className="size-3" /> Saved {savedAt.toLocaleTimeString()}
              </span>
            ) : null}
          </span>
          <Button variant="outline" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 size-3.5" />
            )}
            Save
          </Button>
          <Button variant="outline" size="sm" onClick={onPreview}>
            <Eye className="mr-1.5 size-3.5" /> Preview
          </Button>
          <Button variant="outline" size="sm" onClick={onTest}>
            <Send className="mr-1.5 size-3.5" /> Send test
          </Button>
          {status === "active" ? (
            <Button size="sm" variant="secondary" onClick={() => toggleStatus.mutate("paused")}>
              <Pause className="mr-1.5 size-3.5" /> Pause campaign
            </Button>
          ) : status === "paused" ? (
            <Button size="sm" onClick={() => toggleStatus.mutate("active")}>
              <Play className="mr-1.5 size-3.5" /> Resume campaign
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onLaunch}
              disabled={launch.isPending || (!!readiness && !readiness.ready)}
              title={readiness && !readiness.ready ? readiness.issues[0]?.message : undefined}
            >
              {launch.isPending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Rocket className="mr-1.5 size-3.5" />
              )}
              Launch campaign
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="More actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onDuplicate}>Duplicate campaign</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onTabChange("Analytics")}>
                View analytics
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onArchive}>Archive campaign</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {status === "draft" || status === "scheduled" ? (
        <LaunchReadinessBar
          readiness={readiness}
          loading={readinessLoading}
          dirty={dirty}
          className="mt-3"
        />
      ) : null}

      <nav className="mt-4 flex gap-1 overflow-x-auto" aria-label="Campaign sections">
        {CAMPAIGN_TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onTabChange(item)}
            aria-current={tab === item ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === item
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item}
          </button>
        ))}
      </nav>
    </div>
  );
}
