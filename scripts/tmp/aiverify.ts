import { createClient } from "@supabase/supabase-js";
import { workspaceAiKeys, workspaceAiCredentials } from "../src/lib/ai-keys.server";

const url = "https://rihgzkofoxcjljlbvbya.supabase.co";
const admin = createClient(url, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false },
});
const ws = "99201135-99e0-44e0-8a22-e143c25c5440";
const keys = await workspaceAiKeys(admin, ws);
console.log("providers:", keys.map((k) => `${k.provider}/${k.model}/${k.status}`).join(", "));
for (const p of ["anthropic", "openai", null] as const) {
  const c = await workspaceAiCredentials(admin, ws, p);
  console.log(`preferred=${p ?? "auto"} ->`, c ? `${c.provider}/${c.model}/key:${c.apiKey.length}ch` : "none");
}
