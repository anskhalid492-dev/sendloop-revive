# MunchMate chat validation fix

## Root cause
The widget sent the entire saved conversation to a validator capped at 30 messages and 4,000 characters per entry. Constructed pricing replies bypassed output bounds, so one oversized stored answer could break every subsequent question. Validation ran before the provider error handler, and the widget displayed the thrown error verbatim. The server also silently shortened the latest question to 2,000 characters and sent excessive retrieved article context.

## Changes
- Shared request-copy compaction runs before chat validation and again at the provider boundary. Each conversation message is at most 4,000 characters. The latest valid question is unchanged, including whitespace; older context is shortened/discarded first. Oversized new questions receive a friendly request to shorten them instead of silent truncation.
- Full browser history remains unchanged. Ticket creation, transcript persistence, feedback, provider selection and stored credentials are retained.
- Knowledge uses relevant bounded excerpts. System instructions remain intact and are divided into text blocks of at most 4,000 characters for OpenAI and Claude.
- Context/length validation failures retry once with fewer older turns and shorter excerpts; authentication and general outages do not trigger context retries. Existing OpenAI unsupported-parameter compatibility is retained.
- Constructed pricing answers now obey the same output limit as model replies, preventing new oversized history entries.
- Chat input validation, configuration/retrieval errors and provider failures receive controlled friendly responses. The browser never renders caught exception text, including ticket-form exceptions.
- Server-only structured diagnostics record stage, provider, error class/status, context/auth/rate category and validation issue paths/codes/maximum. They deliberately exclude raw provider bodies, prompts, history, secrets and stack traces.

## Verification
52 isolated tests passed across four files, including short/4,000/4,001-character inputs, 80-entry oversized legacy history, 40 consecutive questions, excerpt selection, both provider payloads, one successful/failed context retry, authentication non-retry and log privacy.

Preview browser checks used a named local throwaway conversation fixture with 80 entries. Identity, mailbox connection and lead import answered consecutively without technical errors. An interrupted request showed the friendly error and support actions; earlier history remained. Latest automatic compilation reported build OK.

Both provider integrations were exercised with mocked HTTP responses, not both live credentials. Actual ticket submission was not performed because no authorized named throwaway authenticated account was supplied; no production records/settings changed. Nothing published or deployed.