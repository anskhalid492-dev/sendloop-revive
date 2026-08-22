# Sendloop Migration Project

enable Supabase

MIGRATE THE EXISTING SENDLOOP PROJECT TO THIS LOVABLE ACCOUNT

I am moving my existing Sendloop project from another Lovable account to this account.

I need the entire application recreated/migrated here while reconnecting it to the EXACT SAME SUPABASE PROJECT.

IMPORTANT:

DO NOT create a new Supabase project.

DO NOT create a new database.

DO NOT create new authentication.

DO NOT delete, reset, migrate, overwrite, or modify existing production data unnecessarily.

The existing Supabase project is the source of truth.

==================================================

1. PROJECT MIGRATION

==================================================

Recreate/import the complete existing Sendloop application, including:

- Public website

- Homepage

- Features

- Pricing

- Blog

- About

- Contact

- Terms

- Privacy

- Resources

- Authentication

- Sign Up

- Sign In

- Forgot Password

- Reset Password

- Onboarding

- Customer Dashboard

- Campaigns

- Campaign Builder

- Leads

- Email Accounts

- Unified Inbox

- Follow-ups

- Warmup

- CRM

- Analytics

- Templates

- Workspaces

- Billing

- Settings

- Support

- Notifications

- Admin Dashboard

- Admin Users

- Admin Workspaces

- Admin Email Infrastructure

- Admin Providers

- Admin Sending Pool

- Admin Email Accounts

- Admin Inbound Email

- Admin Logs

Preserve the existing UI, routing, functionality and business logic wherever possible.

==================================================

2. SAME SUPABASE PROJECT

==================================================

Reconnect this project to the EXISTING Supabase project.

Use the existing:

- Supabase URL

- Supabase anon/public key

- Supabase database

- Supabase Auth

- Storage

- Realtime

- Edge Functions where applicable

- Existing tables

- Existing relationships

- Existing RLS policies

- Existing users

- Existing workspaces

- Existing leads

- Existing campaigns

- Existing conversations

- Existing messages

- Existing email accounts

- Existing CRM data

- Existing templates

- Existing billing data

Do NOT create replacement tables if the required tables already exist.

Inspect the existing schema first.

==================================================

3. ENVIRONMENT VARIABLES

==================================================

Identify all environment variables required by the existing application.

At minimum check for:

SUPABASE_URL

SUPABASE_ANON_KEY

Also identify any existing server-side variables for:

- Email providers

- Resend

- Inbound email

- Webhooks

- Stripe

- Storage

- Other backend services

Do NOT expose secret keys in frontend code.

If an environment variable is missing in this new Lovable project, clearly list it as:

MISSING ENVIRONMENT VARIABLE

Do not invent values.

Do not replace it with a mock value.

==================================================

4. AUTHENTICATION

==================================================

The existing Supabase Auth users must continue working.

Do NOT create a new authentication system.

Test:

- Sign up

- Sign in

- Sign out

- Session persistence

- Password reset

- Email verification

- Protected routes

- Customer/admin role detection

Existing users must be able to log in using their existing accounts.

==================================================

5. CUSTOMER / ADMIN SEPARATION

==================================================

Preserve the existing role architecture.

CUSTOMER:

- Dashboard

- Campaigns

- Leads

- Email Accounts

- Unified Inbox

- Warmup

- CRM

- Analytics

- Templates

- Workspace

- Settings

- Billing

- Support

ADMIN:

- Admin Dashboard

- Users

- Workspaces

- Providers

- Sending Infrastructure

- Sending Pool

- Email Account Assignment

- Inbound Email

- Email Events

- Logs

- Billing/System controls

Customers must NEVER access admin data by changing URLs.

Preserve and verify Supabase RLS.

==================================================

6. EXISTING DATA SAFETY

==================================================

This is critical.

DO NOT:

- Delete existing data

- Drop tables

- Reset the database

- Recreate production users

- Recreate workspaces

- Replace existing leads

- Replace existing campaigns

- Replace conversations

- Replace email accounts

The existing Supabase database is production data.

Only read and connect to it unless a schema change is genuinely required.

If a schema mismatch is found:

STOP before destructive changes.

Explain exactly what is different.

==================================================

7. EMAIL SYSTEM

==================================================

Preserve the existing managed sending architecture.

Customers must NOT connect:

- SMTP

- Amazon SES

- Resend

- Mailgun

- Postmark

- Brevo

- API keys

These remain Sendloop-managed infrastructure.

Preserve the existing:

- Sending Engine

- Sending Accounts

- Provider adapters

