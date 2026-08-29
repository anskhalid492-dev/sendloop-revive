import { describe, expect, it } from "vitest";
import { normalizeVerificationToken } from "@/lib/verification-token";

const TOKEN = "qdP9VH3VhhlMVf3G6ElPg2ZYMcbX7WwkkxLLXuwy1wY";

describe("normalizeVerificationToken", () => {
  it("keeps a bare token byte-for-byte", () => {
    expect(normalizeVerificationToken(TOKEN)).toBe(TOKEN);
  });

  it("extracts the token from a pasted meta tag", () => {
    expect(
      normalizeVerificationToken(`<meta name="google-site-verification" content="${TOKEN}" />`),
    ).toBe(TOKEN);
  });

  it("supports single quotes and stray whitespace", () => {
    expect(
      normalizeVerificationToken(`  <meta name='google-site-verification' content='${TOKEN}'>  `),
    ).toBe(TOKEN);
  });

  it("returns empty for empty input", () => {
    expect(normalizeVerificationToken("")).toBe("");
    expect(normalizeVerificationToken(undefined)).toBe("");
  });
});
