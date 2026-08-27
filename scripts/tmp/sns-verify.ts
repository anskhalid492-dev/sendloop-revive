import { resolveSesCredentials } from "../../src/lib/email-providers/ses-api.server";
import { signAwsRequest } from "../../src/lib/domain-providers/aws-sigv4.server";
const c = resolveSesCredentials(null)!;
const ARN = "arn:aws:sns:us-east-1:267544547500:munchreach-ses-events";
async function sns(action: string) {
  const region = "us-east-1";
  const q = new URLSearchParams({ Action: action, TopicArn: ARN, Version: "2010-03-31" });
  const query = [...q.entries()].map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).sort().join("&");
  const signed = await signAwsRequest({ accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, region, service: "sns", method: "GET", host: `sns.${region}.amazonaws.com`, path: "/", query });
  const r = await fetch(`https://sns.${region}.amazonaws.com/?${query}`, { method: "GET", headers: signed.headers });
  console.log(action, r.status, (await r.text()).slice(0,1200));
}
await sns("GetTopicAttributes");
await sns("ListSubscriptionsByTopic");
