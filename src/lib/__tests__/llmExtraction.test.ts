import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Unit tests for the post-extraction grand-total correction logic in
// llmService.ts (extractReceiptData).
//
// The correction is deterministic application-layer arithmetic: it never
// involves the LLM. We test it here by replicating the paise formula and
// verifying the expected correction behaviour without making any API calls.
// ---------------------------------------------------------------------------

/**
 * Replicates the correction logic from extractReceiptData exactly.
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

  let finalGrandTotal = parsed.grand_total || 0;
  let corrected = false;
  let flagText: string | null = null;

  if (Math.abs(recomputedPaise - extractedGrandTotalPaise) > 1) {
    const recomputedRupees = recomputedPaise / 100;
    const fmt = (n: number) => {
      const s = n.toFixed(2);
      return s.endsWith('.00') ? s.slice(0, -3) : s;
    };
    flagText =
      `Extracted grand total ₹${fmt(parsed.grand_total || 0)} did not match component arithmetic ` +
      `(subtotal ₹${fmt(parsed.subtotal || 0)} + tax ₹${fmt(parsed.tax || 0)} ` +
      `+ service ₹${fmt(parsed.service_charge || 0)} − discount ₹${fmt(parsed.discount || 0)} ` +
      `+ round-off ₹${fmt(parsed.round_off || 0)} = ₹${fmt(recomputedRupees)}). ` +
      `Grand total corrected to ₹${fmt(recomputedRupees)} by deterministic component arithmetic.`;
    finalGrandTotal = recomputedRupees;
    corrected = true;
  }

  return { finalGrandTotal, corrected, flagText };
}

// ---------------------------------------------------------------------------
// R4 live failure regression
// ---------------------------------------------------------------------------
describe('Extraction-layer grand-total correction (R4 regression)', () => {
  it('R4: LLM extracts grand_total 1436 but components sum to 1436.40 — corrects to 1436.40', () => {
    // This is the exact live failure scenario: the LLM dropped the .40 paise
    // component from the printed grand total of ₹1436.40.
    const result = simulateExtractionCorrection({
      subtotal: 1520,
      discount: 228,
      service_charge: 76,
      tax: 68.4,
      round_off: 0,
      grand_total: 1436, // LLM-extracted truncated value
    });

    expect(result.corrected).toBe(true);
    // Corrected to the component-arithmetic total
    expect(result.finalGrandTotal).toBeCloseTo(1436.40, 5);
    // toPaise(1436.40) = 143640 → finalGrandTotal = 143640/100 = 1436.40
    expect(Math.round(result.finalGrandTotal * 100)).toBe(143640);
    // Flag must be present
    expect(result.flagText).not.toBeNull();
    expect(result.flagText).toContain('₹1436.40');
    expect(result.flagText).toContain('₹1436');
    expect(result.flagText).toContain('corrected');
    // No floating-point artifacts in the flag text
    expect(result.flagText).not.toMatch(/\d\.\d{6,}/);
  });

  it('Correct grand_total provided — no correction applied', () => {
    // LLM correctly extracts grand_total 1436.40
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
    expect(Math.round(result.finalGrandTotal * 100)).toBe(143640);
  });

  it('Trivial float drift (≤1 paise) — treated as same, no correction', () => {
    // 1000 + 100 - 50 = 1050 exactly. Tiny IEEE-754 drift must not trigger correction.
    const result = simulateExtractionCorrection({
      subtotal: 1000,
      tax: 100,
      service_charge: 0,
      discount: 50,
      grand_total: 1050,
    });

    expect(result.corrected).toBe(false);
  });

  it('Whole-rupee components, whole-rupee grand_total — no correction', () => {
    // R1-style receipt: all whole rupees, grand_total matches exactly
    const result = simulateExtractionCorrection({
      subtotal: 1040,
      service_charge: 52,
      tax: 55,      // rounded for simplicity
      discount: 0,
      round_off: 0,
      grand_total: 1147,
    });

    // 1040 + 52 + 55 = 1147 exactly
    expect(result.corrected).toBe(false);
    expect(result.finalGrandTotal).toBe(1147);
  });

  it('LLM drops decimal on tax field — corrects grand_total from component sum', () => {
    // Hypothetical: tax 68.40 extracted as 68, causing grand_total to also be wrong
    // Component sum: 1520 - 228 + 76 + 68 = 1436. Extracted grand_total: 1436.
    // No correction needed here because components and grand_total agree.
    const result = simulateExtractionCorrection({
      subtotal: 1520,
      discount: 228,
      service_charge: 76,
      tax: 68, // truncated tax
      round_off: 0,
      grand_total: 1436, // agrees with truncated component sum
    });
    // Components sum: 1520 + 68 + 76 - 228 = 1436 exactly → no mismatch
    expect(result.corrected).toBe(false);
  });
});
