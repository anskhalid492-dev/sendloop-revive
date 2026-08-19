/**
 * Cold email template library. The template copy here is carried over from the
 * original /cold-email-templates page — same subjects, same bodies, same
 * sequence structure — with categories, use cases and follow-ups made explicit.
 */

export type TemplateStep = {
  label: string;
  subject: string;
  body: string;
};

export type ColdEmailTemplate = {
  slug: string;
  name: string;
  description: string;
  category: string;
  useCase: string;
  step: string;
  subject: string;
  body: string;
  followUps: TemplateStep[];
};

export const TEMPLATE_VARIABLES = [
  { token: "{{first_name}}", meaning: "Lead's first name" },
  { token: "{{last_name}}", meaning: "Lead's last name" },
  { token: "{{company}}", meaning: "Company on the lead record" },
  { token: "{{job_title}}", meaning: "Lead's role" },
  { token: "{{sender_name}}", meaning: "The sending user's name" },
  { token: "{{similar_company}}", meaning: "A comparable customer you reference as proof" },
  { token: "{{city}}", meaning: "Lead's city, for local outreach" },
  { token: "{{role}}", meaning: "The role you are recruiting for" },
  { token: "{{client_company}}", meaning: "The company you are recruiting on behalf of" },
  { token: "{{salary_range}}", meaning: "Advertised compensation range" },
  { token: "{{project}}", meaning: "A specific piece of the prospect's work" },
  { token: "{{topic}}", meaning: "What the previous conversation was about" },
];

const softBump: TemplateStep = {
  label: "Follow-up 1 — the soft bump",
  subject: "(reply in thread)",
  body: `Hi {{first_name}},

Bumping this in case it slipped past — happy to send a two-minute overview instead of a call if that is easier.

{{sender_name}}`,
};

const proofFollowUp: TemplateStep = {
  label: "Follow-up 2 — the proof follow-up",
  subject: "(reply in thread)",
  body: `Hi {{first_name}},

Sharing a short case study from {{similar_company}} — same team size, same problem, 3x reply rate in six weeks.

If the timing is wrong, tell me when to check back.

{{sender_name}}`,
};

const breakup: TemplateStep = {
  label: "Follow-up 3 — the breakup",
  subject: "(reply in thread)",
  body: `Hi {{first_name}},

I will stop here so I am not cluttering your inbox. If outbound moves up the priority list at {{company}}, reply to this thread and I will pick it back up.

All the best,
{{sender_name}}`,
};

