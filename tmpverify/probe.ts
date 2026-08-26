const url = "https://rihgzkofoxcjljlbvbya.supabase.co";
const key = process.env["SB_SERVICE_ROLE_KEY"]!;
const h = { apikey: key, Authorization: `Bearer ${key}` };
const r = await fetch(`${url}/rest/v1/email_events?select=*&order=created_at.desc&limit=1`, { headers: h });
const rows = await r.json() as any[];
console.log(r.status, Object.keys(rows[0] ?? {}));
const t = await fetch(`${url}/rest/v1/email_events?select=id,event_type,created_at&order=created_at.desc&limit=8`, { headers: h });
console.log((await t.text()).slice(0,900));
