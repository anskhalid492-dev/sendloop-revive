# Add missing integration logos

## Scope
- Add static, official logo assets for OpenAI, Slack, and GoHighLevel.
- Map those assets into the existing shared integration-logo renderer.
- Show the same logos on the public Integrations page and customer Integrations settings.

## Technical details
- Keep the current integration catalog and fallback icons intact.
- Store assets locally; do not add runtime logo lookups or change integration behavior.
- Verify the three cards render their brand marks and run the focused checks.
