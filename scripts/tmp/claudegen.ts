import { createClient } from "@supabase/supabase-js";
import { workspaceAiCredentials } from "../../src/lib/ai-keys.server";
import { generatePersonalization } from "../../src/lib/ai-personalization.server";
import { defaultAiConfig } from "../../src/lib/ai-personalization-model";

const admin = createClient(
  "https://rihgzkofoxcjljlbvbya.supabase.co",
  process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
  { auth: { persistSession: false } },
);
const ws = "99201135-99e0-44e0-8a22-e143c25c5440";
const creds = await workspaceAiCredentials(admin, ws, "anthropic");
console.log("routing to:", creds?.provider, creds?.model);
if (!creds) process.exit(1);
// Synthetic lead only — no customer row is read or written.
const lead = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "test@example.com",
  first_name: "Alex",
  last_name: "Doe",
  job_title: "Head of Catering",
  company: "Example Bistro",
  website: "example.com",
  city: "Austin",
  state: "TX",
  country: "US",
  custom_fields: {},
} as never;
const out = await generatePersonalization(defaultAiConfig(), lead, creds);
console.log("model returned:", out.model, "| quality:", out.quality);
console.log("content:", out.content);
