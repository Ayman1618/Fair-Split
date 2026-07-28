# Prompt Log & Architectural Iterations

**Active Model:** `gemini-3.5-flash-lite`

The prompts were changed during testing as new failure cases appeared.

| Iteration | What Changed | Why |
|---|---|---|
| 1. Receipt Extraction | Asked Gemini to extract receipt items, subtotal, tax, service charge, discount, tip, round-off and grand total as structured JSON. | The model should read the receipt, not calculate the final split. |
| 2. Consumption Interpretation | Asked Gemini to identify the people, payer, who consumed each item, shared items and any assumptions from the description. | Converts plain-English descriptions into data the calculation engine can use. |
| 3. JSON-Only Output | Required JSON output using `responseMimeType: "application/json"` and a fixed structure. | Makes the response easier and safer for the application to parse. |
| 4. Unmatched Items | Told Gemini not to allocate description items that cannot be found on the receipt and to report them clearly. | Prevents nonexistent items from silently entering the bill split. |
| 5. Decimal Preservation | Added explicit instructions to preserve printed decimal values such as `68.40` and `1436.40` instead of rounding or truncating them. | Added after Gemini occasionally returned `1436` for a receipt total of `1436.40`. |
| 6. Receipt Total Guard | Added an application-side check of the extracted receipt components. Small sub-rupee precision errors may be corrected, while larger mismatches preserve the printed total and are flagged. | Fixes obvious decimal extraction errors without trusting potentially incorrect receipt components enough to invent a new total. |

---

## Arithmetic Decision

**Did you let the model do the arithmetic, or extract structured data and compute the totals in code? Why?**

- **What Gemini does:** Gemini is used to read the receipt and understand the natural-language description — things like the line items, who consumed what, and who paid. It returns this information as structured data rather than calculating the final split itself.

- **What the application does:** All money calculations are handled in TypeScript (`calcEngine.ts`). This includes splitting shared items, distributing tax, service charges and discounts, handling paise and rounding, and calculating how much each person needs to pay the payer.

- **Why this approach:** During testing, relying on the model for exact monetary values could lead to small extraction or rounding errors. Keeping the arithmetic in code makes the final calculations consistent and easy to verify, while still using Gemini for the parts it is useful for — reading the receipt and interpreting the user's description.
