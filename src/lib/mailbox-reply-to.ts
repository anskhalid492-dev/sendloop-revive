import { z } from "zod";

/** One bare address only; never permit display names, lists or header injection. */
export const mailboxReplyToSchema = z.string().refine(value => !/[\r\n]/.test(value), "Enter one valid email address.").transform(value => value.trim().toLowerCase()).pipe(z.string().max(254)
  .refine(value => value === "" || z.string().email().safeParse(value).success, "Enter one valid email address."));

export function withMailboxReplyTo(headers: Record<string, string> | undefined, replyTo: string | null | undefined): Record<string, string> | undefined {
  if (!replyTo) return headers;
  const address = mailboxReplyToSchema.parse(replyTo);
  if (!address) return headers;
  return { ...Object.fromEntries(Object.entries(headers ?? {}).filter(([key]) => key.toLowerCase() !== "reply-to")), "Reply-To": address };
}

/** Cross-mailbox header matching is opt-in and remains inside one workspace. */
export async function replyToAccountScope(
  db: { from: (table: string) => any },
  workspaceId: string | null,
  receivingAccountId: string | null,
  receivingAddress: string,
): Promise<string[]> {
  const ids = receivingAccountId ? [receivingAccountId] : [];
  if (!workspaceId) return ids;
  const { data, error } = await db.from("sending_accounts").select("id")
    .eq("workspace_id", workspaceId).eq("reply_to", receivingAddress.trim().toLowerCase());
  if (error) return ids;
  return [...new Set([...ids, ...(data ?? []).map((row: { id: string }) => row.id)])];
}