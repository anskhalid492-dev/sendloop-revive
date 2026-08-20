/**
 * The guided MunchReach setup journey.
 *
 * Steps 1-7 are the required path from empty workspace to a live campaign and
 * count towards the "x/7 complete" progress indicator. Step 8 (monitor replies)
 * is the ongoing habit that follows launch, so it is shown but not counted.
 */
export type SetupStepKey =
  | "workspace"
  | "domain"
  | "dns"
  | "mailbox"
  | "leads"
  | "campaign"
  | "launch"
  | "replies";

export type SetupStepMeta = {
  key: SetupStepKey;
  index: number;
  title: string;
  description: string;
  cta: string;
  to: "/workspace" | "/sending" | "/leads" | "/campaigns" | "/inbox";
  /** Counts towards the progress indicator. */
  required: boolean;
  estimate: string;
};

export const SETUP_STEPS: readonly SetupStepMeta[] = [
  {
    key: "workspace",
    index: 1,
    title: "Create workspace",
    description: "Your team's home for campaigns, prospects and shared replies.",
    cta: "Open workspace",
    to: "/workspace",
    required: true,
    estimate: "1 min",
  },
  {
    key: "domain",
    index: 2,
    title: "Connect domain",
    description: "Add a domain you own — ideally a dedicated one for outreach.",
    cta: "Add domain",
    to: "/sending",
    required: true,
    estimate: "2 min",
  },
  {
    key: "dns",
    index: 3,
    title: "Verify DNS",
    description: "Publish the SPF, DKIM and DMARC records so inboxes trust you.",
    cta: "Verify records",
    to: "/sending",
    required: true,
    estimate: "5 min",
  },
  {
    key: "mailbox",
    index: 4,
    title: "Connect mailbox",
    description: "Create a managed sending mailbox and start warming it up.",
    cta: "Connect mailbox",
    to: "/sending",
    required: true,
    estimate: "2 min",
  },
  {
    key: "leads",
    index: 5,
    title: "Add leads",
    description: "Import a CSV or add prospects manually into a lead list.",
    cta: "Import leads",
    to: "/leads",
    required: true,
    estimate: "3 min",
  },
  {
    key: "campaign",
    index: 6,
    title: "Create campaign",
    description: "Write your opener, add follow-ups and pick your audience.",
    cta: "Build campaign",
    to: "/campaigns",
    required: true,
    estimate: "10 min",
  },
  {
    key: "launch",
    index: 7,
    title: "Launch",
    description: "Go live — MunchReach paces sending across your mailboxes.",
    cta: "Launch campaign",
    to: "/campaigns",
    required: true,
    estimate: "1 min",
  },
  {
    key: "replies",
    index: 8,
    title: "Monitor replies",
    description: "Work every reply from the unified inbox and book meetings.",
    cta: "Open inbox",
    to: "/inbox",
    required: false,
    estimate: "Ongoing",
  },
];

export type SetupProgress = Record<SetupStepKey, boolean>;

export const EMPTY_SETUP_PROGRESS: SetupProgress = {
  workspace: false,
  domain: false,
  dns: false,
  mailbox: false,
  leads: false,
  campaign: false,
  launch: false,
  replies: false,
};

export const REQUIRED_SETUP_STEPS = SETUP_STEPS.filter((s) => s.required);

export function countCompleted(progress: SetupProgress) {
  return REQUIRED_SETUP_STEPS.filter((s) => progress[s.key]).length;
}

/** First required step that is still outstanding, if any. */
export function nextSetupStep(progress: SetupProgress) {
  return REQUIRED_SETUP_STEPS.find((s) => !progress[s.key]) ?? null;
}
