import { describe, expect, it } from "vitest";
import { FALLBACK_ANSWER, isAllowedLink, retrieve, sanitizeOutput, shouldOfferTicket } from "@/lib/munchmate/retrieval";

const docs = [
  { key: "a", title: "How warmup works", url: "/help-center/warmup", content: "Warmup gradually raises daily volume for a mailbox." },
  { key: "b", title: "Import leads from CSV", url: "/help-center/import", content: "Open Leads and click Import to upload a CSV file." },
];

describe("MunchMate retrieval", () => {
  it("returns the relevant article for a question", () => {
    expect(retrieve("How does email warmup work?", docs)[0]?.key).toBe("a");
    expect(retrieve("how do I import leads", docs)[0]?.key).toBe("b");
  });
  it("returns nothing for unknown questions so the fallback is used", () => {
    expect(retrieve("What is the weather in Paris?", docs)).toEqual([]);
    expect(shouldOfferTicket("weather", FALLBACK_ANSWER, 0)).toBe(true);
  });
  it("offers a ticket for problems or human requests", () => {
    expect(shouldOfferTicket("my campaign is not working", "ok", 2)).toBe(true);
    expect(shouldOfferTicket("talk to a human", "ok", 2)).toBe(true);
    expect(shouldOfferTicket("how does warmup work", "Warmup raises volume.", 2)).toBe(false);
  });
  it("strips HTML and scripts from AI output", () => {
    expect(sanitizeOutput('<script>alert(1)</script>Hi <b>there</b> <a href="javascript:x">x</a>')).toBe("Hi there x");
  });
  it("only allows MunchReach links", () => {
    expect(isAllowedLink("/pricing")).toBe(true);
    expect(isAllowedLink("https://munchreach.com/blog/x")).toBe(true);
    expect(isAllowedLink("https://evil.com")).toBe(false);
    expect(isAllowedLink("//evil.com")).toBe(false);
    expect(isAllowedLink("javascript:alert(1)")).toBe(false);
  });
});
