import { assertAuthEmailRateLimit, AuthRateLimitError } from "../src/lib/auth-rate-limit.server";
const email = `rl-verify-${Date.now()}@example.com`;
for (let i = 1; i <= 5; i++) {
  try { await assertAuthEmailRateLimit("recovery", email); console.log(`attempt ${i}: allowed`); }
  catch (e) { console.log(`attempt ${i}: BLOCKED ->`, e instanceof AuthRateLimitError ? e.message : (e as Error).message); }
}
const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
const { createHash } = await import("crypto");
const h = createHash("sha256").update(email).digest("hex").slice(0,32);
const del = await supabaseAdmin.from("admin_rate_limits").delete().like("bucket", `%${h}%`);
console.log("cleanup error:", del.error?.message ?? "none");
