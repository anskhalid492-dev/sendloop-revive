# MunchMate product and pricing knowledge

## Implemented
- Current published Help articles always augment enabled indexed knowledge; descriptions, keywords, quick answers and FAQs participate in retrieval. A nonempty incomplete index no longer hides available Help articles.
- Topic-expanded lexical scoring supports broad product questions and multiple related sources. This is semantic topic expansion, not vector embeddings. Brand words alone cannot qualify an unrelated question.
- Each answer reads explicitly projected public plan/feature configuration. Correct cents, monthly/yearly/one-time prices, contact/email/mailbox/campaign/team limits and feature access replace the old incorrect pricing field names. Cached pricing is not treated as current authority.
- Direct pricing, affordability and lifetime answers use deterministic public catalogue facts, avoiding omitted limits and model arithmetic drift. Other answers retain the existing configured provider/model and response limits with improved factual sales guidance.
- Identity answers, recommendation deduplication, contextual follow-up retrieval and encoded knowledge boundaries were added. Numeric feature capacity stays distinct from actual feature inclusion.
- Existing Admin index refresh now writes the same structured public pricing and published Help/overview sources; database-source failures stop refresh before replacing the existing index.

## Verified
- 71 isolated checks passed across MunchMate retrieval/product-pricing and Help Center regressions. All ten requested questions have grounded-context or identity coverage. Additional checks assert configured cent prices and requested limits, $29/4,000/10,000 Starter values, $99/15,000 original lifetime values, trial allowance semantics, feature exclusions and unknown-vs-unlimited values.
- All ten questions were exercised in anonymous localhost preview conversations using the existing configured AI provider. Product/plan answers returned instead of generic knowledge fallback; no browser runtime errors were observed.
- Public preview configuration showed Starter $39/month, Growth $79/month, Scale $349/month, Lifetime Starter $29 once and Lifetime Deal $99 once. Original lifetime current configuration included 20,000 contacts and 15,000 monthly initial emails. These are observed public values, not hardcoded defaults.
- A final regression corrected a collision between unlimited automation capacity and excluded automation access.

## Unchanged / limitations
- Chat UI, mascot, tickets, authentication, support, billing, campaigns, mailbox and warmup behavior are unchanged. No migrations, production writes, deployments or publication were performed.
- Shared website/blog/FAQ index refresh was not executed; it requires the existing authorized Admin Refresh knowledge action. Current Help and pricing are read fresh without that action.
- Pricing-read failures omit cached authority and direct visitors to public plan pages, rather than inventing values. Custom/crawled copy is subordinate to current pricing instructions.
- Model-generated product replies remain probabilistic and retain existing response limits, including the 4,000-character sanitizer. Detailed output may be truncated; this task does not promise every retrieved fact will appear in every generated response.