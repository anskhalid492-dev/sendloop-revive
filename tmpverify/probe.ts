const url = "https://rihgzkofoxcjljlbvbya.supabase.co";
const key = process.env["SB_SERVICE_ROLE_KEY"]!;
const h = { apikey: key, Authorization: `Bearer ${key}` };
const r = await fetch(`${url}/rest/v1/email_events?select=id,kind,provider,created_at&order=created_at.desc&limit=10`, { headers: h });
console.log(r.status, (await r.text()).slice(0, 1200));
