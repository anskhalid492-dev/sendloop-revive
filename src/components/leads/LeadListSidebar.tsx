import { useState } from "react";
import { FolderPlus, List, MoreHorizontal, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  createLeadList,
  deleteLeadList,
  renameLeadList,
  type LeadList,
} from "@/lib/leads.functions";

export function LeadListSidebar({
  lists,
  isLoading,
  totalLeads,
  activeList,
  onSelect,
  workspaceId,
}: {
  lists: LeadList[];
  isLoading: boolean;
  totalLeads: number;
  activeList: string | null;
  onSelect: (id: string | null) => void;
  workspaceId: string | undefined;
}) {
  const queryClient = useQueryClient();
  const createFn = useServerFn(createLeadList);
  const renameFn = useServerFn(renameLeadList);
  const deleteFn = useServerFn(deleteLeadList);

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<LeadList | null>(null);
  const [removing, setRemoving] = useState<LeadList | null>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["lead-lists"] });
    await queryClient.invalidateQueries({ queryKey: ["leads"] });
  };

  const create = useMutation({
    mutationFn: () =>
      createFn({ data: { workspaceId: workspaceId!, name, description: description || undefined } }),
    onSuccess: async (list) => {
      setCreateOpen(false);
      setName("");
      setDescription("");
      await refresh();
      onSelect(list.id);
      toast.success("List created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rename = useMutation({
    mutationFn: () =>
      renameFn({
        data: { id: editing!.id, name, description: description || undefined },
      }),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
      toast.success("List updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (withLeads: boolean) =>
      deleteFn({ data: { id: removing!.id, deleteLeads: withLeads } }),
    onSuccess: async () => {
      const deletedId = removing?.id;
      setRemoving(null);
      await refresh();
      if (activeList === deletedId) onSelect(null);
      toast.success("List deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = lists.filter((l) => l.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <aside className="surface-card flex h-fit flex-col gap-3 p-3 lg:sticky lg:top-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Lead lists
        </p>
        <Button size="sm" variant="ghost" onClick={() => setCreateOpen(true)} disabled={!workspaceId}>
          <FolderPlus className="mr-1.5 size-3.5" /> New
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search lists"
          placeholder="Search lists"
          className="h-8 pl-8 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
          activeList === null ? "bg-secondary font-medium" : "hover:bg-secondary/60",
        )}
      >
        <span className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" /> All leads
        </span>
        <span className="text-xs text-muted-foreground">{totalLeads}</span>
      </button>

      <div className="space-y-0.5">
        {isLoading ? (
          <>
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </>
        ) : filtered.length === 0 ? (
          <p className="px-2.5 py-6 text-center text-xs text-muted-foreground">
            {lists.length === 0 ? "No lists yet — create one to organise prospects." : "No match."}
          </p>
        ) : (
          filtered.map((list) => (
            <div
              key={list.id}
              className={cn(
                "group flex items-center gap-1 rounded-lg pr-1 transition-colors",
                activeList === list.id ? "bg-secondary" : "hover:bg-secondary/60",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(list.id)}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2.5 py-2 text-left text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <List className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{list.name}</span>
                </span>
                <span className="text-xs text-muted-foreground">{list.leadCount}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7" aria-label={`Manage ${list.name}`}>
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => {
                      setEditing(list);
                      setName(list.name);
                      setDescription(list.description ?? "");
                    }}
                  >
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setRemoving(list)}>Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))
        )}
      </div>

      {/* Create / rename */}
      <Dialog
        open={createOpen || editing !== null}
        onOpenChange={(open) => {
          if (open) return;
          setCreateOpen(false);
          setEditing(null);
          setName("");
          setDescription("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Rename list" : "Create list"}</DialogTitle>
            <DialogDescription>
              Lists group prospects so campaigns can target the right audience.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="list-name">Name</Label>
              <Input id="list-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="list-desc">Description</Label>
              <Input
                id="list-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={name.trim().length < 2 || create.isPending || rename.isPending}
              onClick={() => (editing ? rename.mutate() : create.mutate())}
            >
              {editing ? "Save" : "Create list"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete “{removing?.name}”</DialogTitle>
            <DialogDescription>
              Keep the leads in your workspace, or delete them along with the list. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => remove.mutate(false)} disabled={remove.isPending}>
              Delete list only
            </Button>
            <Button
              variant="destructive"
              onClick={() => remove.mutate(true)}
              disabled={remove.isPending}
            >
              Delete list and {removing?.leadCount ?? 0} leads
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
