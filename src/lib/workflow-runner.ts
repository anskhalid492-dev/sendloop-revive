/**
 * Workflow executor (pure; all IO injected).
 *
 * Walks the workflow tree from the run's saved cursor. Every node visit is a
 * numbered "hop" recorded as one run-step row, which is what makes execution
 * idempotent across retries and crashes:
 *  - a hop already recorded `completed` is never executed again;
 *  - a hop recorded `running` means a previous worker may have performed the
 *    action and then died, so the action is NOT repeated — the run fails with
 *    a clear reason instead (at-most-once, like the other workers);
 *  - waits persist `resume_at` and return; the worker resumes later, no timers
 *    and no open transactions.
 */
import {
  advance,
  chooseBranch,
  enterPath,
  evaluateGroup,
  MAX_WORKFLOW_HOPS,
  nodeAt,
  type Cursor,
  type WaitSpec,
  type Workflow,
  type WorkflowNode,
} from "./workflow-graph";

export type WorkflowState = { cursor: Cursor | null; hop: number; started?: boolean };

export type HopStatus = "running" | "completed" | "skipped" | "waiting" | "failed";

export type WorkflowDeps = {
  getField: (field: string) => unknown;
  /** Status of the step already recorded for this hop, if any. */
  priorHop: (hop: number) => Promise<HopStatus | null>;
  recordHop: (hop: number, node: WorkflowNode, status: HopStatus, output: Record<string, unknown>, error?: string) => Promise<void>;
  saveState: (state: WorkflowState) => Promise<void>;
  executeAction: (action: string, config: Record<string, unknown>, hop: number) => Promise<Record<string, unknown>>;
  computeResume: (wait: WaitSpec) => string;
  /** For until_event waits: did the event happen since the wait began? */
  eventSince?: (event: string, hop: number) => Promise<boolean>;
  isRetryable: (message: string) => boolean;
  maxHops?: number;
};

export type WorkflowOutcome =
  | { status: "completed"; result: string; state: WorkflowState }
  | { status: "waiting"; resumeAt: string; waitFor: string | null; state: WorkflowState }
  | { status: "retry"; error: string; state: WorkflowState }
  | { status: "failed"; error: string; state: WorkflowState };

export async function executeWorkflow(workflow: Workflow, initial: WorkflowState, deps: WorkflowDeps): Promise<WorkflowOutcome> {
  const nodes = workflow.nodes;
  const maxHops = deps.maxHops ?? MAX_WORKFLOW_HOPS;
  let cursor: Cursor | null = initial.started ? initial.cursor : nodes.length ? [0] : null;
  let hop = initial.hop;
  const state = (): WorkflowState => ({ cursor, hop, started: true });

  while (cursor) {
    if (hop >= maxHops) {
      return { status: "failed", error: `Stopped for safety: this workflow ran more than ${maxHops} steps in one run.`, state: state() };
    }
    const node = nodeAt(nodes, cursor);
    if (!node) return { status: "failed", error: "The workflow changed shape and the current step no longer exists.", state: state() };
    const prior = await deps.priorHop(hop);

    switch (node.type) {
      case "condition": {
        const pass = evaluateGroup(node.group, deps.getField);
        await deps.recordHop(hop, node, pass ? "completed" : "skipped", { passed: pass });
        if (!pass) {
          hop += 1;
          return { status: "completed", result: "Conditions not met", state: { cursor: null, hop, started: true } };
        }
        cursor = advance(nodes, cursor);
        break;
      }
      case "branch": {
        const path = chooseBranch(node, deps.getField);
        await deps.recordHop(hop, node, "completed", { path: path.key, pathLabel: path.label });
        cursor = enterPath(nodes, cursor, path.key);
        break;
      }
      case "wait": {
        if (prior === "waiting" || prior === "completed") {
          const output: Record<string, unknown> = { resumed: true };
          if (node.wait.mode === "until_event" && node.wait.event && deps.eventSince) {
            output["eventHappened"] = await deps.eventSince(node.wait.event, hop);
          }
          await deps.recordHop(hop, node, "completed", output);
          cursor = advance(nodes, cursor);
          break;
        }
        const resumeAt = deps.computeResume(node.wait);
        await deps.recordHop(hop, node, "waiting", { resume_at: resumeAt, waitFor: node.wait.event ?? null });
        await deps.saveState(state());
        return {
          status: "waiting",
          resumeAt,
          waitFor: node.wait.mode === "until_event" ? (node.wait.event ?? null) : null,
          state: state(),
        };
      }
      case "end": {
        await deps.recordHop(hop, node, "completed", { ended: true });
        hop += 1;
        return { status: "completed", result: "Ended by step", state: { cursor: null, hop, started: true } };
      }
      case "action": {
        if (node.action === "workflow.end" || node.action === "workflow.stop") {
          await deps.recordHop(hop, node, "completed", { ended: true });
          hop += 1;
          return { status: "completed", result: node.action === "workflow.stop" ? "Stopped by step" : "Ended by step", state: { cursor: null, hop, started: true } };
        }
        if (prior === "completed" || prior === "skipped") {
          cursor = advance(nodes, cursor); // already done before a crash/retry
          break;
        }
        if (prior === "running") {
          const error = "A previous attempt may already have run this action, so it was not repeated.";
          await deps.recordHop(hop, node, "failed", {}, error);
          return { status: "failed", error, state: state() };
        }
        await deps.recordHop(hop, node, "running", {});
        try {
          const output = await deps.executeAction(node.action, node.config ?? {}, hop);
          await deps.recordHop(hop, node, "completed", output);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await deps.recordHop(hop, node, "failed", {}, message);
          await deps.saveState(state());
          return deps.isRetryable(message)
            ? { status: "retry", error: message, state: state() }
            : { status: "failed", error: message, state: state() };
        }
        cursor = advance(nodes, cursor);
        break;
      }
    }
    hop += 1;
    await deps.saveState(state());
  }
  return { status: "completed", result: "All steps executed", state: state() };
}
