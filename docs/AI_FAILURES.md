# Where the AI Was Wrong

This document records real-world empirical failures observed during AI extraction and interpretation, and how application-layer deterministic code was added to handle them.

---

## Confirmed Issue 1 — Nonexistent Description Item Surfaced as Assumption Instead of Warning

**Observed during:** Manual live testing with R2 receipt (Aman, Priya, Karan, Sara)

**Trigger:**  
Description mentioned "Chicken Tikka" — an item not present on the R2 receipt.

**Incorrect AI behaviour:**  
The LLM correctly recognised that Chicken Tikka was absent and did not hallucinate it onto the bill. However, it surfaced the finding only inside the `assumptions` array (blue info section in UI), which was semantically incorrect. A financial allocation failure is not a benign interpretive assumption — it is a warning.

**Fix applied:**  
1. The description interpretation prompt now explicitly instructs the LLM to exclude unmatched items from `item_allocations` and record them in `assumptions` with a specific phrase pattern.  
2. The validation layer (`validator.ts`) scans all LLM-supplied assumptions for the "not found on the receipt" pattern and promotes matching entries to `flags` (amber warning section).  
3. The validator also continues to independently flag any `item_allocation` entry that fails fuzzy matching, as a fallback if the LLM disobeys the prompt instruction.  
4. Flags section is now shown above settle-up in the UI so warnings are the first thing users see.

---

## Confirmed Issue 2 — Provider 503 Left Stale Previous Result Visible

**Observed during:** Manual live testing when Gemini returned 503 Service Unavailable.

**Incorrect UI behaviour:**  
The frontend displayed the error message in red, but the **previous successful result** for a different receipt remained visible below it. A user could mistake the stale split for the current failed request's output.

**Fix applied:**  
`setResult(null)` is called at the very beginning of `handleSubmit`, before any async work. This ensures the results panel clears immediately on every new submission attempt, whether it succeeds or fails. A dedicated loading state panel is shown while the request is in-flight.

---

## Confirmed Issue 3 — LLM Truncated Printed Decimal Paise from Grand Total

**Observed during:** Live testing with R4 receipt (Dev, Nikhil, Anjali, Farah).

**Trigger:**  
The printed receipt had: Subtotal ₹1520, Discount -₹228, Service ₹76, Tax ₹68.40 → Exact grand total ₹1436.40.

**Incorrect AI behaviour:**  
On some runs, the LLM extracted `grand_total: 1436` (dropping `.40`), while correctly extracting `tax: 68.40`. This inconsistency caused a reconciliation mismatch between component arithmetic and the reported grand total.

**Fix applied:**  
1. Added explicit prompt rules instructing the OCR parser to preserve paise/decimals exactly as printed (e.g., `68.40` and `1436.40`).
2. Added post-extraction deterministic guard rail in `llmService.ts`: Recomputes expected grand total in integer paise (`subtotal + tax + service + tip + round_off - discount`). If extracted `grand_total` differs by >1 paise, application code automatically corrects `grand_total` to the recomputed value and adds an explanatory flag. No LLM arithmetic is involved in this correction.
