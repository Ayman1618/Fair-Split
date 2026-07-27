# Prompt Log & Architectural Iterations

## Model Configuration

- **Active Model**: `gemini-3.5-flash-lite` (via `@google/generative-ai` SDK with `responseMimeType: "application/json"`).

---

## Iteration 1: Initial System Implementation

### Objectives & Prompt Goal
- Base64 receipt image + plain-English description input.
- Strict API contract (`POST /api/split`).
- Multimodal LLM extracts structured receipt data and interprets consumption rules.
- TypeScript engine handles financial calculations, proportional allocations, whole-rupee settlement, and settle-up.

### Prompt Strategy
1. **Receipt Extraction Prompt**:
   - Instructs the model to extract exact item names, quantities, line totals, subtotal, tax, service charge, discount, tip, round-off, and grand total.
   - Outputs strict raw JSON conforming to `ReceiptData`.

2. **Description Interpretation Prompt**:
   - Accepts available receipt items and description text.
   - Extracts participants (`people`), designated `payer`, explicit `item_allocations`, `default_consumers`, and `assumptions`.

---

## Iteration 2: Robust Edge Case & Precision Enhancements

### Prompt Enhancements
1. **Unmatched Description Items**:
   - Instructed the model to exclude unmatched items from `item_allocations` and record them as explicit assumption patterns, allowing `validator.ts` to promote them to warning `flags`.

2. **Decimal & Paise Preservation Rules**:
   - Explicit prompt rules added to `extractReceiptData`:
     - *NEVER round or truncate monetary values.*
     - *Preserve every decimal digit exactly as printed.*
     - *Indian receipt paise amounts (e.g. 68.40, 1436.40) must be preserved numerically as-is.*

3. **Deterministic Guard Rail (Application Layer)**:
   - Added application-layer post-extraction component arithmetic check (`subtotal + tax + service + tip + round_off - discount`). If the LLM drops decimal paise from `grand_total`, the application layer deterministically corrects `grand_total` and logs an extraction correction flag.
