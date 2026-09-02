import { describe, expect, it } from "vitest";

import { DEFAULT_TEMPLATES, defaultTemplate } from "@/lib/transactional/catalog";
import { invalidVariables } from "@/lib/transactional/variables";

describe("reply notification templates", () => {
  it("ships a New Reply Received default template", () => {
    const tpl = defaultTemplate("reply.received");
    expect(tpl).toBeTruthy();
    expect(tpl?.name).toBe("New Reply Received");
  });

  it("keeps the existing positive reply template untouched", () => {
    const tpl = defaultTemplate("positive_reply_notification");
    expect(tpl).toBeTruthy();
  });

  it("uses only whitelisted variables in both reply templates", () => {
    for (const key of ["reply.received", "positive_reply_notification"]) {
      const tpl = defaultTemplate(key)!;
      expect(invalidVariables(`${tpl.subject} ${tpl.html}`)).toEqual([]);
    }
  });

  it("registers exactly one template per event key", () => {
    const keys = DEFAULT_TEMPLATES.map((t) => t.eventKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
