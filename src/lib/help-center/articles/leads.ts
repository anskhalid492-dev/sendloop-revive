import type { HelpArticle } from "../types";

const UPDATED = "2026-09-10";

export const LEAD_ARTICLES: HelpArticle[] = [
  {
    slug: "add-a-lead",
    title: "How to add a lead",
    description: "Add a single lead by hand and fill the fields that matter.",
    category: "leads",
    updated: UPDATED,
    keywords: ["add lead", "new lead", "manual", "create contact"],
    related: ["import-leads", "required-lead-fields", "edit-leads"],
    content: `## Steps
1. Go to Leads.
2. Click **Add lead**.
3. Enter the email address — this is the only required field and it is what makes the lead unique in the workspace.
4. Fill in first name, last name, company, job title and location if you have them; these are what your variables will use.
5. Save.

## Important notes
- Adding an address that already exists updates that lead instead of creating a duplicate.
- Add the lead to a list at the same time if it belongs to a specific audience.`,
  },
  {
    slug: "import-leads",
    title: "How to import leads",
    description: "Run the CSV import wizard from upload to finished list.",
    category: "leads",
    updated: UPDATED,
    popular: true,
    gettingStarted: true,
    keywords: ["import", "csv", "upload leads", "bulk add", "import wizard"],
    related: ["csv-import-guide", "csv-column-mapping", "why-import-skipped-rows", "lead-lists"],
    content: `## Steps
1. Go to Leads and click **Import CSV**.
2. Choose your file. Imports take up to 10,000 rows per file.
3. **Map** your columns to MunchReach fields. Most are guessed for you; check every one.
4. **Review** the summary: valid rows, invalid rows with reasons, and rows already in your workspace.
5. Set **Import into list** so the leads land in the right list, and add tags if you use them.
6. Answer the **Is this list verified?** question honestly. Answering No shows a warning, because unverified lists are the main cause of bounce damage.
7. Finish.

## Important notes
- Every imported lead also appears under All leads. The list is an extra grouping, not a separate store.
- Suppressed addresses stay suppressed after import; re-importing does not un-suppress anyone.

## Common problems
- **Leads went to All leads only** — Import into list was left unset on the review step.
- **Rows skipped** — see "Why did my import skip rows?".`,
  },
  {
    slug: "csv-import-guide",
    title: "Complete CSV import guide",
    description: "File format, required columns, working examples, and every common error.",
    category: "leads",
    updated: UPDATED,
    popular: true,
    keywords: ["csv", "file format", "encoding", "utf-8", "delimiter", "example csv"],
    related: ["import-leads", "csv-column-mapping", "why-import-skipped-rows", "csv-import-failed"],
    content: `## File requirements
- Comma-separated \`.csv\`, UTF-8 encoded
- One header row
- Up to 10,000 rows per file — split larger lists
- One email address per row

## A valid file
\`\`\`
email,first_name,last_name,company,title,city
ana@acme.com,Ana,Silva,Acme Packaging,Head of Ops,Lisbon
tom@northline.io,Tom,Reed,Northline,Operations Manager,Denver
\`\`\`

## Files that will cause problems
Two addresses in one cell:
\`\`\`
email,first_name
ana@acme.com; ops@acme.com,Ana
\`\`\`

Missing header row — the first lead is consumed as column names:
\`\`\`
ana@acme.com,Ana,Silva
tom@northline.io,Tom,Reed
\`\`\`

Semicolon-separated export saved as \`.csv\`:
\`\`\`
email;first_name;company
ana@acme.com;Ana;Acme
\`\`\`

## Required and recommended fields
**Required:** email.
**Strongly recommended:** first name, company. These are the variables most sequences depend on, and a missing value is where personalization visibly breaks.
**Useful:** last name, job title, location, website, plus any custom field you want to merge into copy.

## Common errors and fixes
- **"Invalid email"** — typos, trailing spaces, or a name in the email column. Clean the source file.
- **Everything mapped to one column** — the file is not comma separated. Re-export as CSV, or open in a spreadsheet and save as comma separated.
- **Accented characters look wrong** — re-save as UTF-8.
- **Duplicate rows** — only the first occurrence is kept, which is usually what you want.
- **Import silently smaller than expected** — check the review counts: invalid, in-file duplicates and already-in-workspace are all reported separately.

## Troubleshooting steps
1. Open the file in a plain-text editor and confirm the header and the delimiter.
2. Import 10 rows first to validate the mapping.
3. Then import the full file into the same list.`,
    faqs: [
      {
        q: "Can I import custom fields?",
        a: "Yes. In the mapping step choose Custom field for that column, and the value becomes available as a variable in your copy.",
      },
      {
        q: "What happens to leads already in my workspace?",
        a: "They are reported as already present and not duplicated. Existing data is preserved.",
      },
      {
        q: "Can I import an Excel file?",
        a: "Save it as CSV first. Excel workbooks are not read directly.",
      },
    ],
  },
  {
    slug: "csv-column-mapping",
    title: "CSV column mapping",
    description: "Match your columns to MunchReach fields, including full-name splitting.",
    category: "leads",
    updated: UPDATED,
    keywords: ["mapping", "columns", "map fields", "full name", "custom field", "ignore column"],
    related: ["csv-import-guide", "import-leads", "required-lead-fields"],
    content: `The mapping step guesses a field for each column from the header name. Always check the guesses.

## Options per column
- A standard field — email, first name, last name, company, job title, location and so on
- **Full name → split into first + last** — for a single "name" column
- **Full name → first name only** — when you only want a greeting
- **Custom field** — stored on the lead and usable as a variable
- **Ignore column** — skip it entirely

## Important notes
- Email must be mapped; the import cannot proceed without it.
- Mapping is per import. Keep your export template consistent and the guesses will be right every time.

## Common problems
- **Names appear as "Ana Silva" in a first-name greeting** — use the split option instead of mapping the whole name to first name.`,
  },
  {
    slug: "required-lead-fields",
    title: "Required and recommended lead fields",
    description: "What MunchReach needs, and what your copy needs.",
    category: "leads",
    updated: UPDATED,
    keywords: ["required fields", "fields", "recommended", "data quality"],
    related: ["csv-import-guide", "variables-and-fallbacks", "ai-what-data-is-used"],
    content: `## Required
Email address. It is the unique key for a lead in a workspace.

## Recommended
- **First name** — greetings
- **Company** — relevance in the opening line
- **Job title** — targeting and tone
- **Location** — timezone context and local references
- **Website** — the single most useful field for AI personalization

## Custom fields
Anything else you import can be stored as a custom field and merged into copy.

## Important notes
Every variable you use should have a fallback. Data completeness is never 100%, and a fallback is what stops that showing.`,
  },
  {
    slug: "why-import-skipped-rows",
    title: "Why did my import skip rows?",
    description: "Every skipped row is reported with a reason and a count.",
    category: "leads",
    updated: UPDATED,
    popular: true,
    keywords: ["skipped", "rows missing", "not imported", "duplicates", "invalid"],
    related: ["csv-import-guide", "duplicate-leads", "leads-missing-after-import"],
    content: `Rows are skipped for three reasons only.

## Invalid email
The address failed validation and would bounce, which hurts domain reputation.

## Duplicate inside the file
The same address appeared more than once in the upload; only the first occurrence is kept.

## Already in the workspace
Leads are unique per workspace and email, so an existing lead is not duplicated.

## Steps
The review step lists each reason with counts, and shows the specific reason on invalid rows, so you can fix the source file and re-import just those rows.`,
  },
  {
    slug: "lead-lists",
    title: "Working with lead lists",
    description: "Create, rename and delete lists, and understand All leads.",
    category: "leads",
    updated: UPDATED,
    keywords: ["lists", "folders", "segments", "all leads", "organise"],
    related: ["your-first-lead-list", "import-leads", "filter-leads"],
    content: `Lists are the sidebar on the Leads page. **All leads** shows everything in the workspace; each list below it is a named subset.

## Steps
1. Click **New** in the sidebar to create a list.
2. Import into it, or select leads and use Bulk actions → Add to list.
3. Rename or delete a list from its row menu.

## Important notes
- A lead can be in several lists at once.
- Deleting a list does not delete the leads in it.
- Campaigns pull their audience from lists, so a clean list structure is what keeps audiences from overlapping.`,
  },
  {
    slug: "search-leads",
    title: "Searching leads",
    description: "Find a lead quickly by name, email or company.",
    category: "leads",
    updated: UPDATED,
    keywords: ["search", "find lead", "lookup"],
    related: ["filter-leads", "lead-statuses", "edit-leads"],
    content: `## Steps
1. Go to Leads.
2. Use the search box in the toolbar. It matches name, email and company.
3. Open a result to see the lead's detail, including campaign history and conversations.

## Important notes
Search runs across the current list. Switch to All leads first if you are not sure where the lead lives.`,
  },
  {
    slug: "filter-leads",
    title: "Filtering leads",
    description: "Build precise segments with the Filters panel.",
    category: "leads",
    updated: UPDATED,
    keywords: ["filter", "segment", "advanced search", "criteria"],
    related: ["lead-statuses", "lead-lists", "add-leads-to-campaign", "export-leads"],
    content: `## Steps
1. Go to Leads and click **Filters**.
2. Combine any of: Name, Email, Company, Job title, Location, Campaign, Created from and Created to, and a Custom field with a value.
3. Narrow further with the Lead status checkboxes and Tag checkboxes.
4. Apply.

## What to do with the result
Select all matching leads and use Bulk actions to add them to a list, add them to a campaign, tag them, change status or export them.

## Important notes
Filters are a live view, not a saved segment. Add the result to a list if you want it to persist.`,
  },
  {
    slug: "edit-leads",
    title: "Editing leads",
    description: "Update a single lead or change many at once.",
    category: "leads",
    updated: UPDATED,
    keywords: ["edit", "update lead", "bulk edit", "tags", "status"],
    related: ["lead-statuses", "filter-leads", "delete-leads"],
    content: `## One lead
Open the lead from the table and edit its fields in the detail panel. Changes take effect immediately, including in copy that has not yet been rendered.

## Many leads
Select leads with the checkboxes and use **Bulk actions**: Add to list, Remove from list, Add tag, Remove tag, Add to campaign, Remove from campaign, Set status, Export selected, Delete.

## Important notes
Editing a lead does not change messages that have already been sent or already been rendered into the queue.`,
  },
  {
    slug: "delete-leads",
    title: "Deleting leads",
    description: "Remove leads permanently, and what it does to campaigns.",
    category: "leads",
    updated: UPDATED,
    keywords: ["delete", "remove lead", "purge", "gdpr delete"],
    related: ["edit-leads", "suppressed-leads", "privacy-basics"],
    content: `## Steps
1. Select the leads on the Leads page.
2. Bulk actions → **Delete**, then confirm.

## What happens
The lead is removed from the workspace and from any campaign queue it was in. Messages already sent stay in your history and analytics.

## Important notes
- Deletion is permanent. Export first if you might need the data.
- Deleting a lead does not remove a suppression record. That is deliberate: it stops a deleted-and-re-imported address being emailed after it bounced or unsubscribed.`,
  },
  {
    slug: "export-leads",
    title: "Exporting leads",
    description: "Download a CSV of a list, a filter result or a selection.",
    category: "leads",
    updated: UPDATED,
    keywords: ["export", "download", "csv export", "backup leads"],
    related: ["filter-leads", "export-workspace-data", "api-contacts"],
    content: `## Steps
1. Go to Leads and select a list, or apply filters.
2. Click **Export** to download everything in view, or select rows and use Bulk actions → Export selected.

## Important notes
- The export includes standard fields and your custom fields.
- For programmatic exports, use \`GET /contacts/export\` in the API.`,
  },
  {
    slug: "lead-statuses",
    title: "Lead statuses explained",
    description: "What each status means and how it changes.",
    category: "leads",
    updated: UPDATED,
    keywords: ["status", "new", "contacted", "replied", "interested", "bounced", "unsubscribed"],
    related: ["campaign-recipients", "suppressed-leads", "filter-leads"],
    content: `**New** — in the workspace, never contacted.
**Contacted** — at least one campaign email has been sent.
**Replied** — the lead answered.
**Interested** — marked as a positive reply.
**Not interested** — marked as a negative reply.
**Meeting** — a meeting was booked.
**Bounced** — mail to this address was rejected.
**Unsubscribed** — the lead opted out.
**Completed** — finished a sequence without replying.
**Paused** — excluded from sending for now.

## Important notes
Some statuses change automatically from sending and reply events; others you set yourself, individually or in bulk. Bounced and unsubscribed also create suppression records, which is what actually stops future sends.`,
  },
  {
    slug: "campaign-recipients",
    title: "Campaign recipients and eligibility",
    description: "Why the recipient count differs from the list count.",
    category: "leads",
    updated: UPDATED,
    keywords: ["recipients", "eligible", "audience count", "why fewer"],
    related: ["add-leads-to-campaign", "suppressed-leads", "launch-readiness"],
    content: `A recipient is a lead attached to a campaign. Eligible recipients are the ones that will actually be queued.

## What removes a lead from eligibility
- A suppression record: hard bounce, complaint or unsubscribe
- Already being a recipient of this campaign
- Being paused

## Important notes
The eligible count on the readiness bar is computed against the database and persisted, so it is the number you can trust — not the raw list size.`,
  },
  {
    slug: "suppressed-leads",
    title: "Suppressed, bounced, unsubscribed and complained leads",
    description: "How suppression works and why it is not reversible on a whim.",
    category: "leads",
    updated: UPDATED,
    popular: true,
    keywords: ["suppression", "bounced", "unsubscribed", "complained", "do not contact", "blocked"],
    related: ["how-suppression-works", "bounce-complaint-protection", "lead-statuses"],
    content: `## What suppression is
A workspace-wide record that an address must not be emailed again. It is created by a hard bounce, a spam complaint or an unsubscribe.

## What it does
Suppressed addresses are excluded from every campaign audience automatically, in every list, forever — including after re-import.

## Steps to review
Filter leads by the bounced or unsubscribed status to see who is affected and why.

## Important notes
- Suppression protects your domain reputation and keeps you on the right side of opt-out obligations. Removing a suppression to email someone who opted out is not something you should do.
- Temporary failures are not the same as hard bounces and do not suppress an address.`,
  },
  {
    slug: "duplicate-leads",
    title: "Duplicate lead handling",
    description: "How MunchReach keeps one record per address.",
    category: "leads",
    updated: UPDATED,
    keywords: ["duplicate", "dedupe", "same email twice"],
    related: ["why-import-skipped-rows", "csv-import-guide", "api-contacts"],
    content: `Leads are unique per workspace and email address.

## During import
Duplicates inside the file are collapsed to the first occurrence. Addresses already in the workspace are reported and skipped rather than duplicated.

## Over the API
\`POST /contacts\` with an existing address updates that record instead of creating a second one.

## Across lists
The same lead in two lists is still one lead. Adding both lists to one campaign will not email them twice.

## Common problems
- **The same person on two addresses** — MunchReach cannot know these are the same human. De-duplicate by person in your source data if that matters to you.`,
  },
  {
    slug: "crm-pipeline-basics",
    title: "Working the CRM pipeline",
    description: "Stages, the contact drawer, tasks and notes.",
    category: "leads",
    updated: UPDATED,
    keywords: ["crm", "pipeline", "stages", "deals", "contact drawer"],
    related: ["unified-inbox", "lead-statuses", "conversation-statuses"],
    content: `The CRM board shows contacts as cards grouped by pipeline stage.

## Moving contacts
Drag a card to another stage. The change is persisted immediately and appears on the contact's activity timeline.

## The contact drawer
Opening a contact shows its activity timeline, linked conversations and campaign history, plus tasks and notes.

## Where contacts come from
Contacts are created from replies and from leads you work, so the pipeline reflects real conversations rather than a separate list you maintain by hand.`,
  },
];
