import { describe, expect, it } from "vitest";
import { leadValue, renderTemplate, type LeadLike } from "@/lib/campaign-model";

const lead: LeadLike = {
  first_name: "Ada",
  last_name: "Lovelace",
  email: "ada@example.com",
  company: "Acme",
  job_title: "CEO",
  website: "acme.com",
  phone: null,
  linkedin_url: null,
  city: "Austin",
  state: "TX",
  country: "US",
  custom_fields: { street_address: "1 Main St", zip: "78701", municipality: "Travis" },
};

describe("location variables", () => {
  it("{{city}} renders only the city, never the full address", () => {
    expect(leadValue(lead, "city")).toBe("Austin");
    expect(renderTemplate("Hi from {{city}}", lead)).toBe("Hi from Austin");
  });

  it("{{state}} and {{country}} render their own fields", () => {
    expect(renderTemplate("{{state}} {{country}}", lead)).toBe("TX US");
  });

  it("{{location}} still renders the combined city, state, country", () => {
    expect(renderTemplate("{{location}}", lead)).toBe("Austin, TX, US");
  });

  it("{{city}} never leaks street, zip or municipality custom fields", () => {
    const out = renderTemplate("{{city}}", lead);
    expect(out).not.toContain("1 Main St");
    expect(out).not.toContain("78701");
    expect(out).not.toContain("Travis");
  });

  it("custom fields still resolve by their own token", () => {
    expect(renderTemplate("{{street_address}}", lead)).toBe("1 Main St");
  });
});
