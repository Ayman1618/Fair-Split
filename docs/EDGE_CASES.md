# Edge Cases

Fair Split was tested with both normal and problematic inputs. When the app cannot safely decide something, it flags the issue instead of guessing.

---

## 1. Missing or Invalid Payer

**Input:** No payer is mentioned, or the payer is not part of the group.

**Handling:** Sets the payer to `Unknown`, shows a warning, and skips settle-up instructions.

**Verified:** ✅ Automated tests

---

## 2. Item Not Found on the Receipt

**Input:** The description mentions an item, such as "Chicken Tikka", that is not on the receipt.

**Handling:** Does not invent a price or allocation. The missing item is flagged.

**Verified:** ✅ Automated + manual testing

---

## 3. Complex Receipt With Intermediate Totals

**Input:** A receipt contains several stages such as subtotal → service charge → food total → GST → discount → final payable amount.

In one test, the printed total was **₹2238**, but the extracted components initially caused the app to calculate **₹2538**.

**Handling:** Large differences are no longer automatically "corrected". The printed payable amount is kept and the mismatch is flagged instead.

**Verified:** ✅ Automated regression test + manual before/after test

---

## 4. Different Sharing Rules

**Input:** Some items are shared by everyone while others belong to specific people.

**Handling:** Specific allocations are applied first; remaining items follow the general sharing rule.

**Verified:** ✅ Automated + manual testing

---

## 5. Decimal / Paise Values

**Input:** Values such as ₹68.40 or a grand total of ₹1436.40.

**Handling:** Money is checked using integer paise. Clear sub-rupee extraction errors can be safely corrected.

**Verified:** ✅ Automated + manual R4 testing

---

## 6. Receipt Arithmetic Does Not Add Up

**Input:** Item prices do not match the subtotal, or extracted charges do not match the printed total.

**Handling:** Shows a warning instead of changing values just to make the bill reconcile.

**Verified:** ✅ Automated tests

---

## 7. Rounding After Splitting

**Input:** Fractional shares leave the rounded person totals ₹1–₹2 away from the settlement total.

**Handling:** The difference is distributed using a fixed rounding rule and recorded as an assumption.

**Verified:** ✅ Automated test

---

## 8. No Discount or Service Charge

**Input:** The receipt has no discount, no service charge, or both are zero.

**Handling:** Their shares remain ₹0 and the rest of the split works normally.

**Verified:** ✅ Automated tests

---

## 9. Payer Also Ate

**Input:** The person who paid also has their own share of the bill.

**Handling:** Their share is calculated normally, but no payment from the payer to themselves is created.

**Verified:** ✅ Automated test

---

## 10. No Participants Identified

**Input:** The description does not provide a usable group of people.

**Handling:** Returns a warning instead of inventing participants or attempting an invalid split.

**Verified:** ✅ Automated test

---

## 11. Poor or Unclear Receipt Image

**Input:** The receipt is blurry, cropped, badly lit, or difficult to read.

**Handling:** Validation may catch inconsistent values, but correct OCR cannot be guaranteed. Detected problems are flagged rather than forced to match.

**Verified:** ⚠️ Manually explored, not exhaustively tested

---

## 12. Missing API Input

**Input:** The receipt image or description is missing from the request.

**Handling:** The API rejects the request instead of attempting an incomplete split.

**Verified:** ✅ API validation implemented

---

## 13. Multiple Payers

**Input:** Two or more people paid different parts of the bill.

**Handling:** Not supported in this version. Fair Split currently uses a single-payer settlement model.

**Verified:** ⚠️ Known limitation; intentionally not implemented

---

## Overall Approach

Fair Split does not assume that every receipt can be understood perfectly.

- Safe cases are calculated in code.
- AI output is corrected only when there is clear evidence.
- Uncertain cases are flagged instead of guessed.
- Unsupported cases are stated openly.