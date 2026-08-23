const url="https://rihgzkofoxcjljlbvbya.supabase.co";
const key=process.env.SB_SERVICE_ROLE_KEY!;
const h={apikey:key,Authorization:`Bearer ${key}`};
const r=await fetch(`${url}/rest/v1/plans?select=*&slug=eq.starter`,{headers:h});
console.log(JSON.stringify(JSON.parse(await r.text())[0],null,1));
