import { describe, expect, it } from "vitest";

import {
  mailerooEntriesCreated,
  mailerooEntryList,
  mapMailerooRecords,
  type MailerooDomain,
} from "../maileroo.server";

/**
 * Real shape returned by the provider for a live domain: single objects for
 * SPF/DKIM/DMARC/tracking, but a LIST for `mx_record` (two inbound hosts).
 */
const domain: MailerooDomain = {
  id: 102869,
  domain_name: "example.agency",
  status: true,
  dns_records: {
    dkim_record: { host: "mta._domainkey.example.agency", record: "v=DKIM1;h=sha256;p=AAA", created: true },
    spf_record: { host: "example.agency", record: "v=spf1 include:_spf.maileroo.com ~all", created: true },
    dmarc_record: { host: "_dmarc.example.agency", record: "v=DMARC1; p=reject;", created: true },
    mx_record: [
      { host: "example.agency", record: "mx1.maileroo.com", priority: 10, created: false },
      { host: "example.agency", record: "mx2.maileroo.com", priority: 20, created: false },
    ],
    tracking_record: { host: "click.example.agency", record: "click.maileroo.net", created: true },
  },
};

describe("maileroo dns record mapping", () => {
  it("publishes every inbound MX host with its priority", () => {
    const mx = mapMailerooRecords("example.agency", domain).filter((r) => r.kind === "mx");
    expect(mx.map((r) => r.value)).toEqual(["mx1.maileroo.com", "mx2.maileroo.com"]);
    expect(mx.map((r) => r.priority)).toEqual([10, 20]);
    expect(mx.every((r) => r.host === "@")).toBe(true);
  });

  it("still maps single-entry records", () => {
    const kinds = mapMailerooRecords("example.agency", domain).map((r) => r.kind);
    expect(kinds).toContain("spf");
    expect(kinds).toContain("dkim");
    expect(kinds).toContain("dmarc");
    expect(kinds).toContain("tracking");
  });

  it("normalises single entries and lists alike", () => {
    expect(mailerooEntryList({ host: "a", record: "b" })).toHaveLength(1);
    expect(mailerooEntryList(domain.dns_records?.["mx_record"])).toHaveLength(2);
    expect(mailerooEntryList(null)).toEqual([]);
  });

  it("treats a record as live only when every entry is live", () => {
    expect(mailerooEntriesCreated(domain.dns_records?.["spf_record"])).toBe(true);
    expect(mailerooEntriesCreated(domain.dns_records?.["mx_record"])).toBe(false);
    expect(
      mailerooEntriesCreated([
        { record: "mx1.maileroo.com", created: true },
        { record: "mx2.maileroo.com", created: true },
      ]),
    ).toBe(true);
    expect(mailerooEntriesCreated(null)).toBe(false);
  });
});
