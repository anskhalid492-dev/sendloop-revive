/**
 * OpenAPI 3.1 document generated from the v1 catalog.
 *
 * Generating rather than hand-writing means the spec can never describe an
 * endpoint the router does not serve: both the portal and the spec read the
 * same catalog entries.
 */
import { API_BASE_URL } from "@/lib/api-reference";
import { V1_BASE_PATH, V1_ERROR_CODES, V1_RESOURCES, type V1Operation } from "./catalog";
import { WEBHOOK_EVENTS } from "./webhooks";

function jsonExample(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function operationObject(resourceTitle: string, op: V1Operation) {
  const parameters = (op.params ?? []).map((p) => ({
    name: p.name,
    in: p.in,
    required: p.required,
    description: p.description,
    schema: { type: p.type.startsWith("integer") ? "integer" : "string" },
  }));

  if (op.idempotent) {
    parameters.push({
      name: "x-idempotency-key",
      in: "header",
      required: false,
      description:
        "Replay-safe key. A repeat call with the same key returns the original result instead of acting twice.",
      schema: { type: "string" },
    });
  }

  const responses: Record<string, unknown> = {
    "200": {
      description: "Success",
      content: {
        "application/json": {
          example: jsonExample(op.responseExample),
        },
      },
    },
  };
  for (const err of V1_ERROR_CODES) {
    responses[String(err.status)] = {
      description: `${err.code} — ${err.meaning}`,
      content: {
        "application/json": {
          example: { error: { code: err.code, message: err.meaning } },
        },
      },
    };
  }

  return {
    operationId: op.id.replace(/-/g, "_"),
    tags: [resourceTitle],
    summary: op.summary,
    description: op.description,
    ...(op.scope ? { security: [{ bearerAuth: [op.scope] }] } : { security: [{ bearerAuth: [] }] }),
    ...(parameters.length ? { parameters } : {}),
    ...(op.requestBody
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { example: jsonExample(op.requestBody) } },
          },
        }
      : {}),
    responses,
  };
}

export function buildOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const resource of V1_RESOURCES) {
    for (const op of resource.operations) {
      const fullPath = `${V1_BASE_PATH}${op.path}`;
      paths[fullPath] ??= {};
      paths[fullPath][op.method.toLowerCase()] = operationObject(resource.title, op);
    }
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "MunchReach Public API",
      version: "1.0.0",
      description:
        "Programmatic access to campaigns, sequences, contacts, mailboxes, replies, analytics and webhooks. Every API key is bound to a single workspace.",
      contact: { name: "MunchReach Support", url: `${API_BASE_URL}/contact-support` },
    },
    servers: [{ url: API_BASE_URL }],
    tags: V1_RESOURCES.map((r) => ({ name: r.title, description: r.summary })),
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Workspace API key issued in Settings → Developer API (`mr_live_…`).",
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths,
    "x-webhook-events": [...WEBHOOK_EVENTS],
  };
}
