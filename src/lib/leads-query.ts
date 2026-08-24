/**
 * Shared, client-safe lead query helpers.
 *
 * Both the paginated list view and the server-side bulk selection resolve the
 * exact same filter set, so "select all matching" can never target a different
 * population than the rows the customer is looking at.
 */

export type LeadFilterInput = {
  workspaceId?: string | undefined;
  search?: string | undefined;
  listId?: string | undefined;
  name?: string | undefined;
  email?: string | undefined;
  company?: string | undefined;
  jobTitle?: string | undefined;
  location?: string | undefined;
  statuses?: string[] | undefined;
  campaignId?: string | undefined;
  tags?: string[] | undefined;
  createdFrom?: string | undefined;
  createdTo?: string | undefined;
  customKey?: string | undefined;
  customValue?: string | undefined;
};

export function escapeLike(value: string) {
  return value.replace(/[%,()]/g, " ").trim();
}

/** Minimal structural shape of the PostgREST filter builder we rely on. */
type FilterBuilder = {
  eq: (column: string, value: unknown) => FilterBuilder;
  in: (column: string, values: readonly unknown[]) => FilterBuilder;
  contains: (column: string, value: unknown) => FilterBuilder;
  ilike: (column: string, value: string) => FilterBuilder;
  gte: (column: string, value: unknown) => FilterBuilder;
  lte: (column: string, value: unknown) => FilterBuilder;
  or: (filter: string) => FilterBuilder;
};

export function applyLeadFilters<T>(
  builder: T,
  input: LeadFilterInput,
  restrictIds: string[] | null,
): T {
  let query = builder as unknown as FilterBuilder;

  if (input.workspaceId) query = query.eq("workspace_id", input.workspaceId);
  if (input.listId) query = query.eq("list_id", input.listId);
  if (restrictIds) query = query.in("id", restrictIds);
  if (input.statuses?.length) query = query.in("status", input.statuses);
  if (input.tags?.length) query = query.contains("tags", input.tags);
  if (input.email) query = query.ilike("email", `%${escapeLike(input.email)}%`);
  if (input.company) query = query.ilike("company", `%${escapeLike(input.company)}%`);
  if (input.jobTitle) query = query.ilike("job_title", `%${escapeLike(input.jobTitle)}%`);
  if (input.createdFrom) query = query.gte("created_at", input.createdFrom);
  if (input.createdTo) query = query.lte("created_at", `${input.createdTo}T23:59:59`);
  if (input.name) {
    const term = escapeLike(input.name);
    query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
  }
  if (input.location) {
    const term = escapeLike(input.location);
    query = query.or(`city.ilike.%${term}%,state.ilike.%${term}%,country.ilike.%${term}%`);
  }
  if (input.search) {
    const term = escapeLike(input.search);
    query = query.or(
      `email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,company.ilike.%${term}%`,
    );
  }
  if (input.customKey && input.customValue) {
    query = query.contains("custom_fields", { [input.customKey]: input.customValue });
  }

  return query as unknown as T;
}

/* --------------------------------------------------------- selection model */

/** Either an explicit set of ids, or "everything the current filters match". */
export type LeadSelection =
  | { mode: "ids"; ids: string[] }
  | { mode: "all"; excluded: string[] };

export const EMPTY_SELECTION: LeadSelection = { mode: "ids", ids: [] };

export function selectionCount(selection: LeadSelection, matchingTotal: number) {
  return selection.mode === "ids"
    ? selection.ids.length
    : Math.max(0, matchingTotal - selection.excluded.length);
}

export function isSelected(selection: LeadSelection, id: string) {
  return selection.mode === "ids"
    ? selection.ids.includes(id)
    : !selection.excluded.includes(id);
}

export function toggleSelection(
  selection: LeadSelection,
  id: string,
  next: boolean,
): LeadSelection {
  if (selection.mode === "ids") {
    return {
      mode: "ids",
      ids: next ? Array.from(new Set([...selection.ids, id])) : selection.ids.filter((x) => x !== id),
    };
  }
  return {
    mode: "all",
    excluded: next
      ? selection.excluded.filter((x) => x !== id)
      : Array.from(new Set([...selection.excluded, id])),
  };
}
