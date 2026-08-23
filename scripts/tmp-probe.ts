const url="https://rihgzkofoxcjljlbvbya.supabase.co";
const key=process.env.SB_SERVICE_ROLE_KEY!;
const h={apikey:key,Authorization:`Bearer ${key}`};
const r=await fetch(`${url}/rest/v1/plans?select=id,slug,name,is_active&limit=50`,{headers:h});
console.log(r.status,(await r.text()).slice(0,600));
const r2=await fetch(`${url}/rest/v1/plans?select=billing_type&limit=1`,{headers:h});
console.log("billing_type:",r2.status,(await r2.text()).slice(0,200));
const r3=await fetch(`${url}/rest/v1/rpc/exec_sql`,{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({sql:"select 1"})});
console.log("exec_sql:",r3.status,(await r3.text()).slice(0,200));
