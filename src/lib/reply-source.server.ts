import { classifyInbound, previewOf } from "@/lib/inbox-model";
import { providerMessageIdCandidates } from "@/lib/provider-message-id";
import { classifyReplySource, type ReplySource } from "@/lib/reply-source";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export type ReplySourceDetails = {
  source: ReplySource;
  fromName: string | null;
  fromEmail: string | null;
  subject: string | null;
  preview: string | null;
  receivedAt: string | null;
  campaignId: string | null;
  campaignName: string | null;
  mailboxEmail: string | null;
  leadId: string | null;
};

/**
 * Read-only source resolution for the latest inbound message of each
 * conversation. Uses the caller's (RLS-scoped) client; never writes.
 */
export async function resolveReplySources(
  db: Db,
  conversationIds: string[],
): Promise<Map<string, ReplySourceDetails>> {
  const out = new Map<string, ReplySourceDetails>();
  const ids = [...new Set(conversationIds.filter(Boolean))];
  if (!ids.length) return out;

  const [{ data: convs }, { data: msgs }] = await Promise.all([
    db.from("conversations").select("id, campaign_id, sending_account_id, lead_id").in("id", ids),
    db
      .from("conversation_messages")
      .select(
        "conversation_id, from_name, from_email, subject, body, occurred_at, campaign_message_id, in_reply_to, reference_ids, sending_account_id",
      )
      .in("conversation_id", ids)
      .eq("direction", "inbound")
      .order("occurred_at", { ascending: false })
      .limit(ids.length * 5),
  ]);

  const latest = new Map<string, Any>();
  for (const m of (msgs ?? []) as Array<Any>) {
    const cid = m.conversation_id as string;
    if (!latest.has(cid)) latest.set(cid, m);
  }

  // Warmup evidence: threading headers matching a warmup job's Message-ID.
  const headerIdsByConv = new Map<string, string[]>();
  const allCandidates = new Set<string>();
  for (const [cid, m] of latest) {
    const c = providerMessageIdCandidates(m.in_reply_to, ...((m.reference_ids as string[] | null) ?? []));
    headerIdsByConv.set(cid, c);
    c.forEach((x) => allCandidates.add(x));
  }
  const warmupIds = new Map<string, string>(); // message id -> sending_account_id
  if (allCandidates.size) {
    const { data: jobs } = await db
      .from("warmup_jobs")
      .select("provider_message_id, sending_account_id")
      .in("provider_message_id", [...allCandidates].slice(0, 300));
    for (const j of (jobs ?? []) as Array<{ provider_message_id: string; sending_account_id: string }>) {
      if (j.provider_message_id) warmupIds.set(j.provider_message_id, j.sending_account_id);
    }
  }

  const convById = new Map<string, Any>();
  for (const c of (convs ?? []) as Array<Any>) convById.set(c.id as string, c);

  const campaignIds = new Set<string>();
  const accountIds = new Set<string>();
  for (const c of convById.values()) {
    if (c.campaign_id) campaignIds.add(c.campaign_id as string);
    if (c.sending_account_id) accountIds.add(c.sending_account_id as string);
  }
  for (const id of warmupIds.values()) if (id) accountIds.add(id);

  const [{ data: camps }, { data: accts }] = await Promise.all([
    campaignIds.size
      ? db.from("campaigns").select("id, name").in("id", [...campaignIds])
      : Promise.resolve({ data: [] }),
    accountIds.size
      ? db.from("sending_accounts").select("id, from_email").in("id", [...accountIds])
      : Promise.resolve({ data: [] }),
  ]);
  const campName = new Map<string, string>((camps ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
  const acctEmail = new Map<string, string>(
    (accts ?? []).map((a: { id: string; from_email: string }) => [a.id, a.from_email]),
  );

  for (const cid of ids) {
    const c = convById.get(cid);
    const m = latest.get(cid);
    if (!c || !m) continue;
    const warmupAccount = (headerIdsByConv.get(cid) ?? []).map((x) => warmupIds.get(x)).find(Boolean) ?? null;
    const body = (m?.body as string | null) ?? "";
    const subject = (m?.subject as string | null) ?? null;
    const source = classifyReplySource({
      campaignMessageId: (m?.campaign_message_id as string | null) ?? null,
      warmupMatched: Boolean(warmupAccount),
      isAutoReply: m ? classifyInbound(subject ?? "", body) === "ooo" : false,
    });
    const campaignId = source === "campaign_reply" ? ((c.campaign_id as string | null) ?? null) : null;
    const accountId =
      warmupAccount ?? (m?.sending_account_id as string | null) ?? (c.sending_account_id as string | null) ?? null;
    out.set(cid, {
      source,
      fromName: (m?.from_name as string | null) ?? null,
      fromEmail: (m?.from_email as string | null) ?? null,
      subject,
      preview: m ? previewOf(body, 140) || null : null,
      receivedAt: (m?.occurred_at as string | null) ?? null,
      campaignId,
      campaignName: campaignId ? (campName.get(campaignId) ?? null) : null,
      mailboxEmail: accountId ? (acctEmail.get(accountId) ?? null) : null,
      leadId: source === "campaign_reply" ? ((c.lead_id as string | null) ?? null) : null,
    });
  }
  return out;
}
