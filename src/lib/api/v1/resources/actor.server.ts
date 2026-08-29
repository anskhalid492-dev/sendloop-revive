/**
 * Which user "performs" an API-key action.
 *
 * Several tables require a `created_by` member. An API key is not a user, so we
 * attribute the action to the member who created the key, falling back to the
 * workspace owner if that member has since been removed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const cache = new Map<string, string>();

export async function resolveActor(
  admin: Admin,
  workspaceId: string,
  createdBy: string | null,
): Promise<string> {
  if (createdBy) return createdBy;
  const cached = cache.get(workspaceId);
  if (cached) return cached;

  const { data } = await admin
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  const owner = (data?.user_id as string | undefined) ?? "";
  if (owner) cache.set(workspaceId, owner);
  return owner;
}
