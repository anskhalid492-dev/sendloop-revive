import { evaluateDomainReadiness } from "../../src/lib/domain-readiness.server";
const r = await evaluateDomainReadiness({ provider: "resend", domain: "smartoutreach.digital" });
console.log(JSON.stringify({ state: r.state, mx: r.mx, records: r.records.map(x=>({t:x.type,h:x.host,f:x.fqdn,v:x.value,p:x.priority,k:x.kind})) }, null, 1));
