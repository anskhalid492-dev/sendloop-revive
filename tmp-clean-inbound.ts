import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { cleanInboundText } from "@/lib/inbound-body";

const APPLY = process.env["APPLY"] === "1";
const { data, error } = await db
  .from("conversation_messages")
  .select("id, subject, body")
  .eq("direction", "inbound")
  .limit(5000);
if (error) throw error;
const rows = (data ?? []) as { id: string; subject: string | null; body: string | null }[];
const isRaw = (v: string) =>
  (/^--[A-Za-z0-9'()+_,./:=?-]{6,}\s*$/m.test(v) && /^content-type:/im.test(v)) ||
  /^[A-Za-z0-9+/=\s]{200,}$/.test(v.trim());
let changed = 0, skipped = 0;
for (const r of rows) {
  const body = r.body ?? "";
  if (!body || !isRaw(body)) continue;
  const cleaned = cleanInboundText(body);
  if (!cleaned || cleaned.trim() === body.trim()) { skipped++; console.log("NOCHANGE", r.id, JSON.stringify(body.slice(0, 60))); continue; }
  changed++;
  console.log("FIX", r.id, JSON.stringify(r.subject), "->", JSON.stringify(cleaned.slice(0, 90)));
  if (APPLY) {
    const { error: e } = await db.from("conversation_messages").update({ body: cleaned }).eq("id", r.id);
    if (e) console.log("ERR", r.id, e.message);
  }
}
console.log(JSON.stringify({ scanned: rows.length, changed, skipped, applied: APPLY }));
