/**
 * Server-only helpers for the public trust/legal + support pages.
 *
 * Public reads go through the publishable key so only rows a policy marks as
 * published are ever visible. Guest writes (privacy requests, support tickets
 * from the public form) go through the service-role client after validation,
 * because unauthenticated visitors intentionally have no insert grant.
 */
import { publicFaqClient } from "@/lib/faqs.server";

export type Subprocessor = {
  id: string;
  provider: string;
  service: string;
  purpose: string;
  data_processed: string;
  location: string;
  status: string;
  published: boolean;
  sort_order: number;
};

export type GuideArticle = {
  id: string;
  category: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  published: boolean;
  sort_order: number;
};

export type ServiceAlert = {
  id: string;
  alert_type: string;
  title: string;
  message: string;
  starts_at: string;
  ends_at: string | null;
  resolved_at: string | null;
  published: boolean;
};

export type PrivacyRequest = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  request_type: string;
  details: string;
  status: string;
  admin_notes: string | null;
  handled_at: string | null;
  created_at: string;
};

export const SUBPROCESSOR_COLUMNS =
  "id, provider, service, purpose, data_processed, location, status, published, sort_order";
export const GUIDE_COLUMNS =
  "id, category, slug, title, summary, body, published, sort_order";
export const ALERT_COLUMNS =
  "id, alert_type, title, message, starts_at, ends_at, resolved_at, published";

export { publicFaqClient as publicContentClient };
