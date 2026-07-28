# Prompt Log & Architectural Iterations

- **Active Model**: `gemini-3.5-flash-lite` (via `@google/generative-ai` SDK with `responseMimeType: "application/json"`).

| Iteration | Prompt / Change | Why |
|---|---|---|
| 1. Multimodal OCR Extraction | Extract line items, subtotal, tax, service, discount, tip, round_off, and grand_total as raw JSON conforming to `ReceiptData`. | Converts unstructured receipt images into structured numeric fields without performing LLM arithmetic. |
| 2. Consumption Interpretation | Extract `people`, `payer`, explicit `item_allocations`, `default_consumers`, and `assumptions` from plain-English text. | Translates human consumption rules into structured consumer-to-item mappings for the calculation engine. |
| 3. JSON Output Constraints | Configured `responseMimeType: "application/json"` and strict schema instructions in prompt. | Guarantees deterministic JSON parsing and eliminates markdown wrapping or conversational boilerplate. |
| 4. Unmatched Item Handling | Instructed model to exclude unmatched items from `item_allocations` and format them as explicit assumption patterns. | Enables the application validation layer (`validator.ts`) to promote unmatched items to prominent warning flags. |
| 5. Decimal & Paise Preservation | Added explicit OCR rules: *NEVER round/truncate monetary values; preserve printed decimals (e.g. 68.40, 1436.40) exactly.* | Prevents the multimodal model from dropping decimal paise components on Indian restaurant receipts. |
| 6. Post-Extraction Arithmetic Guard | Application-layer check (`subtotal + tax + service + tip + round_off - discount`). Deterministically corrects `grand_total` if LLM drops decimals. | Guarantees complete arithmetic consistency without relying on LLM arithmetic. |

---

## Arithmetic Decision

**Did you let the model do the arithmetic, or extract structured data and compute the totals in code? Why?**

- **Structured Extraction Only**: Gemini extracts structured line items and interprets natural-language consumption rules. It **never** calculates the bill split or currency totals.
- **Application Code Computes Money**: Item consumer shares, proportional tax/service/discount allocation, integer paise conversion, whole-rupee settlement rounding, and settle-up balances are calculated deterministically in TypeScript (`calcEngine.ts`).
- **Why**: LLMs are probabilistic models prone to arithmetic drift, rounding inaccuracies, and hallucinations. Computing all monetary totals in application code ensures financial calculations are 100% deterministic, testable, auditable, and reproducible.
