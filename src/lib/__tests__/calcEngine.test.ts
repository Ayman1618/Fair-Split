import { describe, it, expect } from 'vitest';
import { calculateBillSplit } from '../calcEngine';
import { ReceiptData, DescriptionData } from '../../types';
import { validateReceiptAndDescription } from '../validator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeReceipt(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    items: [{ name: 'Pizza', quantity: 1, line_total: 500 }],
    subtotal: 500,
    service_charge: 0,
    tax: 0,
    discount: 0,
    round_off: 0,
    grand_total: 500,
    ...overrides,
  };
}

function makeDesc(overrides: Partial<DescriptionData> = {}): DescriptionData {
  return {
    people: ['Alice', 'Bob'],
    payer: 'Alice',
    item_allocations: [],
    default_consumers: ['Alice', 'Bob'],
    assumptions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Reference Bills R1–R4
// ---------------------------------------------------------------------------
describe('Reference Bills (R1–R4)', () => {
  it('R1: Ravi, Neha, Sameer — individual items, round-off', () => {
    const receipt: ReceiptData = {
      items: [
        { name: 'Cappuccino', quantity: 1, line_total: 180 },
        { name: 'Grilled Chicken Sandwich', quantity: 1, line_total: 260 },
        { name: 'Penne Arrabiata', quantity: 1, line_total: 320 },
        { name: 'Fresh Lime Soda', quantity: 1, line_total: 120 },
        { name: 'Brownie', quantity: 1, line_total: 160 },
      ],
      subtotal: 1040,
      service_charge: 52,
      tax: 54.6,
      discount: 0,
      round_off: 0.4,
      grand_total: 1147,
    };
    const description: DescriptionData = {
      people: ['Ravi', 'Neha', 'Sameer'],
      payer: 'Sameer',
      item_allocations: [
        { item_name: 'Cappuccino', consumers: ['Ravi'] },
        { item_name: 'Grilled Chicken Sandwich', consumers: ['Ravi'] },
        { item_name: 'Penne Arrabiata', consumers: ['Neha'] },
        { item_name: 'Fresh Lime Soda', consumers: ['Neha'] },
        { item_name: 'Brownie', consumers: ['Sameer'] },
      ],
      default_consumers: ['Ravi', 'Neha', 'Sameer'],
      assumptions: [],
    };
    const result = calculateBillSplit(receipt, description);
    expect(result.grand_total).toBe(1147);
    expect(result.reconciliation.sum_of_person_totals).toBe(1147);
    expect(result.reconciliation.matches_bill).toBe(true);
    expect(result.paid_by).toBe('Sameer');
    expect(result.settle_up).toHaveLength(2);
    const ravi = result.settle_up.find((s) => s.from === 'Ravi');
    const neha = result.settle_up.find((s) => s.from === 'Neha');
    expect(ravi?.to).toBe('Sameer');
    expect(neha?.to).toBe('Sameer');
    expect(
      (ravi?.amount || 0) +
        (neha?.amount || 0) +
        (result.per_person.find((p) => p.name === 'Sameer')?.total || 0)
    ).toBe(1147);
  });

  it('R2: Aman, Priya, Karan, Sara — subset sharing, negative round-off', () => {
    const receipt: ReceiptData = {
      items: [
        { name: 'Paneer Butter Masala', quantity: 1, line_total: 320 },
        { name: 'Dal Makhani', quantity: 1, line_total: 260 },
        { name: 'Butter Naan', quantity: 4, line_total: 240 },
        { name: 'Jeera Rice', quantity: 1, line_total: 180 },
        { name: 'Gulab Jamun', quantity: 2, line_total: 120 },
        { name: 'Masala Papad', quantity: 2, line_total: 100 },
      ],
      subtotal: 1220,
      service_charge: 61,
      tax: 64.05,
      discount: 0,
      round_off: -0.05,
      grand_total: 1345,
    };
    const description: DescriptionData = {
      people: ['Aman', 'Priya', 'Karan', 'Sara'],
      payer: 'Priya',
      item_allocations: [{ item_name: 'Gulab Jamun', consumers: ['Priya', 'Karan'] }],
      default_consumers: ['Aman', 'Priya', 'Karan', 'Sara'],
      assumptions: [],
    };
    const result = calculateBillSplit(receipt, description);
    expect(result.grand_total).toBe(1345);
    expect(result.reconciliation.sum_of_person_totals).toBe(1345);
    expect(result.reconciliation.matches_bill).toBe(true);
    expect(result.paid_by).toBe('Priya');
    expect(result.settle_up).toHaveLength(3);
    expect(result.settle_up.every((s) => s.to === 'Priya')).toBe(true);
  });

  it('R3: Ishaan, Meera, Rohit — subset beers + mojito', () => {
    const receipt: ReceiptData = {
      items: [
        { name: 'Margherita Pizza', quantity: 1, line_total: 380 },
        { name: 'Arrabiata Pasta', quantity: 1, line_total: 340 },
        { name: 'Garlic Bread', quantity: 1, line_total: 160 },
        { name: 'Craft Beer', quantity: 2, line_total: 500 },
        { name: 'Virgin Mojito', quantity: 1, line_total: 180 },
      ],
      subtotal: 1560,
      service_charge: 78,
      tax: 81.9,
      discount: 0,
      round_off: 0.1,
      grand_total: 1720,
    };
    const description: DescriptionData = {
      people: ['Ishaan', 'Meera', 'Rohit'],
      payer: 'Rohit',
      item_allocations: [
        { item_name: 'Craft Beer', consumers: ['Ishaan', 'Rohit'] },
        { item_name: 'Virgin Mojito', consumers: ['Meera'] },
      ],
      default_consumers: ['Ishaan', 'Meera', 'Rohit'],
      assumptions: [],
    };
    const result = calculateBillSplit(receipt, description);
    expect(result.grand_total).toBe(1720);
    expect(result.reconciliation.sum_of_person_totals).toBe(1720);
    expect(result.reconciliation.matches_bill).toBe(true);
    expect(result.paid_by).toBe('Rohit');
  });

  it('R4: Dev, Nikhil, Anjali, Farah — discount + quantities + paise grand total (live receipt)', () => {
    // Matches the actual live receipt: 1520 - 228 + 76 + 68.40 = 1436.40
    // This is the exact scenario that exposed the floating-point remainder bug.
    const receipt: ReceiptData = {
      items: [
        { name: 'Chicken Biryani', quantity: 2, line_total: 560 },
        { name: 'Veg Biryani', quantity: 1, line_total: 240 },
        { name: 'Mutton Rogan Josh', quantity: 1, line_total: 420 },
        { name: 'Raita', quantity: 2, line_total: 120 },
        { name: 'Soft Drinks', quantity: 3, line_total: 180 },
      ],
      subtotal: 1520,
      discount: 228,
      service_charge: 76,
      tax: 68.4,
      round_off: 0,
      grand_total: 1436.4, // exact printed receipt value; paise component is ₹0.40
    };
    const description: DescriptionData = {
      people: ['Dev', 'Nikhil', 'Anjali', 'Farah'],
      payer: 'Anjali',
      item_allocations: [
        { item_name: 'Chicken Biryani', consumers: ['Dev', 'Nikhil'] },
        { item_name: 'Veg Biryani', consumers: ['Anjali'] },
        { item_name: 'Mutton Rogan Josh', consumers: ['Farah'] },
      ],
      default_consumers: ['Dev', 'Nikhil', 'Anjali', 'Farah'],
      assumptions: [],
    };
    const result = calculateBillSplit(receipt, description);

    // grand_total must preserve the exact receipt value (₹1436.40)
    expect(result.grand_total).toBe(1436.4);

    // Per-person totals are whole-rupee; sum must equal Math.round(1436.40) = 1436
    expect(result.reconciliation.sum_of_person_totals).toBe(1436);

    // Reconciliation is true at the whole-rupee settlement level
    expect(result.reconciliation.matches_bill).toBe(true);

    expect(result.paid_by).toBe('Anjali');
    for (const p of result.per_person) {
      expect(p.discount_share).toBeLessThanOrEqual(0);
      // All per-person totals must be whole integers (no paise leakage)
      expect(Number.isInteger(p.total)).toBe(true);
    }

    // No floating-point artifacts must appear in any assumption or flag string
    for (const asm of result.assumptions) {
      expect(asm).not.toMatch(/\d\.\d{6,}/);
    }
    for (const flag of result.flags) {
      expect(flag).not.toMatch(/\d\.\d{6,}/);
    }

    // Assumptions must explain the paise component in human-readable form
    const paiseAssumption = result.assumptions.find((a) =>
      a.includes('paise component')
    );
    expect(paiseAssumption).toBeDefined();
    expect(paiseAssumption).toContain('₹1436.40');
    expect(paiseAssumption).toContain('₹0.40');
  });
});

// ---------------------------------------------------------------------------
// Payer edge cases
// ---------------------------------------------------------------------------
describe('Payer edge cases', () => {
  it('Missing payer: sets paid_by=Unknown, no settle_up, adds flag', () => {
    const result = calculateBillSplit(
      makeReceipt(),
      makeDesc({ payer: null })
    );
    expect(result.paid_by).toBe('Unknown');
    expect(result.settle_up).toHaveLength(0);
    expect(result.flags).toContain('Payer not stated in description.');
  });

  it('Payer named but not in participants: sets paid_by=Unknown, flags', () => {
    const result = calculateBillSplit(
      makeReceipt(),
      makeDesc({ payer: 'Ghost', people: ['Alice', 'Bob'], default_consumers: ['Alice', 'Bob'] })
    );
    expect(result.paid_by).toBe('Unknown');
    expect(result.flags.some((f) => f.includes('Ghost'))).toBe(true);
  });

  it('Payer does not owe themselves — their settle_up entry is absent', () => {
    const result = calculateBillSplit(
      makeReceipt({ grand_total: 500, subtotal: 500 }),
      makeDesc({ payer: 'Alice', people: ['Alice', 'Bob'], default_consumers: ['Alice', 'Bob'] })
    );
    expect(result.settle_up.every((s) => s.from !== 'Alice')).toBe(true);
    expect(result.settle_up.some((s) => s.from === 'Bob')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Proportional charge allocation
// ---------------------------------------------------------------------------
describe('Proportional charge allocation', () => {
  it('Tax distributed proportionally to food subtotals', () => {
    // Use distinct item names with no shared tokens to avoid fuzzy cross-match
    const receipt = makeReceipt({
      items: [
        { name: 'Cappuccino', quantity: 1, line_total: 300 },
        { name: 'Brownie', quantity: 1, line_total: 100 },
      ],
      subtotal: 400,
      tax: 40,
      grand_total: 440,
    });
    const desc = makeDesc({
      people: ['Alice', 'Bob'],
      item_allocations: [
        { item_name: 'Cappuccino', consumers: ['Alice'] },
        { item_name: 'Brownie', consumers: ['Bob'] },
      ],
      default_consumers: ['Alice', 'Bob'],
    });
    const result = calculateBillSplit(receipt, desc);
    const alice = result.per_person.find((p) => p.name === 'Alice')!;
    const bob = result.per_person.find((p) => p.name === 'Bob')!;
    // Alice has 3/4 of food so 30 tax, Bob 1/4 so 10 tax
    expect(alice.tax_share).toBe(30);
    expect(bob.tax_share).toBe(10);
    expect(result.reconciliation.matches_bill).toBe(true);
  });

  it('No service charge: service_share is 0 for all', () => {
    const result = calculateBillSplit(
      makeReceipt({ grand_total: 500, subtotal: 500, service_charge: 0 }),
      makeDesc()
    );
    for (const p of result.per_person) {
      expect(p.service_share).toBe(0);
    }
  });

  it('No discount: discount_share is 0 for all', () => {
    const result = calculateBillSplit(
      makeReceipt({ grand_total: 500, subtotal: 500, discount: 0 }),
      makeDesc()
    );
    for (const p of result.per_person) {
      // Use toBeLessThanOrEqual(0) and toBeGreaterThanOrEqual(0) to handle -0 vs +0 in JS
      expect(Math.abs(p.discount_share)).toBe(0);
    }
  });

  it('Bill-level discount allocated proportionally', () => {
    // Distinct non-overlapping item names
    const receipt: ReceiptData = {
      items: [
        { name: 'Paneer Tikka', quantity: 1, line_total: 600 },
        { name: 'Brownie', quantity: 1, line_total: 400 },
      ],
      subtotal: 1000,
      discount: 200,
      service_charge: 0,
      tax: 0,
      round_off: 0,
      grand_total: 800,
    };
    const desc = makeDesc({
      people: ['Alice', 'Bob'],
      item_allocations: [
        { item_name: 'Paneer Tikka', consumers: ['Alice'] },
        { item_name: 'Brownie', consumers: ['Bob'] },
      ],
      default_consumers: ['Alice', 'Bob'],
    });
    const result = calculateBillSplit(receipt, desc);
    const alice = result.per_person.find((p) => p.name === 'Alice')!;
    const bob = result.per_person.find((p) => p.name === 'Bob')!;
    // Alice 60% of food → discount_share = -120, Bob 40% → -80
    expect(alice.discount_share).toBe(-120);
    expect(bob.discount_share).toBe(-80);
    expect(result.reconciliation.matches_bill).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rounding remainder
// ---------------------------------------------------------------------------
describe('Rounding remainder allocation', () => {
  it('Remainder allocated deterministically — sum always equals grand_total', () => {
    // Crafted to produce a rounding remainder
    const receipt: ReceiptData = {
      items: [
        { name: 'Item A', quantity: 1, line_total: 100 },
        { name: 'Item B', quantity: 1, line_total: 100 },
        { name: 'Item C', quantity: 1, line_total: 100 },
      ],
      subtotal: 300,
      tax: 10,   // 10/3 = 3.33... each → rounding needed
      service_charge: 0,
      discount: 0,
      round_off: 0,
      grand_total: 310,
    };
    const desc: DescriptionData = {
      people: ['A', 'B', 'C'],
      payer: 'A',
      item_allocations: [
        { item_name: 'Item A', consumers: ['A'] },
        { item_name: 'Item B', consumers: ['B'] },
        { item_name: 'Item C', consumers: ['C'] },
      ],
      default_consumers: ['A', 'B', 'C'],
      assumptions: [],
    };
    const result = calculateBillSplit(receipt, desc);
    expect(result.reconciliation.sum_of_person_totals).toBe(310);
    expect(result.reconciliation.matches_bill).toBe(true);
    expect(result.assumptions.some((a) => a.includes('Rounding remainder'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R4 regression — decimal grand totals (paise-level amounts)
// ---------------------------------------------------------------------------
describe('R4 regression — decimal grand total reconciliation', () => {
  it('grand_total with paise reconciles correctly; sum_of_person_totals is whole rupees', () => {
    // Minimal reproduction of the R4 live failure: grand_total has paise,
    // per-person totals are whole-rupee, matches_bill must still be true.
    const receipt: ReceiptData = {
      items: [
        { name: 'Item X', quantity: 1, line_total: 100 },
        { name: 'Item Y', quantity: 1, line_total: 100 },
      ],
      subtotal: 200,
      tax: 10.5, // 10.5 paise → causes paise in grand total
      service_charge: 0,
      discount: 0,
      round_off: 0,
      grand_total: 210.5, // 210 rupees + 50 paise
    };
    const desc: DescriptionData = {
      people: ['Alice', 'Bob'],
      payer: 'Alice',
      item_allocations: [
        { item_name: 'Item X', consumers: ['Alice'] },
        { item_name: 'Item Y', consumers: ['Bob'] },
      ],
      default_consumers: ['Alice', 'Bob'],
      assumptions: [],
    };
    const result = calculateBillSplit(receipt, desc);

    // grand_total is the exact receipt value
    expect(result.grand_total).toBe(210.5);

    // sum of person totals = Math.round(210.5) = 211 (nearest whole rupee)
    // Each person: 100 food + 5.25 tax → Math.round(105.25) = 105
    // Sum = 210. Remainder = 211 - 210 = 1, allocated to one person → 106 + 105 = 211
    expect(result.reconciliation.sum_of_person_totals).toBe(211);
    expect(result.reconciliation.matches_bill).toBe(true);

    // All person totals are integers
    for (const p of result.per_person) {
      expect(Number.isInteger(p.total)).toBe(true);
    }

    // No float artifacts in any string output
    for (const asm of result.assumptions) {
      expect(asm).not.toMatch(/\d\.\d{6,}/);
    }

    // Paise assumption is present
    expect(result.assumptions.some((a) => a.includes('paise component'))).toBe(true);
  });

  it('grand_total without paise does NOT emit a paise assumption', () => {
    const receipt: ReceiptData = {
      items: [{ name: 'Pizza', quantity: 1, line_total: 500 }],
      subtotal: 500,
      tax: 50,
      service_charge: 0,
      discount: 0,
      round_off: 0,
      grand_total: 550,
    };
    const desc: DescriptionData = {
      people: ['Alice', 'Bob'],
      payer: 'Alice',
      item_allocations: [],
      default_consumers: ['Alice', 'Bob'],
      assumptions: [],
    };
    const result = calculateBillSplit(receipt, desc);
    // No paise assumption should appear for a whole-rupee total
    expect(result.assumptions.some((a) => a.includes('paise component'))).toBe(false);
    expect(result.reconciliation.matches_bill).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Validator — nonexistent description item
// ---------------------------------------------------------------------------
describe('Validator — nonexistent description item', () => {
  it('LLM assumption "not found on the receipt" is promoted to a flag', () => {
    const receipt = makeReceipt({ items: [{ name: 'Pizza', quantity: 1, line_total: 500 }] });
    const descWithBadAssumption: DescriptionData = {
      people: ['Alice', 'Bob'],
      payer: 'Alice',
      item_allocations: [],
      default_consumers: ['Alice', 'Bob'],
      assumptions: ["Item 'Chicken Tikka' mentioned in description was not found on the receipt and was excluded."],
    };
    const { flags, assumptions } = validateReceiptAndDescription(receipt, descWithBadAssumption);
    // Must be in flags, NOT assumptions
    expect(flags.some((f) => f.includes('Chicken Tikka'))).toBe(true);
    expect(assumptions.some((a) => a.includes('Chicken Tikka'))).toBe(false);
  });

  it('item_allocation entry that fails fuzzy match is flagged', () => {
    const receipt = makeReceipt({ items: [{ name: 'Pizza', quantity: 1, line_total: 500 }] });
    const descWithBadAlloc: DescriptionData = {
      people: ['Alice', 'Bob'],
      payer: 'Alice',
      item_allocations: [{ item_name: 'Chicken Tikka', consumers: ['Alice'] }],
      default_consumers: ['Alice', 'Bob'],
      assumptions: [],
    };
    const { flags } = validateReceiptAndDescription(receipt, descWithBadAlloc);
    expect(flags.some((f) => f.includes('Chicken Tikka'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Validator — receipt arithmetic mismatch
// ---------------------------------------------------------------------------
describe('Validator — receipt arithmetic mismatch', () => {
  it('Item sum ≠ subtotal is flagged', () => {
    const receipt: ReceiptData = {
      items: [{ name: 'Pizza', quantity: 1, line_total: 400 }],
      subtotal: 500, // mismatch: items sum to 400
      service_charge: 0,
      tax: 0,
      discount: 0,
      grand_total: 500,
    };
    const { flags } = validateReceiptAndDescription(receipt, makeDesc());
    expect(flags.some((f) => f.includes('does not match printed subtotal'))).toBe(true);
  });

  it('Charges sum ≠ grand total is flagged', () => {
    const receipt: ReceiptData = {
      items: [{ name: 'Pizza', quantity: 1, line_total: 500 }],
      subtotal: 500,
      service_charge: 50,
      tax: 50,
      discount: 0,
      grand_total: 1000, // mismatch: 500+50+50 = 600
    };
    const { flags } = validateReceiptAndDescription(receipt, makeDesc());
    expect(flags.some((f) => f.includes('does not match printed grand total'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Settle-up consistency
// ---------------------------------------------------------------------------
describe('Settle-up consistency', () => {
  it('Settle-up amounts match individual person totals', () => {
    const receipt: ReceiptData = {
      items: [
        { name: 'Item A', quantity: 1, line_total: 300 },
        { name: 'Item B', quantity: 1, line_total: 200 },
      ],
      subtotal: 500,
      service_charge: 0,
      tax: 0,
      discount: 0,
      round_off: 0,
      grand_total: 500,
    };
    const desc: DescriptionData = {
      people: ['Alice', 'Bob'],
      payer: 'Alice',
      item_allocations: [
        { item_name: 'Item A', consumers: ['Alice'] },
        { item_name: 'Item B', consumers: ['Bob'] },
      ],
      default_consumers: ['Alice', 'Bob'],
      assumptions: [],
    };
    const result = calculateBillSplit(receipt, desc);
    const bobTotal = result.per_person.find((p) => p.name === 'Bob')!.total;
    const bobSettle = result.settle_up.find((s) => s.from === 'Bob');
    expect(bobSettle?.amount).toBe(bobTotal);
    // Payer (Alice) never owes herself
    expect(result.settle_up.find((s) => s.from === 'Alice')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// No participants
// ---------------------------------------------------------------------------
describe('No participants', () => {
  it('Returns safe response with flag when people list is empty', () => {
    const result = calculateBillSplit(
      makeReceipt(),
      makeDesc({ people: [], default_consumers: [] })
    );
    expect(result.per_person).toHaveLength(0);
    expect(result.flags.some((f) => f.includes('Cannot compute split without participants'))).toBe(true);
    expect(result.reconciliation.matches_bill).toBe(false);
  });
});
