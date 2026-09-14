import { describe, expect, it } from "vitest";
import { insertAtSelection, variableSnippet } from "@/lib/campaign-editor";

const body = "Hi there,\n\nQuick question about your team.\n\nBest,\nSam\nUnsubscribe: {{unsubscribe_link}}";

describe("sequence editor variable insertion", () => {
  it("A: inserts at the very beginning", () => {
    const r = insertAtSelection(body, { start: 0, end: 0 }, variableSnippet("first_name"));
    expect(r.value.startsWith("{{first_name}}Hi there,")).toBe(true);
    expect(r.caret).toBe("{{first_name}}".length);
  });

  it("B: inserts in the middle of a sentence, not the footer", () => {
    const at = body.indexOf("your team");
    const r = insertAtSelection(body, { start: at, end: at }, variableSnippet("company"));
    expect(r.value).toContain("about {{company}}your team");
    expect(r.value.endsWith("Unsubscribe: {{unsubscribe_link}}")).toBe(true);
  });

  it("C: replaces the selected text", () => {
    const at = body.indexOf("your team");
    const r = insertAtSelection(body, { start: at, end: at + "your team".length }, variableSnippet("company"));
    expect(r.value).toContain("about {{company}}.");
    expect(r.value).not.toContain("your team");
  });

  it("D: never appends to the end when the caret is in the body", () => {
    const r = insertAtSelection(body, { start: 3, end: 3 }, variableSnippet("first_name"));
    expect(r.value.endsWith("{{first_name}}")).toBe(false);
  });

  it("H: inserts inside the footer region when the caret is there", () => {
    const footer = "Best,\nSam";
    const r = insertAtSelection(footer, { start: footer.length, end: footer.length }, variableSnippet("sender_name"));
    expect(r.value).toBe("Best,\nSam{{sender_name}}");
  });

  it("clamps out-of-range selections instead of corrupting text", () => {
    const r = insertAtSelection("Hi", { start: 99, end: 120 }, "X");
    expect(r.value).toBe("HiX");
    expect(r.caret).toBe(3);
  });
});
