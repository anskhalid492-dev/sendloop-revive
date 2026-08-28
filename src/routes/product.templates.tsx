import { createFileRoute } from "@tanstack/react-router";
import {
  Sparkles,
  FileText,
  Wand2,
  Variable,
  FolderOpen,
  Copy,
  FileX,
  Repeat,
  ShieldAlert,
  Tags,
  Users,
  Eye,
  History,
  Search,
  Building2,
  Briefcase,
  UserSearch,
  Handshake,
  Megaphone,
} from "lucide-react";

import {
  BeforeAfter,
  BigPreview,
  BulletList,
  CtaBlock,
  DocSection,
  FeatureBento,
  MarketingLayout,
  MockPanel,
  MockRows,
  PageHero,
  PainPoints,
  Section,
  UseCaseGrid,
  Walkthrough,
  WorkflowStrip,
  metaFor,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { PageFaqs } from "@/components/site/PageFaqs";

const faqs = [
  { q: "Are templates free to use?", a: "Yes. The full library — official MunchReach templates and anything your workspace creates — is included on every plan with no cap on how many you insert into campaigns." },
  { q: "Will my emails look identical to every other sender using the same template?", a: "A template is a starting point, not a fixed script. Merge fields, custom fallbacks and your own edits mean the wording you actually send is unique to each campaign." },
  { q: "Can I build and save my own templates?", a: "Yes. Save any subject and body as a new template, tag it with a category, and it appears in your workspace library for every teammate to reuse." },
  { q: "Do templates include follow-up steps, or just the first email?", a: "You can save a template for any step — first touch, follow-up or breakup — and insert each one into the matching step of a sequence." },
  { q: "What happens if a variable like {{company}} is missing for a prospect?", a: "You set a fallback value when you save the template, so a missing field falls back to safe wording instead of sending a broken merge tag." },
  { q: "Can I see who created a template and how it's performing?", a: "Every template shows whether it's an official MunchReach template or one created by your workspace, and you can preview the rendered copy before using it." },
  { q: "Can I organize templates by category or use case?", a: "Yes. Templates are grouped into categories such as Cold Outreach, Follow-Ups, SaaS, Agencies, Recruiting and Breakup, and you can filter or search by name, subject or body text." },
  { q: "Can I preview a template before sending?", a: "Yes. Open the preview dialog to see the rendered subject, body and every variable used before inserting it into a campaign." },
  { q: "Can I edit or delete templates my team no longer uses?", a: "Anyone with manage permissions can edit, duplicate or delete a workspace template. Official MunchReach templates can be duplicated into your own editable copy." },
  { q: "Can I reuse an official template as a base for my own version?", a: "Yes. Duplicate any official or teammate's template into your workspace library, then edit the copy, subject or category without touching the original." },
];

export const Route = createFileRoute("/product/templates")({
  head: () => metaFor(
    "Cold Email Templates for Better Outreach | MunchReach",
    "Create, save, tag and reuse cold email templates across every campaign — with variables, fallbacks and a shared team library.",
    "/product/templates",
    faqs,
  ),
  component: Page,
});

const pains = [
  { icon: FileX, title: "Every campaign starts from a blank page", text: "Writing a fresh subject and opening line for every new sequence burns an hour before the first send even goes out." },
  { icon: Repeat, title: "No record of what actually worked", text: "The email that got a 30% reply rate last quarter lived in one rep's sent folder — nobody else on the team can find or reuse it." },
  { icon: Tags, title: "A pile of untagged drafts", text: "Dozens of saved emails with no category or structure means searching for 'the recruiting one' takes longer than writing a new draft." },
  { icon: ShieldAlert, title: "Broken merge fields at send time", text: "A missing {{company}} or {{first_name}} value turns a polished template into an email that reads like a mail-merge accident." },
];

const walkthroughSteps = [
  {
    title: "Start from the library, not a blank draft",
    youDo: "Search or filter by category — Cold Outreach, Follow-Ups, SaaS, Agencies, Recruiting, Breakup and more.",
    weHandle: "MunchReach surfaces official templates alongside anything your workspace has already built, sorted by featured and recently used.",
    youGet: "A ready subject and body in seconds instead of a blinking cursor.",
    visual: (
      <MockPanel title="Template library">
        <MockRows rows={[
          { left: "SaaS trial expiring", muted: "Cold Outreach · Official", right: "Featured" },
          { left: "Agency case study drop", muted: "Agencies · Workspace" },
          { left: "Passive candidate opener", muted: "Recruiting · Official" },
          { left: "Breakup email v2", muted: "Breakup · Workspace" },
        ]} />
      </MockPanel>
    ),
  },
  {
    title: "Preview before you commit to it",
    youDo: "Open the preview dialog to read the exact subject, body and description.",
    weHandle: "MunchReach lists every merge field the template uses so you know what data it expects before inserting it.",
    youGet: "Confidence the copy fits your offer before it touches a live campaign.",
    visual: (
      <MockPanel title="Preview — Passive candidate opener">
        <MockRows rows={[
          { left: "Subject", right: "Quick one, {{first_name}}?" },
          { left: "Variables used", right: "{{first_name}}, {{company}}, {{role}}" },
          { left: "Category", right: "Recruiting" },
          { left: "Source", right: "Official MunchReach template" },
        ]} />
      </MockPanel>
    ),
  },
  {
    title: "Add variables and set safe fallbacks",
    youDo: "Drop in merge fields like {{first_name}} or {{company}} anywhere in the subject or body.",
    weHandle: "Every variable in the template is detected automatically, and you define what each one falls back to if a prospect record is missing that field.",
    youGet: "A template that always renders cleanly, even on incomplete lead data.",
    visual: (
      <MockPanel title="Editing — variables">
        <MockRows rows={[
          { left: "{{first_name}}", muted: "Fallback: \"there\"", right: "Detected" },
          { left: "{{company}}", muted: "Fallback: \"your company\"", right: "Detected" },
          { left: "{{role}}", muted: "Fallback: \"your role\"", right: "Detected" },
        ]} />
      </MockPanel>
    ),
  },
  {
    title: "Insert into a sequence step",
    youDo: "Pick the template while building a campaign step, or send a draft straight to the editor.",
    weHandle: "The subject and body drop into that step with variables already wired up to your prospect fields.",
    youGet: "A sequence step that's ready to personalize instead of write from scratch.",
    visual: (
      <MockPanel title="Sequence — Step 2: Follow-up">
        <MockRows rows={[
          { left: "Template applied", right: "Breakup email v2" },
          { left: "Delay", right: "3 business days after Step 1" },
          { left: "Status", right: "Ready to review", badge: "Draft" },
        ]} />
      </MockPanel>
    ),
  },
  {
    title: "Save your own version back to the library",
    youDo: "Edit the wording, give it a name, a category and mark it featured if it's a go-to." ,
    weHandle: "MunchReach saves it to your workspace library, visible to every teammate with access, without touching the original official template.",
    youGet: "A growing, tagged library instead of one-off drafts scattered across campaigns.",
    visual: (
      <MockPanel title="Save template">
        <MockRows rows={[
          { left: "Name", right: "\"Series B\" opener — v2" },
          { left: "Category", right: "Sales" },
          { left: "Featured", right: "On" },
          { left: "Visibility", right: "Workspace" },
        ]} />
      </MockPanel>
    ),
  },
  {
    title: "Duplicate, tag and prune over time",
    youDo: "Duplicate a strong template to branch a variant, retag it, or delete versions nobody uses anymore.",
    weHandle: "Duplicates land as independent workspace copies, and every template keeps its category and featured flag intact.",
    youGet: "A library that reflects what your team is actually sending today, not last year's drafts.",
    visual: (
      <MockPanel title="Workspace templates">
        <MockRows rows={[
          { left: "\"Series B\" opener — v2", muted: "Sales", right: "Duplicated" },
          { left: "Old cold open (unused)", muted: "Cold Outreach", right: "Deleted" },
          { left: "Referral ask", muted: "Referral", right: "Edited" },
        ]} />
      </MockPanel>
    ),
  },
];

const features = [
  { icon: Sparkles, title: "Official template library", text: "MunchReach-curated templates across Cold Outreach, Follow-Ups, SaaS, Agencies, Sales, Recruiting, Lead Generation, Partnership, Breakup and Referral categories." },
  { icon: FileText, title: "One-click insert", text: "Drop any template's subject and body straight into a campaign step or draft without retyping." },
  { icon: Variable, title: "Automatic variable detection", text: "Merge fields in the subject or body are parsed automatically the moment you type them." },
  { icon: Wand2, title: "Fallback values", text: "Set what each variable falls back to when a prospect record is missing that field, so nothing sends broken." },
  { icon: FolderOpen, title: "Workspace template library", text: "Save your own templates so every teammate with access can find and reuse them, not just the person who wrote them." },
  { icon: Eye, title: "Full preview before use", text: "Read the rendered subject, body, description and variable list before inserting a template anywhere." },
  { icon: Tags, title: "Category tagging", text: "Every template carries a category so the library stays searchable instead of turning into a pile of drafts." },
  { icon: Search, title: "Search across name, subject and body", text: "Find the right template by keyword even if you don't remember which category it's filed under." },
  { icon: Copy, title: "Duplicate to branch a variant", text: "Copy any official or workspace template into an editable version without altering the source." },
  { icon: Users, title: "Featured and recently used views", text: "Surface your team's best-performing templates and pick up where the last campaign left off." },
  { icon: History, title: "Publish or unpublish drafts", text: "Keep in-progress templates unpublished until they're ready for the rest of the workspace to see." },
  { icon: FolderOpen, title: "Official vs. workspace source", text: "Every card is labelled as MunchReach official or created by your workspace, so provenance is always clear." },
];

const workflowSteps = [
  { title: "Search or browse", text: "Filter the library by category, or search templates, subjects and body copy directly." },
  { title: "Preview the copy", text: "Read the full subject, body and variable list before committing to it." },
  { title: "Insert into a step", text: "Apply the template to a new draft or a specific step in a sequence." },
  { title: "Set variable fallbacks", text: "Confirm what each merge field falls back to for incomplete prospect data." },
  { title: "Personalize", text: "Adjust the offer, proof point or call to action for this specific campaign." },
  { title: "Save it back", text: "Name, categorize and optionally feature your edited version in the workspace library." },
  { title: "Reuse next time", text: "Find it again from Featured or Recently Used the next time you build a sequence." },
];

const useCases = [
  { icon: Building2, audience: "SaaS founders", scenario: "Reuse a trial-expiring or demo-follow-up template across every outbound campaign instead of rewriting the offer each time.", outcome: "Consistent messaging, launched in minutes." },
  { icon: Briefcase, audience: "Agencies", scenario: "Keep a categorized library of case-study and results-driven openers tagged by service line.", outcome: "New client pitches reuse proven structure." },
  { icon: UserSearch, audience: "Recruiters", scenario: "Save passive-candidate openers with fallback values for role and company so nothing renders broken.", outcome: "Faster candidate outreach with clean copy." },
  { icon: Users, audience: "Sales teams", scenario: "Promote a rep's best-performing subject line into a shared, featured workspace template.", outcome: "The whole team sends the strongest version." },
  { icon: Handshake, audience: "Partnership managers", scenario: "Tag templates by partnership stage — intro, proposal, follow-up — so nothing gets sent out of order.", outcome: "A predictable, organized outreach cadence." },
  { icon: Megaphone, audience: "Growth and marketing", scenario: "Duplicate an official breakup or referral template and adapt the tone for a specific segment.", outcome: "Faster experimentation without starting from scratch." },
];

const docGroups = [
  {
    title: "Variables, fallbacks and personalization",
    items: [
      "Merge fields like {{first_name}}, {{company}} and custom fields parsed automatically from subject and body",
      "Per-variable fallback text so a missing field never sends a broken merge tag",
      "Personalize any inserted template per campaign without changing the saved original",
      "Preview shows the exact variables a template expects before you use it",
    ],
  },
  {
    title: "Team, sharing and use in sequences",
    items: [
      "Workspace templates are visible to every teammate with library access",
      "Official MunchReach templates sit alongside your own in the same searchable library",
      "Insert a template directly into any step of a multi-step sequence",
      "Duplicate a template to branch a variant without touching the shared original",
    ],
  },
  {
    title: "Organization, tagging and testing",
    items: [
      "Categories — Cold Outreach, Follow-Ups, SaaS, Agencies, Sales, Recruiting, Lead Generation, Partnership, Breakup, Referral",
      "Featured flag to surface your team's go-to templates above the rest",
      "Search across name, subject, body and description text",
      "Preview and publish/unpublish controls to test wording before it's live",
    ],
  },
];

const bullets = [
  "Templates cover both first-touch and follow-up steps, including breakup emails",
  "Variables are extracted from the subject and body the moment you type them",
  "Fallback values are set per template, not guessed at send time",
  "Recently Used and Featured views surface what your team reaches for most",
  "Category filter and free-text search work together to narrow the library",
  "Duplicate creates an independent, editable copy — the source is never modified",
  "Manage permissions control who can edit, publish or delete workspace templates",
  "Preview dialog renders the full subject, body and variable list before use",
];

const beforeAfter = {
  before: [
    "Every campaign starts from an empty subject and body field",
    "Your best-performing email lives in one person's sent folder",
    "Untagged drafts scattered across old campaigns are hard to find again",
    "Missing prospect data produces broken merge tags in live sends",
    "No visibility into whether a template is official or someone's edit",
  ],
  after: [
    "A searchable, categorized library is the starting point for every send",
    "Strong copy is saved once and reused across the whole workspace",
    "Templates are tagged by category and surfaced by Featured or Recently Used",
    "Fallback values keep every render clean, even on incomplete records",
    "Every card shows whether it's official or workspace-created",
  ],
};

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Templates"
        title="A reusable copy library,"
        highlight="not a blank page"
        description="Search, preview and insert proven cold email templates into any campaign — with variables, safe fallbacks and a shared workspace library your whole team can build on."
        benefits={["Official + workspace templates in one library", "Variables with per-field fallback values", "Insert straight into any sequence step"]}
        secondaryCta="See How It Works"
        secondaryHref="#how-it-works"
      />
      <BigPreview id="product" eyebrow="Template library" title="Everything you need to launch faster" description="Browse, preview and insert templates without leaving your campaign.">
        <div className="p-4 sm:p-6">
          <MockPanel title="Templates — All">
            <MockRows rows={[
              { left: "SaaS trial expiring", muted: "Cold Outreach · Official", right: "Featured" },
              { left: "Agency case study drop", muted: "Agencies · Workspace" },
              { left: "Passive candidate opener", muted: "Recruiting · Official", right: "Featured" },
              { left: "Breakup email v2", muted: "Breakup · Workspace" },
              { left: "Referral ask", muted: "Referral · Workspace" },
            ]} />
          </MockPanel>
        </div>
      </BigPreview>
      <Section title="The problem with writing every email from scratch" description="Cold email quality suffers when nothing you've written before is easy to find and reuse.">
        <PainPoints items={pains} />
      </Section>
      <Section id="how-it-works" title="How the template library works" description="From search to a saved, reusable version of your own.">
        <Walkthrough steps={walkthroughSteps} />
      </Section>
      <Section title="What you get" description="Everything below is included on every plan.">
        <FeatureBento items={features} />
      </Section>
      <Section title="A typical template workflow" description="From first search to a version your team reuses next quarter.">
        <WorkflowStrip steps={workflowSteps} />
      </Section>
      <Section title="Built for how different teams write outreach" description="The same library, organized around each team's outreach style.">
        <UseCaseGrid items={useCases} />
      </Section>
      <Section title="Deep capabilities" description="What's actually under the hood of the template library.">
        <DocSection groups={docGroups} />
      </Section>
      <Section title="Details that matter" muted>
        <BulletList items={bullets} />
      </Section>
      <Section title="Before and after a shared template library">
        <BeforeAfter before={beforeAfter.before} after={beforeAfter.after} />
      </Section>
      <TestimonialCarousel page="templates" title="Copy that gets replies" />
      <Section muted>
        <PageFaqs page="templates" defaults={faqs} />
      </Section>
      <CtaBlock
        title="Build a copy library your whole team can reuse"
        description="Stop rewriting the same email every campaign — save it once, tag it, and let your team find it next time."
      />
    </MarketingLayout>
  );
}
