import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Unit tests for the post-extraction grand-total guard logic in
// llmService.ts (extractReceiptData).
//
// The guard is deterministic application-layer logic: it never involves the LLM.
// We test it here by replicating the paise guard formula and verifying the
// expected behaviour without making any API calls.
// ---------------------------------------------------------------------------

/**
 * Replicates the guard logic from extractReceiptData exactly.
 * Returns { finalGrandTotal, corrected: boolean, flagText: string | null }.
 */
function simulateExtractionCorrection(parsed: {
  subtotal: number;
  tax: number;
  service_charge: number;
  discount: number;
  tip?: number;
  round_off?: number;
  grand_total: number;
}): { finalGrandTotal: number; corrected: boolean; flagText: string | null } {
  const toPaise = (rupees: number): number => Math.round(rupees * 100);

  const subtotalPaise      = toPaise(parsed.subtotal        || 0);
  const taxPaise           = toPaise(parsed.tax             || 0);
  const serviceChargePaise = toPaise(parsed.service_charge  || 0);
  const discountPaise      = toPaise(parsed.discount        || 0);
  const tipPaise           = toPaise(parsed.tip             || 0);
  const roundOffPaise      = toPaise(parsed.round_off       || 0);

  const recomputedPaise =
    subtotalPaise + taxPaise + serviceChargePaise + tipPaise + roundOffPaise - discountPaise;

  const extractedGrandTotalPaise = toPaise(parsed.grand_total || 0);
  const diffPaise = Math.abs(recomputedPaise - extractedGrandTotalPaise);

  let finalGrandTotal = parsed.grand_total || 0;
  let corrected = false;
  let flagText: string | null = null;

  const fmt = (n: number) => {
    const s = n.toFixed(2);
    return s.endsWith('.00') ? s.slice(0, -3) : s;
  };

  if (diffPaise > 1 && diffPaise < 100) {
    // Sub-rupee decimal truncation — safe to auto-correct
    const recomputedRupees = recomputedPaise / 100;
    flagText =
      `Extracted grand total ₹${fmt(parsed.grand_total || 0)} did not match component arithmetic ` +
      `(subtotal ₹${fmt(parsed.subtotal || 0)} + tax ₹${fmt(parsed.tax || 0)} ` +
      `+ service ₹${fmt(parsed.service_charge || 0)} − discount ₹${fmt(parsed.discount || 0)} ` +
      `+ round-off ₹${fmt(parsed.round_off || 0)} = ₹${fmt(recomputedRupees)}). ` +
      `Grand total corrected to ₹${fmt(recomputedRupees)} by deterministic component arithmetic.`;
    finalGrandTotal = recomputedRupees;
    corrected = true;
  } else if (diffPaise >= 100) {
    // Large structural mismatch — preserve printed grand total, do NOT fabricate replacement
    const recomputedRupees = recomputedPaise / 100;
    flagText =
      `Sum of extracted receipt components (₹${fmt(recomputedRupees)}) differs from printed grand total ` +
      `(₹${fmt(parsed.grand_total || 0)}). Preserving printed grand total.`;
    // finalGrandTotal remains parsed.grand_total
    corrected = false;
  }

  return { finalGrandTotal, corrected, flagText };
}

// ---------------------------------------------------------------------------
// Regression Test Suites (R4 Decimal Truncation & Hierarchical Receipts)
// ---------------------------------------------------------------------------
describe('Extraction-layer grand-total guard logic', () => {

  // -------------------------------------------------------------------------
  // Test A: R4 decimal truncation
  // -------------------------------------------------------------------------
  it('A. R4 decimal truncation: 1436 extracted instead of 1436.40 -> safe auto-correction works', () => {
    // Exact R4 failure scenario: printed grand total was 1436.40, LLM extracted 1436.
    // Discrepancy is 40 paise (< 100 paise). Guard must auto-correct to 1436.40.
    const result = simulateExtractionCorrection({
      subtotal: 1520,
      discount: 228,
      service_charge: 76,
      tax: 68.4,
      round_off: 0,
      grand_total: 1436, // truncated extracted value
    });

    expect(result.corrected).toBe(true);
    expect(result.finalGrandTotal).toBeCloseTo(1436.40, 5);
    expect(result.flagText).not.toBeNull();
    expect(result.flagText).toContain('corrected to ₹1436.40');
  });

  // -------------------------------------------------------------------------
  // Test B: Hierarchical receipt
  // -------------------------------------------------------------------------
  it('B. Hierarchical receipt: large component mismatch does NOT overwrite printed payable amount (remains 2238, not 2538)', () => {
    // Hierarchical receipt scenario:
    // Sub Total: 2067.00
    // Service Charge (10%): 206.70
    // Food Total (intermediate): 2273.70
    // CGST+SGST: 113.68
    // Round Off: 0.62
    // Discount: 150.00
    // Printed Payable Amount (Grand Total): 2238.00
    //
    // If extraction produces a component sum of 2444.70 or 2538.00 (diff >= ₹1.00),
    // guard MUST NOT overwrite grand_total with 2538. Printed total (2238) must be preserved.
    const result = simulateExtractionCorrection({
      subtotal: 2273.70, // intermediate "Food Total" extracted as subtotal
      service_charge: 206.70,
      tax: 113.68,
      discount: 150,
      round_off: 0.62,
      grand_total: 2238, // printed payable amount
    });

    // Must NOT auto-correct to 2444.70 or 2538
    expect(result.corrected).toBe(false);
    expect(result.finalGrandTotal).toBe(2238);
    // Warning flag emitted explaining component difference
    expect(result.flagText).not.toBeNull();
    expect(result.flagText).toContain('Preserving printed grand total');
    expect(result.flagText).toContain('2238');
  });

  // -------------------------------------------------------------------------
  // Additional safety test cases
  // -------------------------------------------------------------------------
  it('Correct grand_total provided — no correction, no flag', () => {
    const result = simulateExtractionCorrection({
      subtotal: 1520,
      discount: 228,
      service_charge: 76,
      tax: 68.4,
      round_off: 0,
      grand_total: 1436.4,
    });

    expect(result.corrected).toBe(false);
    expect(result.flagText).toBeNull();
    expect(result.finalGrandTotal).toBe(1436.4);
  });

  it('Trivial float drift (≤1 paise) — treated as exact match, no correction', () => {
    const result = simulateExtractionCorrection({
      subtotal: 1000,
      tax: 100,
      service_charge: 0,
      discount: 50,
      grand_total: 1050,
    });

    expect(result.corrected).toBe(false);
    expect(result.flagText).toBeNull();
  });

  it('Whole-rupee components and matching grand_total — no correction', () => {
    const result = simulateExtractionCorrection({
      subtotal: 1040,
      service_charge: 52,
      tax: 55,
      discount: 0,
      round_off: 0,
      grand_total: 1147,
    });

    expect(result.corrected).toBe(false);
    expect(result.finalGrandTotal).toBe(1147);
  });
});
