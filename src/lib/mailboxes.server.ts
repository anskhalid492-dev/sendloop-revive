// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

/**
 * Picks the sending infrastructure MunchReach routes this mailbox through.
 * Admin-configured pool only; never influenced by customer input.
 */
export async function selectManagedProvider(admin: Client) {
  const { data, error } = await admin
    .from("email_providers")
    .select("id, provider, name")
    .eq("is_enabled", true)
    .order("priority", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { id: string; provider: string; name: string } | null) ?? null;
}

export async function loadVerifiedDomain(client: Client, domainId: string) {
  const { data: domain, error } = await client
    .from("sending_domains")
    .select("id, workspace_id, domain, dns_status, spf_status, dkim_status, dmarc_status, mx_status")
    .eq("id", domainId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!domain) throw new Error("Domain not found");
  if (domain.dns_status !== "verified") {
    throw new Error("Verify this domain's DNS records before connecting a mailbox.");
  }
  return domain;
}

export function assertEmailOnDomain(email: string, domain: string) {
  const host = email.split("@")[1]?.toLowerCase() ?? "";
  if (host !== domain && !host.endsWith(`.${domain}`)) {
    throw new Error(`The email address must be on ${domain}.`);
  }
}

/** Appends a row to the mailbox connection/test history (best effort). */
export async function recordCheck(
  client: Client,
  entry: {
    workspaceId: string;
    accountId: string;
    actorId?: string | null;
    kind: "connect" | "reconnect" | "test" | "send";
    ok: boolean;
    provider?: string | null;
    message?: string | null;
    durationMs?: number | null;
    detail?: Record<string, unknown>;
  },
) {
  try {
    await client.from("sending_account_checks").insert({
      workspace_id: entry.workspaceId,
      sending_account_id: entry.accountId,
      actor_id: entry.actorId ?? null,
      kind: entry.kind,
      ok: entry.ok,
      provider: entry.provider ?? null,
      message: entry.message ?? null,
      duration_ms: entry.durationMs ?? null,
      detail: entry.detail ?? {},
    });
  } catch {
    // History is diagnostic only — never fail the user's action because of it.
  }
}