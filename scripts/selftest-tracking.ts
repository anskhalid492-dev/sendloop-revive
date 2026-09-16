/**
 * End-to-end self-test for first-party open + click tracking.
 *
 * Runs REAL sends through the customer relay and REAL pixel/click requests
 * against the running app, then prints the rows the production database actually
 * stored. Everything it creates is named "SELFTEST" so it is obvious in the UI.
 *
 *   TRACK_BASE=http://localhost:8080 bun run scripts/selftest-tracking.ts <step>
 */
import { createClient } from "@supabase/supabase-js";

const APP = process.env["TRACK_BASE"] || "http://localhost:8080";
const db = createClient(
  "https://rihgzkofoxcjljlbvbya.supabase.co",
  process.env["SB_SERVICE_ROLE_KEY"]!,
  { auth: { persistSession: false } },
);

const WORKSPACE = "99201135-99e0-44e0-8a22-e143c25c5440";
const FROM = "support@packologypro.com";
const TO = process.env["SELFTEST_TO"] || "mranuskhalid@gmail.com";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const APPLE_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleMailProxy/1.0";

function log(label: string, value: unknown) {
  console.log(`\n### ${label}`);
  console.log(typeof value === "string" ? value : JSON.stringify(value, null, 1));
}

/** The token is host-independent: a request is replayed against the app under
 * test (localhost) even though the delivered email points at the live domain. */
function localise(url: string): string {
  const parsed = new URL(url);
  const base = new URL(APP);
  parsed.protocol = base.protocol;
  parsed.host = base.host;
  return parsed.toString();
}

async function hit(rawUrl: string, opts: { ua: string; ip?: string }) {
  const url = localise(rawUrl);
  const started = Date.now();


  const res = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: {
      "user-agent": opts.ua,
      ...(opts.ip ? { "cf-connecting-ip": opts.ip } : {}),
    },
  });
  const ms = Date.now() - started;
  return { status: res.status, ms, location: res.headers.get("location"), cache: res.headers.get("cache-control"), type: res.headers.get("content-type"), length: res.headers.get("content-length") };
}

