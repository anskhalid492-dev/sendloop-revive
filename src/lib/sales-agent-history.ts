/** Customer-friendly run-history text for AI Sales Agent steps. Never shows provider details. */
export function describeAiReplyOutput(output: Record<string, unknown>): string {
  if (!output["generated"]) {
    return `AI reply not generated: ${String(output["error"] ?? "")}${output["handedOff"] ? " · handed to a person" : ""}`;
  }
  const forced = Array.isArray(output["forcedDraft"]) ? (output["forcedDraft"] as string[]) : [];
  const note = typeof output["note"] === "string" ? output["note"] : "";
  if (output["mode"] === "auto_send") return output["duplicate"] ? "Auto-send attempted · already sent earlier, not sent again" : "Auto-send attempted · reply sent from the conversation's mailbox";
  if (output["handedOff"]) return `AI reply not saved · handed to a person${note ? ` · ${note}` : ""}`;
  const why = forced.length ? ` · kept as draft: ${forced.join(" ")}` : note ? ` · ${note}` : "";
  return `Draft generated${why}`;
}

export function describeHumanReviewOutput(output: Record<string, unknown>): string {
  const reason = String(output["reason"] ?? "").trim() || "No reason given";
  const owner = typeof output["assignedToName"] === "string" ? output["assignedToName"] : output["assignedTo"] ? "a team member" : "nobody (unassigned)";
  return `Human review requested · Reason: ${reason} · Assigned owner: ${owner}`;
}
