# Where the AI Was Wrong

This document records three issues found during manual testing where the AI extraction or interpretation was incorrect or incomplete. It also explains how each issue was caught and fixed using prompt improvements, validation, and deterministic application code.

---

## Issue 1 — Nonexistent Item Was Treated as an Assumption Instead of a Warning

**Observed during:** Manual testing with the R2 receipt.

![alt text](image-8.png)

**Test case:**  
The description mentioned "Chicken Tikka", but Chicken Tikka did not exist anywhere on the uploaded receipt.

![alt text](image-4.png)

### What the AI got wrong

Gemini correctly noticed that Chicken Tikka was not present on the receipt and did not add a fake item to the bill.

However, it returned this information as an `assumption`. This made the problem appear in the normal Interpretive Assumptions section.

This is not just an assumption. If a user says they consumed an item that cannot be found on the receipt, the application should clearly warn them instead of silently continuing.

### How it was fixed

The interpretation prompt was updated to tell Gemini not to include unmatched items in `item_allocations`.

The validation layer in `validator.ts` also checks the AI output. If an assumption says that an item was "not found on the receipt", it is promoted to a warning flag.

As a second safety check, the validator independently verifies item allocations against the actual receipt items.

### Result

The application no longer treats a missing receipt item as a harmless assumption. It shows a visible warning to the user while avoiding hallucinated charges.

![alt text](image-5.png)

---

## Issue 2 — Decimal Paise Was Dropped From the Grand Total

**Observed during:** Live testing with the R4 receipt.

**Test case:**  
The receipt contained:

- Subtotal: ₹1520
- Discount: ₹228
- Service charge: ₹76
- GST: ₹68.40
- Grand Total: ₹1436.40

![alt text](image-7.png)

### What the AI got wrong

On some runs, Gemini extracted the grand total as:

`1436`

instead of:

`1436.40`

The tax value of ₹68.40 was extracted correctly, but the `.40` was dropped from the grand total.

This created a mismatch between the extracted total and the receipt components.

### How it was fixed

The receipt extraction prompt was updated with explicit instructions to preserve decimal and paise values exactly as printed.

A deterministic post-extraction check was also added. Receipt components are converted to integer paise and checked using:

`subtotal + tax + service + tip + round_off - discount`

For small sub-rupee differences, such as ₹1436 being extracted instead of ₹1436.40, application code can safely correct the precision error.

The calculation is done in TypeScript rather than asking Gemini to fix its own arithmetic.

### Result

The R4 receipt now produces the correct ₹1436.40 grand total while the final whole-rupee settlement remains deterministic and reconciled.

![alt text](image-6.png)
---

## Issue 3 — Intermediate Receipt Totals Caused the Wrong Grand Total

**Observed during:** Manual testing with a real hierarchical restaurant receipt.

**Test case:**  
The printed payable amount on the receipt was ₹2238.

The receipt contained several intermediate totals and charges. During extraction, some of these values were interpreted in a way that made the application's component arithmetic produce ₹2538.

![alt text](image-1.png)

### What the AI got wrong

The receipt had a more complicated structure than the simpler test receipts.

Gemini's extraction of the receipt components caused an intermediate total or charge structure to be interpreted incorrectly. The original arithmetic guard then trusted the extracted components and replaced the printed ₹2238 grand total with ₹2538.

So even though ₹2238 was the actual payable amount printed on the receipt, the application displayed ₹2538.

![alt text](image-2.png)

### How it was fixed

The extraction prompt was updated to distinguish the final payable amount from intermediate values such as food totals and subtotals.

The deterministic grand-total guard was also made more conservative.

If the component calculation differs from the printed grand total only by a small sub-rupee amount, the application can correct it as a likely decimal extraction issue.

If the difference is ₹1 or more, the application does **not** automatically replace the printed grand total. It preserves the printed payable amount and can flag the structural mismatch instead.

This prevents the application from creating a new total from potentially misread receipt components.

### Result

Using the same receipt and the same description after the fix:

- Before fix: ₹2538
- Correct printed total: ₹2238
- After fix: ₹2238
- Sum of person totals: ₹2238
- Reconciliation: Reconciled

![alt text](image-3.png)

---

## What These Failures Changed

These tests reinforced the main design decision of Fair Split:

**AI interprets the input, but application code controls the money.**

Gemini is useful for reading receipts and understanding descriptions such as who ate what. However, its output is treated as untrusted structured data.

The application therefore uses:

- prompt constraints to improve extraction,
- validation to catch suspicious AI output,
- integer-paise arithmetic for monetary calculations,
- conservative correction rules,
- and visible warnings when the input cannot be safely reconciled.

This keeps the AI useful for interpretation without relying on it for deterministic financial calculations.