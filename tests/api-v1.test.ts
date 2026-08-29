/**
 * Public API v1 contract tests.
 *
 * These cover the guarantees a developer platform lives or dies by: keys are
 * only ever stored hashed, scopes actually gate access, cursors survive a round
 * trip, serializers never leak internal columns, and the documented surface
 * matches the routes the router really serves.
 */
import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { generateApiKey, hashApiKey, keyPrefix, looksLikeApiKey, KEY_PREFIX } from "@/lib/api/v1/keys";
import { isGrantableScope, scopeSatisfied, SCOPE_GROUPS } from "@/lib/api/v1/scopes";
import { decodeCursor, encodeCursor } from "@/lib/api/v1/pagination";
import { serializeCampaign, serializeMailbox } from "@/lib/api/v1/serializers";
import { V1_BASE_PATH, V1_RESOURCES } from "@/lib/api/v1/catalog";
import { buildOpenApiDocument } from "@/lib/api/v1/openapi";
import { isWebhookEvent, WEBHOOK_EVENTS } from "@/lib/api/v1/webhooks";

describe("api keys", () => {
  it("mints prefixed keys and stores only a hash", async () => {
    const key = generateApiKey();
    expect(key.startsWith(KEY_PREFIX)).toBe(true);
    expect(looksLikeApiKey(key)).toBe(true);

    const hash = await hashApiKey(key);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(key.slice(KEY_PREFIX.length));
    expect(await hashApiKey(key)).toBe(hash);
    expect(await hashApiKey(generateApiKey())).not.toBe(hash);
  });

  it("exposes a prefix short enough to be non-reversible", () => {
    const key = generateApiKey();
    const prefix = keyPrefix(key);
    expect(key.startsWith(prefix)).toBe(true);
    expect(prefix.length).toBeLessThan(key.length - 20);
  });

  it("rejects values that are not keys before any database work", () => {
    expect(looksLikeApiKey("")).toBe(false);
    expect(looksLikeApiKey("Bearer something")).toBe(false);
    expect(looksLikeApiKey(`${KEY_PREFIX}short`)).toBe(false);
  });
});

describe("scopes", () => {
  it("treats blanket read/write as covering the granular scopes", () => {
    expect(scopeSatisfied(["read"], "campaigns:read")).toBe(true);
    expect(scopeSatisfied(["write"], "campaigns:write")).toBe(true);
    // Read must never imply write — that is the whole point of the split.
    expect(scopeSatisfied(["read"], "campaigns:write")).toBe(false);
  });

  it("denies a scope the key was not granted", () => {
    expect(scopeSatisfied(["contacts:read"], "campaigns:read")).toBe(false);
    expect(scopeSatisfied([], "contacts:read")).toBe(false);
  });

  it("only accepts scopes the catalogue defines", () => {
    for (const group of SCOPE_GROUPS) {
      for (const scope of group.scopes) expect(isGrantableScope(scope)).toBe(true);
    }
    expect(isGrantableScope("billing:write")).toBe(false);
    expect(isGrantableScope("*")).toBe(false);
  });
});

describe("cursor pagination", () => {
  it("round-trips a cursor", () => {
    const cursor = { createdAt: "2026-08-29T10:00:00.000Z", id: "6f1c2a9e-0000-4000-8000-000000000001" };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("rejects a malformed cursor instead of paging from the start", () => {
    expect(() => decodeCursor("not-a-cursor")).toThrowError();
  });
});

describe("serializers", () => {
  it("never leaks internal columns on a campaign", () => {
    const wire = serializeCampaign({
      id: "c1",
      name: "Packaging",
      status: "active",
      timezone: "Asia/Dubai",
      workspace_id: "secret-workspace",
      created_by: "secret-user",
      internal_notes: "do not ship",
    });
    const json = JSON.stringify(wire);
    expect(json).not.toContain("secret-workspace");
    expect(json).not.toContain("secret-user");
    expect(json).not.toContain("do not ship");
    expect(wire.object).toBe("campaign");
  });

  it("never leaks mailbox credentials", () => {
    const wire = serializeMailbox({
      id: "m1",
      email: "hello@acme.com",
      provider: "ses",
      status: "active",
      credentials_ciphertext: "ENCRYPTED",
      smtp_password: "hunter2",
    });
    const json = JSON.stringify(wire);
    expect(json).not.toContain("ENCRYPTED");
    expect(json).not.toContain("hunter2");
  });
});

describe("documented surface matches the router", () => {
  const routeDir = resolve(process.cwd(), "src/routes/api/public/v1");
  const routeFiles = readdirSync(routeDir);

  it("declares a route file for every documented operation", () => {
    for (const resource of V1_RESOURCES) {
      for (const op of resource.operations) {
        const file = op.source.split("/").pop() as string;
        expect(routeFiles, `${op.method} ${op.path} → ${file}`).toContain(file);
      }
    }
  });

  it("keeps operation ids unique so docs anchors cannot collide", () => {
    const ids = V1_RESOURCES.flatMap((r) => r.operations.map((o) => o.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every write operation a scope", () => {
    for (const resource of V1_RESOURCES) {
      for (const op of resource.operations) {
        if (op.method === "GET") continue;
        expect(op.scope, `${op.method} ${op.path}`).toBeTruthy();
      }
    }
  });
});

describe("openapi document", () => {
  const doc = buildOpenApiDocument() as {
    openapi: string;
    paths: Record<string, Record<string, unknown>>;
    components: { securitySchemes: Record<string, unknown> };
  };

  it("is a valid-looking 3.1 document with bearer auth", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.components.securitySchemes["bearerAuth"]).toBeTruthy();
  });

  it("contains every catalogued operation under the v1 base path", () => {
    for (const resource of V1_RESOURCES) {
      for (const op of resource.operations) {
        const path = `${V1_BASE_PATH}${op.path}`;
        expect(doc.paths[path], path).toBeTruthy();
        expect(doc.paths[path]?.[op.method.toLowerCase()], `${op.method} ${path}`).toBeTruthy();
      }
    }
  });
});

describe("webhook events", () => {
  it("recognises only declared events", () => {
    for (const event of WEBHOOK_EVENTS) expect(isWebhookEvent(event)).toBe(true);
    expect(isWebhookEvent("account.deleted")).toBe(false);
  });
});
