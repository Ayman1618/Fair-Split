# Prompt Log & Architectural Iterations

## Iteration 1: Initial System Implementation

### Objectives & Prompt Goal
Implement "Fair Split" MVP according to hiring assignment specifications:
- Base64 receipt image + plain-English description input.
- Strict API contract (`POST /api/split`) returning `per_person`, `grand_total`, `reconciliation`, `paid_by`, `settle_up`, `assumptions`, and `flags`.
- Multimodal LLM (Gemini 1.5 Flash) handles semantic interpretation (receipt extraction & description parsing).
- Pure TypeScript calculation engine handles all currency math, proportional splits, rounding remainder allocation, and settle-up logic.

### Key Architectural Decisions
1. **Separation of LLM & Financial Logic**:
   - LLMs output structured JSON (`ReceiptData`, `DescriptionData`).
   - `calcEngine.ts` executes all financial allocation deterministically in application code to eliminate LLM arithmetic drift.

2. **Deterministic Rounding Allocation**:
   - Rounding remainders are assigned based on fractional remainder / highest subtotal ordering and logged transparently in `assumptions`.

3. **Validation Layer**:
   - Checks OCR extraction arithmetic and fuzzy item matching before computation, generating explicit `flags` when ambiguities occur.
