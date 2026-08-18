import { Link } from "@tanstack/react-router";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/hooks/useWorkspace";

export function WorkspaceSwitcher() {
  const { workspace, workspaces, selectWorkspace, isLoading } = useWorkspace();

  if (isLoading) {
    return <div className="h-9 w-40 animate-pulse rounded-md bg-muted" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-52 justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <Building2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{workspace?.name ?? "No workspace"}</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} onSelect={() => selectWorkspace(w.id)}>
            <span className="flex-1 truncate">{w.name}</span>
            {workspace?.id === w.id ? <Check className="size-4 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/onboarding">
            <Plus className="size-4" /> Create workspace
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
