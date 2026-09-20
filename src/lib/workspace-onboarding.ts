/**
 * Owner-membership bootstrapping for onboarding.
 *
 * Why this exists: `public.workspaces` has an AFTER INSERT trigger
 * (`ensure_workspace_owner_member`) that already creates the owner row in
 * `workspace_members`. Onboarding used to follow the workspace insert with an
 * `upsert(..., { onConflict: "workspace_id,user_id" })`, which PostgREST sends
 * as `INSERT ... ON CONFLICT DO UPDATE`. Because the row already exists, the
 * statement takes the UPDATE branch and is evaluated against the
 * `members_update_admin` policy, whose USING clause deliberately refuses rows
 * with `role = 'owner'` (owner rows may never be edited from the client). The
 * result was the onboarding failure:
 *   "new row violates row-level security policy (USING expression) for
 *    table workspace_members".
 *
 * The membership row is already correct, so the fix is to never issue an
 * UPDATE: read first, and INSERT only when the trigger did not run (older
 * databases without the trigger). That keeps RLS untouched, stays inside the
 * narrow `members_insert_admin` WITH CHECK (self row + owned workspace), and is
 * idempotent across refreshes, double clicks and races.
 */

export type MembershipError = { message: string; code?: string | null } | null;

type MaybeSingle<T> = Promise<{ data: T | null; error: MembershipError }>;

export interface MembershipRow {
  id: string;
  role: string;
}

/** Narrow structural view of the Supabase client used here. */
export interface MembershipClient {
  from(table: "workspace_members"): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        eq(column: string, value: string): { maybeSingle(): MaybeSingle<MembershipRow> };
      };
    };
    insert(row: Record<string, unknown>): Promise<{ error: MembershipError }>;
  };
}

const UNIQUE_VIOLATION = "23505";

async function readMembership(
  client: MembershipClient,
  workspaceId: string,
  userId: string,
): MaybeSingle<MembershipRow> {
  return client
    .from("workspace_members")
    .select("id, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
}

/**
 * Guarantees the authenticated user has an owner membership for a workspace
 * they own, without ever updating an existing row.
 */
export async function ensureOwnerMembership(
  client: MembershipClient,
  workspaceId: string,
  userId: string,
): Promise<{ created: boolean; membershipId: string | null }> {
  const existing = await readMembership(client, workspaceId, userId);
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return { created: false, membershipId: existing.data.id };

  const { error } = await client
    .from("workspace_members")
    .insert({ workspace_id: workspaceId, user_id: userId, role: "owner" });

  if (error) {
    // Concurrent finish clicks: the other request won the unique key, which is
    // the desired end state.
    if (error.code === UNIQUE_VIOLATION || /duplicate key/i.test(error.message)) {
      const retry = await readMembership(client, workspaceId, userId);
      if (retry.data) return { created: false, membershipId: retry.data.id };
    }
    throw new Error(error.message);
  }

  const confirmed = await readMembership(client, workspaceId, userId);
  return { created: true, membershipId: confirmed.data?.id ?? null };
}