export const COLD_EMAIL_TEMPLATES: ColdEmailTemplate[] = [
  {
    slug: "specific-observation-opener",
    name: "The specific observation opener",
    description: "Opens with a hiring signal you can verify, then connects it to the gap you fill.",
    category: "Agency",
    useCase: "First touch to agencies and teams that are visibly scaling outbound headcount.",
    step: "Step 1",
    subject: "your {{company}} careers page",
    body: `Hi {{first_name}},

Noticed {{company}} is hiring three SDRs this quarter — usually that means pipeline targets went up before headcount could catch up.

We run outbound for teams in that exact gap and typically book 8–12 qualified meetings a month while the team ramps.

Worth a 10-minute look?

{{sender_name}}`,
    followUps: [softBump, proofFollowUp, breakup],
  },
  {
    slug: "result-first-pitch",
    name: "The result-first pitch",
    description: "Leads with a concrete outcome instead of a description of the product.",
    category: "SaaS",
    useCase: "First touch to SaaS teams that already measure time-to-value or churn.",
    step: "Step 1",
    subject: "cutting onboarding time at {{company}}",
    body: `Hi {{first_name}},

We cut onboarding time from 21 days to 6 for {{similar_company}}, which took their month-one churn down by a third.

If {{company}} is measuring time-to-value, I can show you exactly how in 10 minutes.

Open to it?

{{sender_name}}`,
    followUps: [softBump, proofFollowUp, breakup],
  },
  {
    slug: "candidate-outreach",
    name: "The candidate outreach",
    description: "References the candidate's actual work before naming the role.",
    category: "Recruiting",
    useCase: "First touch to passive candidates you found through their published work.",
    step: "Step 1",
    subject: "{{role}} at {{client_company}}",
    body: `Hi {{first_name}},

Your work on {{project}} lines up closely with a {{role}} role I am hiring for — remote, {{salary_range}}, small team with real ownership.

Want the full brief?

{{sender_name}}`,
    followUps: [softBump],
  },
  {
    slug: "local-service-referral-angle",
    name: "The local service referral angle",
    description: "Uses a nearby-business observation as the opener and asks only for permission.",
    category: "Lead Generation",
    useCase: "First touch to local service businesses where missed calls cost revenue.",
    step: "Step 1",
    subject: "quick question about {{company}}'s bookings",
    body: `Hi {{first_name}},

A few businesses near {{city}} mentioned they're missing calls during peak hours. If that's true for {{company}} too, we've built a simple fix that pays for itself in a week.

Mind if I send the two-minute version?

{{sender_name}}`,
    followUps: [softBump, breakup],
  },
  {
    slug: "soft-bump",
    name: "The soft bump",
    description: "A two-line nudge that offers a lower-effort alternative to a call.",
    category: "Follow-Up",
    useCase: "Second touch in any sequence, sent in the original thread.",
    step: "Step 2",
    subject: softBump.subject,
    body: softBump.body,
    followUps: [proofFollowUp, breakup],
  },
  {
    slug: "proof-follow-up",
    name: "The proof follow-up",
    description: "Adds evidence from a comparable customer and asks for timing if the answer is no.",
    category: "Follow-Up",
    useCase: "Third touch, once the opener and bump have gone unanswered.",
    step: "Step 3",
    subject: proofFollowUp.subject,
    body: proofFollowUp.body,
    followUps: [breakup],
  },
  {
    slug: "breakup",
    name: "The breakup",
    description: "Closes the loop politely and leaves the thread open for later.",
    category: "Follow-Up",
    useCase: "Final touch in a sequence before the lead is left alone.",
    step: "Step 4",
    subject: breakup.subject,
    body: breakup.body,
    followUps: [],
  },
  {
    slug: "re-engagement",
    name: "The re-engagement email",
    description: "One question that reopens a conversation without re-pitching.",
    category: "Reactivation",
    useCase: "Contacts who went quiet after an earlier conversation.",
    step: "Follow-up",
    subject: "still relevant?",
    body: `Hi {{first_name}},

It's been a while since we last spoke about {{topic}} — has anything changed on your end that would make this worth revisiting?

{{sender_name}}`,
    followUps: [],
  },
];

export const TEMPLATE_CATEGORIES = [
  "All",
  ...Array.from(new Set(COLD_EMAIL_TEMPLATES.map((t) => t.category))),
];

export function filterTemplates(query: string, category: string): ColdEmailTemplate[] {
  const q = query.trim().toLowerCase();
  return COLD_EMAIL_TEMPLATES.filter((t) => {
    if (category !== "All" && t.category !== category) return false;
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.useCase.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      t.body.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
    );
  });
}

/** Plain-text copy payload: subject + body + any follow-ups, nothing else. */
export function templateCopyText(t: ColdEmailTemplate): string {
  const parts = [`Subject: ${t.subject}`, "", t.body];
  for (const f of t.followUps) {
    parts.push("", "---", `${f.label}`, `Subject: ${f.subject}`, "", f.body);
  }
  return parts.join("\n");
}

export function templateVariables(t: ColdEmailTemplate): string[] {
  const text = [t.subject, t.body, ...t.followUps.flatMap((f) => [f.subject, f.body])].join(" ");
  return Array.from(new Set(text.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? []));
}

export const PERSONALIZATION_TIPS = [
  "Pull one fact from their website, LinkedIn post or job listing — not their industry in general",
  "Reference a trigger event: funding, hiring, a launch, a review, or a leadership change",
  "Use variables with a sensible fallback so a missing field never breaks the sentence",
  "Keep the personalization line first, not buried after your pitch",
  "Validate a sample of 20 personalized rows manually before sending the full batch",
  "Avoid personalization that just restates the company name back to them",
];

export const WRITING_RULES = [
  "One idea, one ask, one call to action",
  "Lead with the prospect, not your company",
  "Replace adjectives with numbers",
  "Write at a sixth-grade reading level",
  "No attachments and at most one link",
  "Make the reply easy: yes or not now",
];
