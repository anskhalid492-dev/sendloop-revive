import { describe, expect, it } from "vitest";

import {
  DEFAULT_COMMUNITY,
  communityPath,
  mergeCommunityConfig,
  safeExternalUrl,
} from "@/lib/community-model";

describe("safeExternalUrl", () => {
  it("accepts real http(s) destinations", () => {
    expect(safeExternalUrl("https://facebook.com/groups/munchreach")).toBe(
      "https://facebook.com/groups/munchreach",
    );
  });

  it("rejects script and non-http schemes", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,<script>")).toBeNull();
  });

  it("rejects blank or malformed values", () => {
    expect(safeExternalUrl("")).toBeNull();
    expect(safeExternalUrl("   ")).toBeNull();
    expect(safeExternalUrl("facebook")).toBeNull();
    expect(safeExternalUrl("https://localhost")).toBeNull();
  });
});

describe("communityPath", () => {
  it("falls back to the default when the path is not internal", () => {
    expect(communityPath({ landing_path: "https://example.com" })).toBe("/community");
    expect(communityPath({ landing_path: "" })).toBe("/community");
  });

  it("strips trailing slashes", () => {
    expect(communityPath({ landing_path: "/community/" })).toBe("/community");
  });
});

describe("mergeCommunityConfig", () => {
  it("fills gaps from the defaults", () => {
    expect(mergeCommunityConfig({ nav_label: "Insiders" })).toEqual({
      ...DEFAULT_COMMUNITY,
      nav_label: "Insiders",
    });
    expect(mergeCommunityConfig(null)).toEqual(DEFAULT_COMMUNITY);
  });
});
