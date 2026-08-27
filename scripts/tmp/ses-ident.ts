import { sesRequest } from "../../src/lib/email-providers/ses-api.server";
const l = await sesRequest<any>(null, "GET", "/v2/email/identities");
console.log(l.status, JSON.stringify(l.json));
