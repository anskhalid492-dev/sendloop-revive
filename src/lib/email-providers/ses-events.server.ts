/**
 * Amazon SES event publishing configuration (Configuration Set + SNS
 * event destination).
 *
 * This is the ONLY place that knows how SES delivers delivery/bounce/complaint
 * /reject/delay events. It configures:
 *
 *   SES -> Configuration Set -> SNS event destination -> SNS topic ->
 *   existing MunchReach webhook endpoint (`/api/public/inbound/email`)
 *
 * The SNS topic itself lives on the MunchReach AWS account and is supplied via
 * a server-side secret; nothing here is customer-specific and no separate
 * SES-only tracking system is created.
 *
 * Server-only.
 */
import { sesRequest } from "./ses-api.server";
import { INBOUND_WEBHOOK_PATH } from "./webhook-status.server";
import type { EmailProviderCredentials, UnifiedWebhookEntry } from "./types";

/**
 * SES event types MunchReach's provider-neutral processor understands.
 *
 * OPEN and CLICK are included so engagement analytics receive real provider
 * signals as soon as tracking is in place — without them SES publishes no open
 * event at all and the open rate could only ever read 0%.
 */
export const SES_EVENT_TYPES = [
  "SEND",
  "DELIVERY",
  "BOUNCE",
  "COMPLAINT",
  "REJECT",
  "DELIVERY_DELAY",
  "RENDERING_FAILURE",
  "OPEN",
  "CLICK",
] as const;

export const SES_EVENT_DESTINATION_NAME = "munchreach-sns-events";

/** Configuration set used for campaign sending; unset means events are off. */
export function sesConfigurationSetName(): string | null {
  return (process.env["AWS_SES_CONFIGURATION_SET"] ?? "").trim() || null;
}

/** SNS topic the configuration set publishes events to. */
export function sesEventTopicArn(): string | null {
  return (process.env["AWS_SES_EVENT_TOPIC_ARN"] ?? "").trim() || null;
}

/** Absolute URL of the existing provider-neutral webhook endpoint. */
export function inboundWebhookUrl(): string {
  const base = (
    process.env["PUBLIC_APP_URL"] ??
    process.env["APP_URL"] ??
    process.env["VITE_APP_URL"] ??
    "https://munchreach.com"
  ).replace(/\/+$/, "");
  return `${base}${INBOUND_WEBHOOK_PATH}`;
}

type SesEventDestination = {
  Name?: string;
  Enabled?: boolean;
  MatchingEventTypes?: string[];
  SnsDestination?: { TopicArn?: string };
};

const setPath = (name: string) => `/v2/email/configuration-sets/${encodeURIComponent(name)}`;

export async function getSesEventDestinations(
  creds?: EmailProviderCredentials | null,
): Promise<{ ok: boolean; status: number; destinations: SesEventDestination[]; detail: string }> {
  const name = sesConfigurationSetName();
  if (!name) {
    return { ok: false, status: 0, destinations: [], detail: "Event publishing is not configured." };
  }
  const res = await sesRequest<{ EventDestinations?: SesEventDestination[] }>(
    creds,
    "GET",
    `${setPath(name)}/event-destinations`,
  );
  return {
    ok: res.ok,
    status: res.status,
    destinations: res.json?.EventDestinations ?? [],
    detail: res.detail,
  };
}

/** Creates the configuration set and its SNS event destination when missing. */
export async function ensureSesEventPublishing(
  creds?: EmailProviderCredentials | null,
): Promise<{ ok: boolean; detail: string }> {
  const name = sesConfigurationSetName();
  const topicArn = sesEventTopicArn();
  if (!name) return { ok: false, detail: "Event publishing is not configured." };
  if (!topicArn) return { ok: false, detail: "Event notification topic is not configured." };

  const existing = await sesRequest<unknown>(creds, "GET", setPath(name));
  if (!existing.ok) {
    if (existing.status !== 404) return { ok: false, detail: existing.detail };
    const created = await sesRequest<unknown>(creds, "POST", "/v2/email/configuration-sets", {
      ConfigurationSetName: name,
    });
    if (!created.ok && created.status !== 409) return { ok: false, detail: created.detail };
  }

  const destination = {
    Enabled: true,
    MatchingEventTypes: [...SES_EVENT_TYPES],
    SnsDestination: { TopicArn: topicArn },
  };

  const current = await getSesEventDestinations(creds);
  const found = current.destinations.find((d) => d.Name === SES_EVENT_DESTINATION_NAME);
  const res = found
    ? await sesRequest<unknown>(
        creds,
        "PUT",
        `${setPath(name)}/event-destinations/${encodeURIComponent(SES_EVENT_DESTINATION_NAME)}`,
        { EventDestination: destination },
      )
    : await sesRequest<unknown>(creds, "POST", `${setPath(name)}/event-destinations`, {
        EventDestinationName: SES_EVENT_DESTINATION_NAME,
        EventDestination: destination,
      });

  if (!res.ok && res.status !== 409) return { ok: false, detail: res.detail };
  return { ok: true, detail: "Delivery event publishing is configured." };
}

/**
 * Reports event publishing in the provider-neutral webhook shape the readiness
 * panel reads. The endpoint is the MunchReach webhook URL the SNS topic
 * delivers to, so a configured + enabled destination reads as connected.
 */
export async function listSesWebhookEntries(
  creds?: EmailProviderCredentials | null,
): Promise<UnifiedWebhookEntry[]> {
  const name = sesConfigurationSetName();
  const topicArn = sesEventTopicArn();
  if (!name || !topicArn) return [];

  const current = await getSesEventDestinations(creds);
  if (!current.ok) return [];

  return current.destinations
    .filter((d) => (d.SnsDestination?.TopicArn ?? "") === topicArn)
    .map((d) => ({
      id: d.Name ?? SES_EVENT_DESTINATION_NAME,
      endpoint: inboundWebhookUrl(),
      status: d.Enabled ? "enabled" : "disabled",
      events: d.MatchingEventTypes ?? [],
    }));
}

/**
 * Points the configuration set at the customer's verified tracking domain.
 *
 * SES only emits OPEN/CLICK events for mail sent through a configuration set,
 * and the redirect/pixel links must live on a domain the recipient trusts. This
 * is called once a tracking CNAME has actually verified — never before, so a
 * broken redirect domain can never be published.
 */
export async function ensureSesTrackingOptions(
  creds: EmailProviderCredentials | null | undefined,
  trackingDomain: string,
): Promise<{ ok: boolean; detail: string }> {
  const name = sesConfigurationSetName();
  if (!name) return { ok: false, detail: "Event publishing is not configured." };
  const host = trackingDomain.trim().toLowerCase();
  if (!host) return { ok: false, detail: "No tracking hostname to configure." };

  const res = await sesRequest<unknown>(creds, "PUT", `${setPath(name)}/tracking-options`, {
    CustomRedirectDomain: host,
  });
  if (!res.ok && res.status !== 409) return { ok: false, detail: res.detail };
  return { ok: true, detail: "Open and click tracking is active for this domain." };
}
