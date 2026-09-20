import { describe, expect, it } from "vitest";

import { avatarImageUrl } from "@/lib/files-model";

describe("avatarImageUrl", () => {
  it("serves a stored picture from the app's own stable image URL", () => {
    expect(avatarImageUrl("avatars/user-1/abc.webp")).toBe("/api/public/avatar-image/user-1/abc.webp");
  });

  it("accepts a legacy path that omits the folder", () => {
    expect(avatarImageUrl("user-1/abc.webp")).toBe("/api/public/avatar-image/user-1/abc.webp");
  });

  it("keeps social sign-in pictures untouched", () => {
    expect(avatarImageUrl("https://lh3.googleusercontent.com/a/x")).toBe(
      "https://lh3.googleusercontent.com/a/x",
    );
    expect(avatarImageUrl("/uploads/x.png")).toBe("/uploads/x.png");
  });

  it("never treats a session-only preview or a traversal path as a saved picture", () => {
    expect(avatarImageUrl("blob:http://localhost/x")).toBeNull();
    expect(avatarImageUrl("data:image/png;base64,AA")).toBeNull();
    expect(avatarImageUrl("avatars/../secrets/x.png")).toBeNull();
  });

  it("returns nothing when no picture is stored", () => {
    expect(avatarImageUrl(null)).toBeNull();
    expect(avatarImageUrl("  ")).toBeNull();
  });
});
