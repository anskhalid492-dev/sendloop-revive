import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type {
  AdminCampaignRow,
  AdminCampaignFilters,
  AdminLeadFilters,
  AdminAccountFilters,
} from "./admin-outreach.server";

const uuid = z.string().uuid();
const text = z.string().max(200).optional().nullable();

const campaignFilters = z.object({
  workspaceId: uuid.optional().nullable(),
  status: text,
  sendingAccountId: uuid.optional().nullable(),
  from: z.string().optional().nullable(),
  to: z.string().optional().nullable(),
  search: text,
});

const leadFilters = z.object({
  workspaceId: uuid.optional().nullable(),
  campaignId: uuid.optional().nullable(),
  listId: uuid.optional().nullable(),
  status: text,
  search: text,
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(200).optional(),
  sort: z.enum(["created_at", "last_activity_at", "email", "company"]).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
});

const accountFilters = z.object({
  workspaceId: uuid.optional().nullable(),
  provider: text,
  status: text,
  warmup: text,
  search: text,
});

const domainFilters = z.object({
  workspaceId: uuid.optional().nullable(),
  status: text,
  search: text,
});

/** Shared workspace/campaign/list/mailbox options for the outreach filter bars. */
export const adminOutreachFilters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { adminOutreachFilterOptions } = await import("./admin-outreach.server");
    return adminOutreachFilterOptions();
  });

/** Every campaign across every workspace with real delivery metrics. */
export const adminListCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => campaignFilters.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { listAdminCampaigns } = await import("./admin-outreach.server");
    return listAdminCampaigns(data);
  });

/** Full campaign detail: sequence, recipients, mailboxes, errors and activity. */
export const adminGetCampaign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ campaignId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { getAdminCampaign } = await import("./admin-outreach.server");
    return getAdminCampaign(data.campaignId);
  });

/** Pause, resume or stop a customer campaign. Never force-sends. */
export const adminCampaignControl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ campaignId: uuid, action: z.enum(["pause", "resume", "stop"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { adminCampaignAction } = await import("./admin-outreach.server");
    return adminCampaignAction(context.userId, data.campaignId, data.action);
  });

/** Platform-wide lead directory, paginated and workspace-labelled. */
export const adminListLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => leadFilters.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { listAdminLeads } = await import("./admin-outreach.server");
    return listAdminLeads(data);
  });

/** One contact with campaign history, emails, replies, notes and tasks. */
export const adminGetLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leadId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { getAdminLead } = await import("./admin-outreach.server");
    return getAdminLead(data.leadId);
  });

/** Every connected mailbox with connection, warmup and volume state. */
export const adminListEmailAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => accountFilters.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { listAdminEmailAccounts } = await import("./admin-outreach.server");
    return listAdminEmailAccounts(data);
  });

/** Mailbox detail: auth records, warmup progress, checks, errors and activity. */
export const adminGetEmailAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ accountId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { getAdminEmailAccount } = await import("./admin-outreach.server");
    return getAdminEmailAccount(data.accountId);
  });

/** Enable or disable a mailbox for sending. */
export const adminSetEmailAccountEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ accountId: uuid, enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { adminSetAccountEnabled } = await import("./admin-outreach.server");
    return adminSetAccountEnabled(context.userId, data.accountId, data.enabled);
  });

/** Run the real provider connection test for a mailbox. */
export const adminTestEmailAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ accountId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { adminTestAccountConnection } = await import("./admin-outreach.server");
    return adminTestAccountConnection(context.userId, data.accountId);
  });

/** Every sending domain with DNS state and linked mailbox counts. */
export const adminListDomains = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => domainFilters.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { listAdminDomains } = await import("./admin-outreach.server");
    return listAdminDomains(data);
  });

/** Domain detail with required DNS records, mailboxes and alerts. */
export const adminGetDomain = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ domainId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { getAdminDomain } = await import("./admin-outreach.server");
    return getAdminDomain(data.domainId);
  });

/** Re-run live DNS verification for a domain. Never edits customer DNS. */
export const adminRecheckDomainDns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ domainId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { adminRecheckDomain } = await import("./admin-outreach.server");
    return adminRecheckDomain(context.userId, data.domainId);
  });

/** Warmup status for every mailbox that has warmup configured. */
export const adminListWarmup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => domainFilters.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { listAdminWarmup } = await import("./admin-outreach.server");
    return listAdminWarmup(data);
  });

/** Warmup detail: settings, daily volume history, jobs, events and health. */
export const adminGetWarmup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ accountId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { getAdminWarmupAccount } = await import("./admin-outreach.server");
    return getAdminWarmupAccount(data.accountId);
  });

/** Start, pause, resume or stop warmup for a mailbox. */
export const adminWarmupControl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ accountId: uuid, action: z.enum(["start", "pause", "resume", "stop"]) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { adminWarmupAction } = await import("./admin-outreach.server");
    return adminWarmupAction(context.userId, data.accountId, data.action);
  });
