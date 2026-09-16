import { describe, expect, it } from "vitest";
import {
  bouncedRecipient,
  extractDisplayName,
  extractEmail,
  looksLikeBounce,
  splitReferences,
} from "@/lib/mailbox-inbound-classify";
import { inboundFromRelayMessage } from "@/lib/mailbox-imap-poll.server";

describe("inbound classification for self-connected mailboxes", () => {
  it("reads the address and display name out of a From header", () => {
    expect(extractEmail('"Anus Khalid" <Anus@Example.com>')).toBe("anus@example.com");
    expect(extractDisplayName('"Anus Khalid" <anus@example.com>')).toBe("Anus Khalid");
    expect(extractDisplayName("anus@example.com")).toBeNull();
  });

  it("splits a References header into ids", () => {
    expect(splitReferences("<a@x> <b@y>")).toEqual(["<a@x>", "<b@y>"]);
    expect(splitReferences(null)).toEqual([]);
  });

  it("detects bounce senders and bounce subjects", () => {
    expect(looksLikeBounce({ from: "Mail Delivery Subsystem <x@y>", subject: "hi" })).toBe(true);
    expect(looksLikeBounce({ from: "mailer-daemon@example.com", subject: "hi" })).toBe(true);
    expect(looksLikeBounce({ from: "postmaster@example.com", subject: "hi" })).toBe(true);
    expect(looksLikeBounce({ from: "a@b.c", subject: "Undelivered Mail Returned to Sender" })).toBe(true);
    expect(looksLikeBounce({ from: "a@b.c", subject: "Delivery Status Notification (Failure)" })).toBe(true);
    expect(looksLikeBounce({ from: "a@b.c", subject: "Mail delivery failed" })).toBe(true);
    expect(looksLikeBounce({ from: "a@b.c", subject: "Returned mail: see transcript" })).toBe(true);
  });

  it("treats a genuine prospect reply as a reply", () => {
    expect(looksLikeBounce({ from: "Jane <jane@acme.com>", subject: "Re: quick question" })).toBe(false);
  });

  it("takes the failed recipient from the delivery report", () => {
    const text = [
      "This is the mail system at host mail.example.com.",
      "",
      "Final-Recipient: rfc822; prospect@acme.com",
      "Action: failed",
      "Status: 5.1.1",
    ].join("\r\n");
    expect(bouncedRecipient({ text, subject: "Undelivered Mail", mailbox: "michael@agency.com" })).toBe(
      "prospect@acme.com",
    );
  });

  it("falls back to the first address in the report that is not the mailbox itself", () => {
    const text = "Your message to prospect@acme.com could not be delivered.";
    expect(
      bouncedRecipient({ text, subject: null, mailbox: "michael@agency.com" }),
    ).toBe("prospect@acme.com");
  });

  it("never returns the reporting machinery or the mailbox itself", () => {
    const text = "From: MAILER-DAEMON@agency.com\r\nTo: michael@agency.com\r\n";
    expect(bouncedRecipient({ text, subject: null, mailbox: "michael@agency.com" })).toBeNull();
  });

  it("maps a relay message onto the Unified Inbox ingestion shape", () => {
    const inbound = inboundFromRelayMessage(
      {
        uid: 42,
        messageId: "<reply@acme.com>",
        inReplyTo: "<sent@agency.com>",
        references: "<sent@agency.com> <older@agency.com>",
        from: "Jane <Jane@Acme.com>",
        to: "Michael <michael@agency.com>",
        subject: "Re: quick question",
        date: "Wed, 16 Sep 2026 10:00:00 +0000",
        text: "Hi yes, interested.",
      },
      "michael@agency.com",
    );

    expect(inbound.from).toBe("jane@acme.com");
    expect(inbound.fromName).toBe("Jane");
    expect(inbound.to).toBe("michael@agency.com");
    expect(inbound.inReplyTo).toBe("<sent@agency.com>");
    expect(inbound.references).toEqual(["<sent@agency.com>", "<older@agency.com>"]);
    expect(inbound.receivedAt).toBe("2026-09-16T10:00:00.000Z");
    expect(inbound.text).toBe("Hi yes, interested.");
  });
});
