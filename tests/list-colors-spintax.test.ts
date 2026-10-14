import { describe, expect, it, vi } from "vitest";
import { buildSpintax } from "@/lib/spintax-builder";
import { listColor, listColorSchema, resolveImportList } from "@/lib/lead-list-color";
import { insertAtSelection } from "@/lib/campaign-editor";
import { resolveSpintax } from "@/lib/campaign-model";

describe("list colors and import destinations (isolated throwaway fixtures)", () => {
  it("preserves saved colors through serialization and defaults old lists", () => {
    expect(listColor(JSON.parse(JSON.stringify({ color: "rose" })).color)).toBe("rose");
    expect(listColor(null)).toBe("blue");
    expect(listColor(undefined)).toBe("blue");
    expect(listColorSchema.safeParse("javascript:invalid").success).toBe(false);
  });
  it("uses an existing destination without any create or color mutation", async () => {
    const create = vi.fn();
    expect(await resolveImportList("throwaway-existing", null, create)).toBe("throwaway-existing");
    expect(create).not.toHaveBeenCalled();
  });
  it("creates an explicit new list with its selected color", async () => {
    const create = vi.fn().mockResolvedValue({ id: "throwaway-new" });
    expect(await resolveImportList(null, { name: "Test import", color: "green" }, create)).toBe("throwaway-new");
    expect(create).toHaveBeenCalledExactlyOnceWith({ name: "Test import", color: "green" });
  });
  it("reuses a created destination on retry and supports no-list imports", async () => {
    const create = vi.fn();
    expect(await resolveImportList("throwaway-created", null, create)).toBe("throwaway-created");
    expect(await resolveImportList(null, null, create)).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});

describe("existing spintax syntax and selection insertion", () => {
  it("builds multiple options and compatible nested syntax", () => {
    expect(buildSpintax(["Hi", "Hello", "Hey"]).syntax).toBe("{Hi|Hello|Hey}");
    const nested = buildSpintax(["Hi {there|friend}", "Hello"]);
    expect(nested).toEqual({ syntax: "{Hi {there|friend}|Hello}", error: null });
    expect(resolveSpintax(nested.syntax, 0)).toBe("Hi there");
    expect(resolveSpintax(nested.syntax, 1)).toBe("Hello");
  });
  it("preserves personalization and whitespace inside alternatives", () => {
    expect(buildSpintax(["Hi {{first_name | there}}", "Hello"])).toEqual({ syntax: "{Hi {{first_name | there}}|Hello}", error: null });
    expect(buildSpintax(["Hi\n", "Hello "]).syntax).toBe("{Hi\n|Hello }");
  });
  it.each([["Hi", ""], ["Hi {there|friend", "Hello"], ["Hi {there|}", "Hello"], ["Hi }", "Hello"], ["Hi|Hey", "Hello"]])("rejects incomplete syntax %j", (...options) => {
    expect(buildSpintax(options).error).not.toBeNull();
  });
  it.each(["subject", "body"])("replaces only selected %s text and positions the cursor", () => {
    const original = "Before selected\nAfter {{company}}";
    const syntax = buildSpintax(["Hi {there|friend}", "Hello"]).syntax;
    const result = insertAtSelection(original, { start: 7, end: 15 }, syntax);
    expect(result.value).toBe(`Before ${syntax}\nAfter {{company}}`);
    expect(result.caret).toBe(7 + syntax.length);
  });
});