function urlsFrom(html: string) {
  const pixel = html.match(/https?:\/\/[^"']*\/api\/public\/open\?t=[^"']+/)?.[0] ?? null;
  const click = html.match(/https?:\/\/[^"']*\/api\/public\/click\?t=[^"']+/)?.[0] ?? null;
  return {
    pixel: pixel ? pixel.replace(/&amp;/g, "&") : null,
    click: click ? click.replace(/&amp;/g, "&") : null,
  };
}

/* ---------------------------------------------------------------- compose */

async function compose() {
  const { data: account } = await db
    .from("sending_accounts")
    .select("id, from_email")
    .eq("workspace_id", WORKSPACE)
    .eq("from_email", FROM)
    .maybeSingle();
  if (!account) throw new Error(`no sending_accounts row for ${FROM}`);
  const { data: member } = await db
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", WORKSPACE)
    .limit(1)
    .maybeSingle();

  const { composeAndSend } = await import("../src/lib/inbox-compose.server");
  const out = await composeAndSend({
    supabase: db as any,
    userId: member!.user_id as string,
    workspaceId: WORKSPACE,
    sendingAccountId: account.id as string,
    to: TO,
    cc: [],
    bcc: [],
    subject: `SELFTEST tracking ${new Date().toISOString()}`,
    body: `This is an automated MunchReach tracking self-test.\n\nPricing: https://munchreach.com/pricing\n\nIgnore this message.`,
    leadId: null,
    attachments: [],
  });
  log("composeAndSend result", out);

  const { data: row } = await db
    .from("conversation_messages")
    .select("id, workspace_id, conversation_id, to_email, subject, html, open_count, first_opened_at, clicked_at, occurred_at")
    .eq("workspace_id", WORKSPACE)
    .eq("direction", "outbound")
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  log("stored outbound row", { ...row, html: undefined });
  const found = urlsFrom((row?.html as string) ?? "");
  log("tracking URLs inside the delivered HTML", found);
  console.log("MESSAGE_ID=" + row?.id);
  console.log("CONVERSATION_ID=" + row?.conversation_id);
  console.log("PIXEL=" + found.pixel);
  console.log("CLICK=" + found.click);
}

/* ------------------------------------------------------------------- opens */

async function openHits(pixel: string, times: number, ua = BROWSER_UA, ip?: string) {
  for (let i = 0; i < times; i += 1) {
    log(`pixel request ${i + 1}/${times} (${ip ?? "no ip header"})`, await hit(pixel, { ua, ...(ip ? { ip } : {}) }));
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function showConversationOpens(messageId: string) {
  const { data: events } = await db
    .from("email_open_events")
    .select("id, workspace_id, campaign_id, lead_id, message_kind, message_id, recipient_email, occurred_at, is_prefetch, prefetch_source, user_agent, client_ip")
    .eq("message_id", messageId)
    .order("occurred_at");
  log("email_open_events rows", events);
  const genuine = (events ?? []).filter((e: any) => !e.is_prefetch);
  const unique = new Set(genuine.map((e: any) => e.lead_id ?? e.recipient_email ?? e.message_id));
  log("counts", {
    rawRows: events?.length ?? 0,
    genuineOpens: genuine.length,
    applePrefetchOpens: (events?.length ?? 0) - genuine.length,
    uniqueOpeners: unique.size,
  });
  const { data: msg } = await db
    .from("conversation_messages")
    .select("id, open_count, first_opened_at, clicked_at")
    .eq("id", messageId)
    .maybeSingle();
  log("message row after the opens", msg);
}

/* ------------------------------------------------------------------ clicks */

async function clickHit(url: string) {
  log("click request", await hit(url, { ua: BROWSER_UA }));
  const { data } = await db
    .from("email_click_events")
    .select("id, workspace_id, campaign_id, lead_id, message_kind, message_id, recipient_email, url, occurred_at, user_agent")
    .order("occurred_at", { ascending: false })
    .limit(5);
  log("email_click_events rows (newest first)", data);
}

/* ---------------------------------------------------- campaign path (real) */

async function campaignPath() {
  const { data: member } = await db
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", WORKSPACE)
    .limit(1)
    .maybeSingle();
  const createdBy = (member as any).user_id as string;
  const { openPixelUrl } = await import("../src/lib/open-tracking");
  const { clickUrl } = await import("../src/lib/click-tracking");
  const { applyEmailTracking } = await import("../src/lib/email-tracking");

  // Two SELFTEST campaigns: one with open tracking ON, one with it OFF.
  const stamp = new Date().toISOString().slice(0, 16);
  const made: any[] = [];
  for (const [name, open_tracking, text_only] of [
    [`SELFTEST tracking ON ${stamp}`, true, false],
    [`SELFTEST tracking OFF ${stamp}`, false, false],
  ] as const) {
    const { data, error } = await db
      .from("campaigns")
      .insert({
        workspace_id: WORKSPACE,
        name,
        created_by: createdBy,
        status: "draft",
        open_tracking,
        click_tracking: open_tracking,
        text_only,
      })
      .select("id, name, open_tracking, click_tracking, text_only")
      .single();
    if (error) throw new Error(error.message);
    made.push(data);
  }
  log("SELFTEST campaigns created", made);

  const leads: any[] = [];
  for (const email of ["selftest.contact.a@example.com", "selftest.contact.b@example.com"]) {
    const { data, error } = await db
      .from("leads")
      .insert({ workspace_id: WORKSPACE, email, first_name: "SELFTEST", last_name: email.includes(".a@") ? "ContactA" : "ContactB" })
      .select("id, email")
      .single();
    if (error) throw new Error(error.message);
    leads.push(data);
  }
  log("SELFTEST leads created", leads);

  const messages: any[] = [];
  for (const campaign of made) {
    for (const lead of leads) {
      const { data, error } = await db
        .from("campaign_messages")
        .insert({
          workspace_id: WORKSPACE,
          campaign_id: campaign.id,
          lead_id: lead.id,
          to_email: lead.email,
          subject: "SELFTEST",
          body: "SELFTEST body https://munchreach.com/pricing",
          status: "sent",
          sent_at: new Date().toISOString(),
          step_order: 1,
        })
        .select("id, campaign_id, lead_id, to_email")
        .single();
      if (error) throw new Error(error.message);
      messages.push({ ...data, campaignName: campaign.name, open_tracking: campaign.open_tracking });
    }
  }
  log("SELFTEST campaign_messages created", messages);

  // Exactly what dispatch does: the same shared step, with this campaign's own
  // stored switches.
  for (const m of messages) {
    const target = {
      workspaceId: WORKSPACE,
      messageKind: "campaign" as const,
      messageId: m.id,
      campaignId: m.campaign_id,
      leadId: m.lead_id,
      email: m.to_email,
    };
    const html = applyEmailTracking(
      `<html><body><p>SELFTEST</p><p><a href="https://munchreach.com/pricing">Pricing</a></p></body></html>`,
      { target, trackOpens: m.open_tracking, trackClicks: m.open_tracking },
    );
    const plain = applyEmailTracking(null, { target, trackOpens: m.open_tracking, trackClicks: m.open_tracking });
    log(`${m.campaignName} -> ${m.to_email}`, {
      trackingSwitch: m.open_tracking,
      htmlHasPixel: (html ?? "").includes("/api/public/open?t="),
      htmlHasTrackedLink: (html ?? "").includes("/api/public/click?t="),
      plainTextResult: plain,
      pixel: m.open_tracking ? openPixelUrl(target) : null,
      trackedLink: m.open_tracking ? clickUrl(target, "https://munchreach.com/pricing") : null,
    });
  }

  console.log("\nSELFTEST_JSON=" + JSON.stringify({ campaigns: made, leads, messages }));
}

async function adminNumbers(campaignId: string) {
  const { getAdminCampaign } = await import("../src/lib/admin-outreach.server");
  const data: any = await getAdminCampaign(campaignId);
  log("admin campaign stats", data.stats);
  log(
    "admin per-contact rows",
    data.recipients.map((r: any) => ({ email: r.email, openedAt: r.openedAt, openCount: r.openCount, clickedAt: r.clickedAt, clickCount: r.clickCount, unsubscribedAt: r.unsubscribedAt })),
  );
}

/* -------------------------------------------------------------------- main */

/** Rebuilds the exact tracking URLs a stored message was sent with (the token is
 * a pure function of workspace + message + lead + destination). */
async function urlsFor(messageId: string) {
  const { data: row } = await db
    .from("conversation_messages")
    .select("id, workspace_id, to_email, conversation_id")
    .eq("id", messageId)
    .maybeSingle();
  const { data: conv } = await db
    .from("conversations")
    .select("campaign_id, lead_id")
    .eq("id", (row as any).conversation_id)
    .maybeSingle();
  const { applyEmailTracking } = await import("../src/lib/email-tracking");
  const { campaignBodyHtml } = await import("../src/lib/email-html");
  const target = {
    workspaceId: (row as any).workspace_id,
    messageKind: "conversation" as const,
    messageId,
    campaignId: (conv as any)?.campaign_id ?? null,
    leadId: (conv as any)?.lead_id ?? null,
    email: (row as any).to_email,
  };
  const html = applyEmailTracking(
    campaignBodyHtml("This is an automated MunchReach tracking self-test.\n\nPricing: https://munchreach.com/pricing\n\nIgnore this message."),
    { target, trackOpens: true, trackClicks: true },
  );
  log("HTML actually built for this send", html);
  const found = urlsFrom(html ?? "");
  console.log("PIXEL=" + found.pixel);
  console.log("CLICK=" + found.click);
}

async function recipients(campaignId: string, leadIds: string[]) {
  for (const leadId of leadIds) {
    const { error } = await db
      .from("campaign_recipients")
      .insert({ workspace_id: WORKSPACE, campaign_id: campaignId, lead_id: leadId, status: "completed" });
    if (error) console.log("insert error:", error.message);
  }
  log("recipients added", leadIds);
}

async function reply(conversationId: string) {
  const { data: member } = await db
    .from("workspace_members").select("user_id").eq("workspace_id", WORKSPACE).limit(1).maybeSingle();
  const { sendReplyThroughMailbox } = await import("../src/lib/inbox-send.server");
  const out = await sendReplyThroughMailbox({
    supabase: db as any,
    userId: (member as any).user_id,
    conversationId,
    subject: "SELFTEST tracking reply",
    body: "Automated MunchReach reply self-test.\n\nPricing: https://munchreach.com/pricing",
    cc: [],
    attachments: [],
  });
  log("sendReplyThroughMailbox result", out);
}

async function latency(url: string, times: number) {
  const samples: number[] = [];
  for (let i = 0; i < times; i += 1) samples.push((await hit(url, { ua: BROWSER_UA })).ms);
  samples.sort((a, b) => a - b);
  log("endpoint latency (ms)", { samples, min: samples[0], median: samples[Math.floor(samples.length / 2)], max: samples[samples.length - 1] });
}

async function unsubscribe(campaignId: string, email: string) {
  const { unsubscribeUrl } = await import("../src/lib/unsubscribe");
  const url = unsubscribeUrl({ workspaceId: WORKSPACE, campaignId, email });
  log("unsubscribe URL", url);
  log("unsubscribe request", await hit(url, { ua: BROWSER_UA }));
  const { data } = await db
    .from("campaign_unsubscribes")
    .select("id, workspace_id, campaign_id, email, source, created_at")
    .eq("campaign_id", campaignId);
  log("campaign_unsubscribes rows", data);
}

const [step, ...rest] = process.argv.slice(2);

const arg = rest[0] ?? "";

switch (step) {
  case "compose":
    await compose();
    break;
  case "urls":
    await urlsFor(arg);
    break;

  case "open":
    await openHits(arg, Number(rest[1] ?? 1));
    break;
  case "open-apple":
    await openHits(arg, 1, APPLE_UA, "17.58.32.11");
    break;
  case "show-opens":
    await showConversationOpens(arg);
    break;
  case "click":
    await clickHit(arg);
    break;
  case "campaign":
    await campaignPath();
    break;
  case "recipients":
    await recipients(arg, rest.slice(1));
    break;
  case "reply":
    await reply(arg);
    break;
  case "latency":
    await latency(arg, Number(rest[1] ?? 10));
    break;
  case "unsub":
    await unsubscribe(arg, rest[1]!);
    break;
  case "admin":
    await adminNumbers(arg);
    break;
  default:
    console.log("steps: compose | open <pixel> <n> | open-apple <pixel> | show-opens <messageId> | click <url> | campaign | admin <campaignId>");
}
process.exit(0);
