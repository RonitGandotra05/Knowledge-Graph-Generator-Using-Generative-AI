# Provider timing and paid alternatives

Verified on **2026-10-03**. This change makes long quota waits actionable: the workspace shows calculated OpenAI and Gemini alternatives, with calls, duration and estimated API charges. These are workload estimates, not fixed promises of a one-hour completion.

## What the user sees

- Long estimates show paid-provider time ranges immediately in the comparison summary. Expand it for request counts, prices and quota assumptions.
- Short runs keep the same comparison available without crowding the setup.
- Long live runs expose the comparison beside progress. Existing progress remains saved; switching providers starts a fresh extraction.
- **Models & connection options → Use my dashboard rate limits** accepts requests/minute, tokens/minute and requests/day for OpenAI or Gemini. Zero requests/day means no daily cap has been configured. Invalid or fractional limits disable Build and key checking.
- Quota settings are safe numeric draft fields; API keys remain memory-only and disappear on refresh.

## Verified rates versus assumptions

OpenAI’s published Tier 1 rates for **GPT-4.1 mini** and **GPT-4o mini** are 500 requests/minute, 200,000 tokens/minute and 10,000 requests/day. The app uses 80%: **400 RPM, 160,000 TPM, 8,000 RPD**. GPT-4.1 has a different Tier 1 token limit, 30,000 TPM; it receives a 24,000 TPM app budget. These model tables do not identify an individual project’s configured capacity. [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini), [GPT-4.1](https://developers.openai.com/api/docs/models/gpt-4.1).

Gemini’s current documentation sends users to AI Studio for active model/project quotas. It counts **input** tokens/minute and applies limits per project, rather than per key. We therefore label the paid comparison **“Paid planning example · enter AI Studio limits”**: 60 RPM, 120,000 input TPM and 3,000 RPD before headroom. Those numbers are app assumptions, not a Google quota claim. A separate conservative free-plan assumption uses 5 RPM, 20,000 input TPM and 50 RPD. Dashboard values replace either assumption. Gemini daily resets occur at midnight Pacific; the app’s rolling daily guard can be more conservative. [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

OpenAI’s readable response ceilings, including a lower project token ceiling, reduce the guard and remaining estimate. Both model and project remaining-token/reset headers constrain the next request. A standard OpenAI remaining-request header defaults to a minute window; explicit daily headers retain daily handling. Retry-After, rejected-key blocking and automatic checkpoint recovery continue to work. Browser CORS may hide response headers; dashboard assumptions remain necessary. [OpenAI rate-limit headers](https://developers.openai.com/api/docs/guides/rate-limits).

## How time is calculated

1. Traverse every eligible parsed body passage using the selected provider’s bounded context size; preserve paper identity and source references.
2. Estimate discovery plus potentially relevant relationship calls. Subtract completed sections for the current provider; alternative providers show a **full fresh run**.
3. Estimate input from excerpt bytes plus prompt/schema allowances. Include typical output and the maximum configured output for token/cost ranges.
4. Take the largest constraint: sequential response latency, minimum request spacing, RPM pacing or TPM pacing. Add daily-window delays where applicable. Gemini quota calculations reserve input only; its output/thinking tokens still count in cost and usage receipts.
5. Start with explicit latency assumptions: OpenAI 10–25 seconds/call; Gemini 6–15 seconds/call. Refine current-run latency from observed requests belonging to the same extraction configuration. Other account traffic, provider load and parsing/OCR can extend completion time.

There is no artificial one- or two-hour minimum. A small workload can finish in seconds or minutes; a large workload or restricted project can take longer. Responses remain serial with no repeated failed-generation calls. Higher dashboard quotas remove quota delays but cannot eliminate response latency.

Switching from Groq now restores the normal **6,000-token paid context** when its 1,000-token automatic context was selected. Deliberately smaller custom contexts remain respected. This reduces calls while retaining full passage traversal; it does not assert that any LLM discovers every important concept.

## Reproducible planning example

Synthetic input: 500 page-text entries, each containing `"Alpha relates to Beta. "` repeated 100 times. Use `documentFromPages`, default extraction options and an empty initial concept list. This is a timing-model check, **not a live model benchmark**.

| Provider/model                                      | Context tokens | Planned calls | Estimated API time | Estimated standard API charge |
| --------------------------------------------------- | -------------: | ------------: | -----------------: | ----------------------------: |
| Groq GPT-OSS 20B, conservative app ceilings         |          1,000 |         1,000 |     30.3–40.5 days |                 $0.418–$0.733 |
| OpenAI GPT-4.1 mini, published Tier 1 with headroom |          6,000 |           144 |      24–60 minutes |                 $0.603–$2.020 |
| Gemini 2.5 Flash, explicitly assumed paid scenario  |          6,000 |           144 |    14.4–36 minutes |                 $0.611–$3.905 |

Groq’s upper case needs 41 app quota windows because maximum output reservations contribute to the conservative daily estimate. Eligible free-plan charges may be $0 within actual free quota. Paid estimates use the repository’s dated standard price snapshot; taxes, credits and actual output may change billing. Evidence Atlas charges $0. A ChatGPT subscription does not include OpenAI API billing.

## Verification

Nine new unit regressions cover model-specific quotas, paid re-batching, dashboard pacing, unknown/private endpoints, Groq guard preservation, lower response ceilings, shared project resets, minute versus daily headers, Gemini input-only quota reservations with full usage accounting, and secret-free draft sanitization.

Three browser scenarios exercise the large-workload comparison and provider switch, invalid quota controls, history recovery without keys, and a real request sequence with intercepted OpenAI responses: the second request remains unsent until the entered pacing interval expires. No real API key or paid API charge is needed for these tests.

Final checks passed: **109 unit tests, 42 browser scenarios and seven production-browser checks**, plus strict TypeScript, production compilation and formatting. The full browser run includes nine public papers and the uploaded scanned PDF. See [TESTING.md](TESTING.md) for the complete verification results.
