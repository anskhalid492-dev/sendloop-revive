import { useCallback, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getMyWorkspaces, type Workspace } from "@/lib/workspaces.functions";

const STORAGE_KEY = "sendloop-workspace";
const listeners = new Set<() => void>();
let selectedId: string | null = null;
let hydrated = false;

function readStored() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

function subscribe(listener: () => void) {
  if (!hydrated) {
    hydrated = true;
    selectedId = readStored();
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((l) => l());
}

/** Selected workspace id, shared across every component in the app. */
export function useSelectedWorkspaceId() {
  return useSyncExternalStore(
    subscribe,
    () => selectedId,
    () => null,
  );
}

/**
 * The workspace the user is actually working in.
 *
 * `useSelectedWorkspaceId` is null until the user picks a workspace in the
 * switcher, so components must not use it as their workspace scope: they would
 * render a permanently disabled UI for anyone who never touched the switcher.
 * This resolves the stored selection and falls back to the first workspace the
 * user is a member of, exactly like `useWorkspace()`.
 */
export function useActiveWorkspaceId(): string | null {
  const { workspace } = useWorkspace();
  return workspace?.id ?? null;
}

export function useWorkspace() {
  const queryClient = useQueryClient();
  const fetchWorkspaces = useServerFn(getMyWorkspaces);
  const query = useQuery({ queryKey: ["workspaces"], queryFn: () => fetchWorkspaces() });
  const stored = useSelectedWorkspaceId();

  const workspaces: Workspace[] = query.data ?? [];
  const workspace = workspaces.find((w) => w.id === stored) ?? workspaces[0] ?? null;

  const selectWorkspace = useCallback(
    (id: string) => {
      window.localStorage.setItem(STORAGE_KEY, id);
      selectedId = id;
      emit();
      // Every workspace-scoped query keys off the workspace id, so drop the
      // cached data of the previous workspace instead of showing stale rows.
      void queryClient.invalidateQueries();
    },
    [queryClient],
  );

  return {
    workspace,
    workspaces,
    selectWorkspace,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
