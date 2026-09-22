import { describe, expect, it } from "vitest";

import {
  BUG_STATUSES,
  BUG_STATUS_LABEL,
  MAX_BUG_SCREENSHOT_BYTES,
  bugScreenshotError,
  bugStatusOf,
} from "@/lib/bug-report-model";

describe("bug report model", () => {
  it("offers exactly the four admin statuses", () => {
    expect(BUG_STATUSES).toEqual(["new", "in_progress", "resolved", "closed"]);
    expect(Object.values(BUG_STATUS_LABEL)).toEqual(["New", "In Progress", "Resolved", "Closed"]);
  });

  it("falls back to New for unknown status values", () => {
    expect(bugStatusOf("resolved")).toBe("resolved");
    expect(bugStatusOf("banana")).toBe("new");
    expect(bugStatusOf(null)).toBe("new");
  });

  it("accepts png, jpeg and webp under 5 MB", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(bugScreenshotError({ size: 1024, type, name: `shot.${type.slice(6)}` })).toBeNull();
    }
  });

  it("rejects oversized images and non-image files", () => {
    expect(
      bugScreenshotError({ size: MAX_BUG_SCREENSHOT_BYTES + 1, type: "image/png", name: "a.png" }),
    ).toMatch(/5 MB/);
    expect(bugScreenshotError({ size: 10, type: "application/pdf", name: "a.pdf" })).toMatch(
      /PNG, JPG or WEBP/,
    );
  });

  it("falls back to the extension when the browser reports no type", () => {
    expect(bugScreenshotError({ size: 10, type: "", name: "screen.JPEG" })).toBeNull();
    expect(bugScreenshotError({ size: 10, type: "", name: "notes.txt" })).toMatch(/PNG/);
  });
});
