# Polish dashboard metrics and correct Analytics delivery totals

## Scope
- Keep the dashboard structure, card dimensions, four-column layout, values, comparisons, and responsive behavior unchanged.
- Keep the Warmup table and every non-Health column unchanged.
- Do not alter campaign, warmup, sending, or tracking behavior.

## Changes
1. **Customer Analytics delivered figures**
   - Ensure totals, timeline points, campaign rows, mailbox rows, and funnel display delivered as accepted sends minus confirmed bounces, while preserving a higher provider-confirmed count.
   - Keep the existing shared delivery calculation as the sole presentation rule so all customer Analytics surfaces agree.

2. **Today’s Outbound cards**
   - Add compact Lucide metric icons with restrained blue/violet semantic tints.
   - Add an info icon next to each title with the supplied compact hover/focus/click tooltip copy.
   - Improve visual hierarchy using subtle borders, surface tint, and spacing without changing card size or layout.

3. **Warmup Health column only**
   - Replace the plain badge with a compact health treatment: small status icon, score label, and circular progress ring.
   - Map display labels from the existing score only: 90–100 Healthy, 70–89 Good / Watch, 50–69 Needs Attention, below 50 At Risk.
   - Preserve all health calculations, table columns, row layout, actions, and other data.

## Verification
- Run focused analytics/stat tests and the project’s automated checks.
- Inspect Dashboard, Analytics, and Warmup at desktop and narrow widths, including zoom-equivalent viewport checks.
