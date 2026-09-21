import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const legalRoutes = {
  "/privacy": "src/routes/privacy.tsx",
  "/legal/sending-policy": "src/routes/legal.sending-policy.tsx",
  "/terms": "src/routes/terms.tsx",
  "/refund-policy": "src/routes/refund-policy.tsx",
  "/acceptable-use": "src/routes/acceptable-use.tsx",
  "/cookie-policy": "src/routes/cookie-policy.tsx",
  "/dpa": "src/routes/dpa.tsx",
  "/remove-my-data": "src/routes/remove-my-data.tsx",
  "/compliance": "src/routes/compliance.tsx",
} as const;

const sources = Object.fromEntries(
  Object.entries(legalRoutes).map(([route, path]) => [
    route,
    readFileSync(resolve(process.cwd(), path), "utf8"),
  ]),
);

describe("legal pages", () => {
  it("preserves exactly the nine existing legal route declarations", () => {
    for (const [route, source] of Object.entries(sources)) {
      expect(source).toContain(`createFileRoute(\"${route}\")`);
      expect(source.match(/createFileRoute\(/g)).toHaveLength(1);
    }
  });

  it("uses mailbox-first language across sending-related policies", () => {
    for (const route of ["/legal/sending-policy", "/terms", "/acceptable-use", "/compliance"]) {
      const source = sources[route];
      expect(source).toMatch(/Email Accounts?/);
      expect(source).toMatch(/Mailbox/);
      expect(source).toMatch(/Campaign/);
      expect(source).toMatch(/Recipients?/);
    }
  });

  it("covers the requested customer data categories", () => {
    const privacyAndDpa = `${sources["/privacy"]}\n${sources["/dpa"]}`;
    for (const term of [
      "Workspace",
      "Lead",
      "contact",
      "company information",
      "Campaign",
      "Email Messages",
      "Connected Mailbox",
      "Sending Activity",
      "replies",
      "conversations",
      "Analytics",
      "Billing",
      "Support",
      "Integration",
    ]) {
      expect(privacyAndDpa).toContain(term);
    }
  });

  it("does not expose internal email-delivery provider names", () => {
    const allLegalContent = Object.values(sources).join("\n");
    for (const provider of ["Maileroo", "Resend", "Mailgun", "SendGrid", "Brevo", "Elastic Email", "Bird API", "Nuntly", "uSpeedo"]) {
      expect(allLegalContent).not.toContain(provider);
    }
  });

  it("keeps legal footer destinations unchanged", () => {
    const footer = readFileSync(resolve(process.cwd(), "src/components/site/SiteFooter.tsx"), "utf8");
    for (const route of Object.keys(legalRoutes)) {
      expect(footer).toContain(`href: \"${route}\"`);
    }
  });
});