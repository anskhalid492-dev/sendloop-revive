import { resolveSesCredentials, sesRequest } from "../../src/lib/email-providers/ses-api.server";
import { signAwsRequest } from "../../src/lib/domain-providers/aws-sigv4.server";

const NEW_ARN = "arn:aws:sns:us-east-1:267544547500:munchreach-ses-events";
const c = resolveSesCredentials(null);
console.log("1 creds:", !!c, "2 region:", c?.region);
const acct = await sesRequest<any>(null, "GET", "/v2/email/account");
console.log("account:", acct.status, JSON.stringify(acct.json?.SendQuota), "prod:", acct.json?.ProductionAccessEnabled);
const cs = await sesRequest<any>(null, "GET", "/v2/email/configuration-sets/munchreach-events");
console.log("3 configset:", cs.status, cs.detail.slice(0,200));
const ed = await sesRequest<any>(null, "GET", "/v2/email/configuration-sets/munchreach-events/event-destinations");
console.log("4 destinations:", ed.status, JSON.stringify(ed.json).slice(0,600));

async function sns(action: string, params: Record<string,string>) {
  const region = "us-east-1";
  const body = new URLSearchParams({ Action: action, Version: "2010-03-31", ...params }).toString();
  const signed = await signAwsRequest({ accessKeyId: c!.accessKeyId, secretAccessKey: c!.secretAccessKey, region, service: "sns", method: "POST", host: `sns.${region}.amazonaws.com`, path: "/", body, headers: { "content-type": "application/x-www-form-urlencoded" } as any });
  const r = await fetch(signed.url, { method: "POST", headers: signed.headers, body: signed.body });
  return { status: r.status, text: (await r.text()).slice(0, 1500) };
}
console.log("5 topic:", JSON.stringify(await sns("GetTopicAttributes", { TopicArn: NEW_ARN })));
console.log("6 subs:", JSON.stringify(await sns("ListSubscriptionsByTopic", { TopicArn: NEW_ARN })));
