# Rebuild the MunchReach pricing comparison

## Goal
Update the existing `/pricing` page only. Preserve the live Free Trial, Starter, Growth, and Scale prices and limits while replacing customer-facing sending-capacity wording with “Email Accounts” and rebuilding “Compare all features” from verified product capabilities.

## What will change
- Replace pricing-page references to “Sending Domains” or “Sending accounts” when they mean customer mailbox capacity with “Email Accounts.” Keep genuine DNS/domain terminology unchanged.
- Replace the current database-row-driven comparison with a comprehensive, curated comparison grouped into:
  - Workspace & account
  - Leads & contacts
  - Campaigns & sequences
  - Email accounts & sending
  - AI & personalization
  - Inbox & CRM
  - Analytics
  - Mailboxes
  - Integrations
  - Support & billing
- Show each plan’s status as a clear included check, unavailable dash, or a real limit/value sourced from the existing plan record and entitlement flags.
- Keep the comparison horizontally scrollable on smaller screens, use a sticky feature column and plan headings where practical, and improve row hierarchy and scanability without changing the site’s design language.

## Accuracy safeguards
- Audit current routes, feature modules, provider configuration, entitlement gates, and billing plan fields before adding a row.
- Include only implemented integrations and capabilities; omit anything unsupported or uncertain.
- Derive numerical limits directly from the existing plan records. Do not hardcode new prices, quotas, or plan limits.
- Use existing boolean plan flags and feature rows for plan-specific availability. Where a capability is core and ungated, mark it consistently across plans.
- Do not modify billing, checkout, entitlement enforcement, database schema, or sending behavior.

## Verification
- Add focused tests for terminology, category coverage, real plan-derived limits, and feature-status rendering.
- Check the pricing page at desktop and mobile widths for readable headings, no clipped labels, and usable horizontal comparison.
- Confirm pricing metadata remains unique and unchanged except where terminology requires correction.