- Campaign sending

- Reply-To routing

- Inbound email system

- Unified Inbox

- Email threading

- Webhooks

==================================================

8. INBOUND EMAIL

==================================================

Preserve the existing inbound architecture.

If already configured, reconnect:

- Inbound domain

- Resend inbound

- Webhook endpoint

- Webhook secret

- Inbound processing

- Conversation matching

- Supabase Realtime

Do NOT create a second inbound system.

Do NOT change the production webhook URL unless absolutely necessary.

If the webhook URL depends on the old Lovable deployment, identify this clearly and create the correct new endpoint while preserving the same processing logic.

==================================================

9. SUPABASE REALTIME

==================================================

Verify that the new application connects to the existing Supabase Realtime channels.

Test:

- New inbox reply

- Notifications

- Conversation updates

- Email account updates

- Campaign updates

- Workspace changes

==================================================

10. STORAGE

==================================================

Reconnect existing Supabase Storage buckets.

Do NOT create duplicate buckets if existing buckets already exist.

Verify:

- User avatars

- Attachments

- Campaign assets

- Email attachments

- Other existing files

==================================================

11. BILLING

==================================================

Preserve the existing billing architecture.

Do NOT create duplicate customers/subscriptions.

Reconnect existing Stripe/customer IDs if applicable.

Verify:

- Current plan

- Usage

- Billing

- Upgrade

- Subscription status

- Invoices

Do not create test subscriptions in production.

==================================================

12. ROUTING

==================================================

Preserve all existing routes.

Verify:

Public routes

→ Marketing website

Authenticated routes

→ Customer application

Admin routes

→ Admin application

Unauthenticated user accessing protected page

→ Sign In

Customer accessing admin route

→ Access denied

==================================================

13. UI

==================================================

Preserve the existing Sendloop design system.

Do not redesign the application during migration.

The purpose of this task is:

MIGRATE

→ RECONNECT

→ VERIFY

Not:

REBUILD

→ REDESIGN

→ REPLACE

==================================================

14. REMOVE DUPLICATES

==================================================

Before creating anything:

Inspect the existing Supabase database.

Inspect the existing application structure.

Reuse existing:

- Tables

- Components

- Routes

- Functions

- APIs

- Policies

- Auth

- Storage

- Realtime

Do not create duplicate systems.

==================================================

15. MIGRATION VERIFICATION

==================================================

After reconnecting Supabase, verify:

AUTH:

✓ Existing user can sign in

✓ Existing session works

✓ Logout works

DATA:

✓ Existing workspace appears

✓ Existing leads appear

✓ Existing campaigns appear

✓ Existing email accounts appear

✓ Existing templates appear

✓ Existing CRM data appears

✓ Existing conversations appear

CUSTOMER:

✓ Dashboard

✓ Campaign Builder

✓ Leads

✓ Email Accounts

✓ Unified Inbox

✓ Warmup

✓ CRM

✓ Analytics

✓ Templates

✓ Settings

ADMIN:

✓ Admin login

✓ Users

✓ Workspaces

✓ Email Infrastructure

✓ Providers

✓ Sending Accounts

✓ Inbound Events

EMAIL:

✓ Existing sending configuration preserved

✓ Reply-To routing preserved

✓ Inbound webhook preserved

✓ Unified Inbox preserved

✓ Email threading preserved

==================================================

16. PRODUCTION SAFETY

==================================================

Treat the existing Supabase project as PRODUCTION.

Do not run destructive migrations.

Do not execute:

DROP TABLE

TRUNCATE

DELETE

RESET DATABASE

unless I explicitly approve it.

Do not modify RLS policies unnecessarily.

Do not modify production data just to make the new frontend work.

==================================================

17. FINAL OUTPUT

==================================================

After migration, give me a clear report:

CONNECTED:

- Supabase project

- Auth

- Database

- Storage

- Realtime

- Existing functions

WORKING:

- Customer dashboard

- Admin dashboard

- Campaigns

- Leads

- Email Accounts

- Unified Inbox

- CRM

- Warmup

- Templates

- Billing

MISSING CONFIGURATION:

List ONLY environment variables, secrets, domains, webhooks or external services that are genuinely missing.

DO NOT SAY THE MIGRATION IS COMPLETE IF EXISTING USERS OR PRODUCTION DATA CANNOT BE ACCESSED.

The goal is for this new Lovable project to behave as the SAME Sendloop application connected to the SAME Supabase backend and SAME production data, just managed from this new Lovable account.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1068fd05-79ee-44fc-9230-0fbdfc76d42c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
