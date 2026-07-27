import { describe, it, expect } from 'vitest';
import { calculateBillSplit } from '../calcEngine';
import { ReceiptData, DescriptionData } from '../../types';

describe('Fair Split Deterministic Calculation Engine', () => {
  it('Reference Bill R1: Ravi, Neha, Sameer', () => {
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

    // Settle-up check: non-payers owe Sameer
    expect(result.settle_up).toHaveLength(2);
    const raviSettle = result.settle_up.find((s) => s.from === 'Ravi');
    const nehaSettle = result.settle_up.find((s) => s.from === 'Neha');
    expect(raviSettle?.to).toBe('Sameer');
    expect(nehaSettle?.to).toBe('Sameer');
    expect((raviSettle?.amount || 0) + (nehaSettle?.amount || 0) + (result.per_person.find(p => p.name === 'Sameer')?.total || 0)).toBe(1147);
  });

  it('Reference Bill R2: Aman, Priya, Karan, Sara (Subset sharing + Round-off)', () => {
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
      item_allocations: [
        { item_name: 'Gulab Jamun', consumers: ['Priya', 'Karan'] },
      ],
      default_consumers: ['Aman', 'Priya', 'Karan', 'Sara'],
      assumptions: [],
    };

    const result = calculateBillSplit(receipt, description);

    expect(result.grand_total).toBe(1345);
    expect(result.reconciliation.sum_of_person_totals).toBe(1345);
    expect(result.reconciliation.matches_bill).toBe(true);
    expect(result.paid_by).toBe('Priya');
    expect(result.settle_up).toHaveLength(3);
  });

  it('Reference Bill R3: Ishaan, Meera, Rohit (Beers subset + Mojito single)', () => {
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

  it('Reference Bill R4: Dev, Nikhil, Anjali, Farah (Discount + Quantities)', () => {
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
      round_off: -0.4,
      grand_total: 1436,
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

    expect(result.grand_total).toBe(1436);
    expect(result.reconciliation.sum_of_person_totals).toBe(1436);
    expect(result.reconciliation.matches_bill).toBe(true);
    expect(result.paid_by).toBe('Anjali');

    // Check discount allocation is non-positive
    for (const p of result.per_person) {
      expect(p.discount_share).toBeLessThanOrEqual(0);
    }
  });

  it('Edge Case: Unstated Payer creates flag and skips settle_up', () => {
    const receipt: ReceiptData = {
      items: [{ name: 'Pizza', quantity: 1, line_total: 500 }],
      subtotal: 500,
      service_charge: 0,
      tax: 25,
      discount: 0,
      round_off: 0,
      grand_total: 525,
    };

    const description: DescriptionData = {
      people: ['Alice', 'Bob'],
      payer: null,
      item_allocations: [],
      default_consumers: ['Alice', 'Bob'],
      assumptions: [],
    };

    const result = calculateBillSplit(receipt, description);

    expect(result.paid_by).toBe('Unknown');
    expect(result.settle_up).toHaveLength(0);
    expect(result.flags).toContain('Payer not stated in description.');
  });
});
