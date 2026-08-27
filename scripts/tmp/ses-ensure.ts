import { ensureSesEventPublishing, listSesWebhookEntries, sesEventTopicArn } from "../../src/lib/email-providers/ses-events.server";
console.log("topic env:", sesEventTopicArn());
console.log("ensure:", JSON.stringify(await ensureSesEventPublishing(null)));
console.log("entries:", JSON.stringify(await listSesWebhookEntries(null)));
