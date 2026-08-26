/**
 * Client-safe barrel for the unified email-provider foundation.
 * Server code imports the registry directly from `./registry.server`.
 */
export * from "./types";
export * from "./provider";
export { normalizeEmailEvent, normalizeInboundEvent, normalizedEventType } from "./normalize";
