/** Shared, client-safe types and helpers for the Sendloop template library. */

import { usedVariables } from "@/lib/campaign-model";


export const TEMPLATE_CATEGORIES = [
  "Cold Outreach",
  "Follow-Ups",
  "SaaS",
  "Agencies",
  "Sales",
  "Recruiting",
  "Lead Generation",
  "Partnership",
  "Breakup",
  "Referral",
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export type EmailTemplateRow = {
  id: string;
  workspace_id: string | null;
  is_official: boolean;
  name: string;
  category: string;
  description: string | null;
  subject: string;
  body: string;
  variables: string[];
  featured: boolean;
  published: boolean;
  display_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const TEMPLATE_COLUMNS =
  "id, workspace_id, is_official, name, category, description, subject, body, variables, featured, published, display_order, created_by, created_at, updated_at";

/** Pull `{{ variable }}` names out of a subject/body pair (shared parser). */
export function extractTemplateVariables(...parts: string[]): string[] {
  return [...new Set(parts.flatMap((part) => usedVariables(part)))];
}


export function templatePreview(body: string, length = 160): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length)}…` : flat;
}

export type PendingTemplate = { name: string; subject: string; body: string };

const PENDING_KEY = "sendloop:pending-template";

export function stashPendingTemplate(template: PendingTemplate) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(template));
}

export function takePendingTemplate(): PendingTemplate | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(PENDING_KEY);
  try {
    return JSON.parse(raw) as PendingTemplate;
  } catch {
    return null;
  }
}
