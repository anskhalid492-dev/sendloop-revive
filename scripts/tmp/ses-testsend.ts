import { sendSesEmail } from "../../src/lib/email-providers/ses-send.server";
const r = await sendSesEmail(null as any, {
  to: "mranuskhalid@gmail.com",
  fromEmail: "notifications@munchreach.com",
  fromName: "MunchReach",
  subject: "MunchReach SES production verification (Phase 9F)",
  text: "Controlled single test send through Amazon SES. No action needed.",
  html: "<p>Controlled single test send through Amazon SES. No action needed.</p>",
  headers: { "Message-ID": "<should-be-stripped@munchreach.com>", "X-MunchReach-Test": "phase-9f" },
} as any);
console.log(JSON.stringify(r, null, 2));
