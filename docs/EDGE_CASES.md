# Edge Cases & Mitigation Strategies

Fair Split is designed around the principle of **"detected and flagged over guessed and returned confidently"**.

Below are the key edge cases handled by the system:

## 1. Unstated or Ambiguous Payer
- **Behavior**: `paid_by` is set to `"Unknown"`. Settle-up transfers are disabled (`settle_up: []`).
- **Flag Added**: `"Payer not stated in description."` or `"Stated payer is not listed among participants."`

## 2. Unmapped Description Items
- **Behavior**: Description items that fail fuzzy matching confidence threshold against receipt items are skipped from explicit item allocations.
- **Flag Added**: `"Description item 'X' could not be matched to any receipt line item."`

## 3. Receipt Arithmetic Mismatches & Truncation Guards
- **Behavior**: Extracted values are preserved as printed. Line item sums are checked against printed subtotals and grand totals.
- **Correction**: If extracted `grand_total` disagrees with component arithmetic (`subtotal + tax + service + tip + round_off - discount`), application code deterministically corrects `grand_total` and flags the adjustment.
- **Flag Added**: `"Sum of line items (₹X) does not match printed subtotal (₹Y)."` or `"Extracted grand total ₹X did not match component arithmetic..."`

## 4. Decimal & Paise-Level Grand Totals
- **Behavior**: Preserves exact printed decimal receipt grand totals (e.g. ₹1436.40). Internal calculations use integer paise (1 rupee = 100 paise) so no floating-point precision artifacts (e.g. `0.599999999999909`) occur.
- **Assumption Recorded**: Explains whole-rupee settlement rules when decimal paise exist on the receipt total.

## 5. Whole-Rupee Rounding Remainder
- **Behavior**: Proportional shares are rounded to nearest whole rupees. Any remaining difference ($\pm 1$ or $\pm 2$ rupees) is allocated deterministically to participants with the highest subtotal or fractional remainder.
- **Assumption Recorded**: `"Rounding remainder of ₹+1 allocated deterministically to [Name]..."`

## 6. Discounts & Service Charges
- **Behavior**: Discounts are represented as non-positive numbers in `discount_share` (e.g. `-20`) and allocated proportionally to pre-tax food subtotals. Bills with zero tax or service charge evaluate cleanly without division-by-zero errors.

## 7. Blank / Invalid Inputs
- **Behavior**: Empty images or missing descriptions trigger standard 400 Bad Request responses with explanatory JSON error payloads.
