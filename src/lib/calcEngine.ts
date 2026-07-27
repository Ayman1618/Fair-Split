import {
  ReceiptData,
  DescriptionData,
  ApiSplitResponse,
  PerPersonSplit,
  SettleUp,
} from '../types';
import { validateReceiptAndDescription } from './validator';
import { matchItemToReceipt } from './fuzzyMatcher';

// ---------------------------------------------------------------------------
// Monetary helpers
//
// All internal arithmetic uses integer paise (1 rupee = 100 paise) to
// eliminate IEEE-754 floating-point drift in financial calculations.
// Raw JavaScript floats are NEVER interpolated into assumption/flag strings.
// ---------------------------------------------------------------------------

/**
 * Convert a rupee amount (possibly containing paise) to integer paise.
 * Math.round() handles the binary float representation of values like 68.40.
 * e.g. 1436.40 → 143640, 68.40 → 6840, -0.05 → -5
 */
function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/**
 * Format an integer paise value as a human-readable rupee string.
 * Strips trailing ".00" for whole-rupee amounts.
 * e.g. 143640 → "1436.40", 114700 → "1147", 40 → "0.40"
 */
function formatRupees(paise: number): string {
  const str = (paise / 100).toFixed(2);
  return str.endsWith('.00') ? str.slice(0, -3) : str;
}

function formatFraction(num: number, denom: number): string {
  if (num === denom) return '';
  const frac = num / denom;
  if (Math.abs(frac - 0.5) < 0.01) return ' (½)';
  if (Math.abs(frac - 0.333) < 0.02) return ' (⅓)';
  if (Math.abs(frac - 0.25) < 0.01) return ' (¼)';
  if (Math.abs(frac - 0.666) < 0.02) return ' (⅔)';
  if (Math.abs(frac - 0.75) < 0.01) return ' (¾)';
  return ` (${num}/${denom})`;
}

export function calculateBillSplit(
  receipt: ReceiptData,
  description: DescriptionData
): ApiSplitResponse {
  // 1. Validation & initial flags/assumptions
  const validation = validateReceiptAndDescription(receipt, description);
  const flags: string[] = [...validation.flags];
  const assumptions: string[] = [...validation.assumptions];

  const people = (description.people || []).map((p) => p.trim()).filter(Boolean);

  if (people.length === 0) {
    return {
      per_person: [],
      grand_total: receipt.grand_total || 0,
      reconciliation: {
        sum_of_person_totals: 0,
        matches_bill: false,
      },
      paid_by: description.payer || 'Unknown',
      settle_up: [],
      assumptions,
      flags: [...flags, 'Cannot compute split without participants.'],
    };
  }

  // Identify Payer
  let paidBy = 'Unknown';
  if (description.payer) {
    const matchedPayer = people.find(
      (p) => p.toLowerCase() === description.payer?.toLowerCase()
    );
    if (matchedPayer) {
      paidBy = matchedPayer;
    }
  }

  // ---------------------------------------------------------------------------
  // Convert all receipt monetary values to integer paise exactly once.
  // This ensures all subsequent arithmetic is free of IEEE-754 drift.
  // ---------------------------------------------------------------------------
  const grandTotalPaise = toPaise(receipt.grand_total);
  const taxPaise = toPaise(receipt.tax || 0);
  const serviceChargePaise = toPaise(receipt.service_charge || 0);
  const discountPaise = toPaise(receipt.discount || 0);
  const roundOffPaise = toPaise(receipt.round_off || 0);

  // Whole-rupee settlement target: the amount the per-person totals must sum
  // to. Per-person payable amounts are always whole rupees. When the receipt
  // grand total contains paise (e.g. ₹1436.40), settlement operates at the
  // ₹1436 whole-rupee level; the paise component is surfaced in assumptions.
  const settlementTargetRupees = Math.round(grandTotalPaise / 100);

  // 2. Map Receipt Items to Consumers
  const defaultConsumers =
    description.default_consumers && description.default_consumers.length > 0
      ? description.default_consumers.map((dc) => {
          const match = people.find((p) => p.toLowerCase() === dc.toLowerCase());
          return match || dc;
        })
      : people;

  interface ConsumerItemShare {
    itemName: string;
    consumer: string;
    /** Share amount in paise (may be fractional for non-even splits; rounded at person-total level) */
    shareAmountPaise: number;
    fractionText: string;
  }

  const consumerShares: ConsumerItemShare[] = [];

  for (const receiptItem of receipt.items || []) {
    // Find matching explicit allocations from description
    const explicitAllocations = (description.item_allocations || []).filter(
      (alloc) => {
        const match = matchItemToReceipt(alloc.item_name, [receiptItem]);
        return match !== null;
      }
    );

    let itemConsumers: string[] = [];

    if (explicitAllocations.length > 0) {
      // Gather all consumers specified across explicit allocations for this item
      for (const alloc of explicitAllocations) {
        for (const rawConsumer of alloc.consumers || []) {
          const matchedPerson = people.find(
            (p) => p.toLowerCase() === rawConsumer.toLowerCase()
          );
          if (matchedPerson && !itemConsumers.includes(matchedPerson)) {
            itemConsumers.push(matchedPerson);
          }
        }
      }
    }

    // Fallback if no explicit consumers matched or provided
    if (itemConsumers.length === 0) {
      itemConsumers = [...defaultConsumers];
    }

    const numConsumers = itemConsumers.length;
    // Convert item total to paise for precision, then divide.
    // Per-consumer shares may be non-integer paise for non-even splits;
    // rounding is applied at the person-total level (step 3→4 below).
    const itemTotalPaise = toPaise(receiptItem.line_total);
    const shareAmountPaise = itemTotalPaise / numConsumers;
    const fracText = formatFraction(1, numConsumers);

    for (const consumer of itemConsumers) {
      const displayName = `${receiptItem.name}${fracText}`;
      consumerShares.push({
        itemName: displayName,
        consumer,
        shareAmountPaise,
        fractionText: fracText,
      });
    }
  }

  // 3. Compute Per-Person Subtotals (in paise)
  const personSubtotals: Record<string, { items: string[]; subtotalPaise: number }> = {};
  for (const p of people) {
    personSubtotals[p] = { items: [], subtotalPaise: 0 };
  }

  for (const share of consumerShares) {
    if (personSubtotals[share.consumer]) {
      personSubtotals[share.consumer].items.push(share.itemName);
      personSubtotals[share.consumer].subtotalPaise += share.shareAmountPaise;
    }
  }

  const totalFoodSubtotalPaise = Object.values(personSubtotals).reduce(
    (acc, curr) => acc + curr.subtotalPaise,
    0
  );

  const subtotalForRatioPaise = totalFoodSubtotalPaise > 0 ? totalFoodSubtotalPaise : 1;

  // 4. Proportional Allocation of Charges (Tax, Service, Discount, Round-Off)
  //    Arithmetic is done in integer paise; Math.round() applied per-step to
  //    prevent error accumulation. Rounding to whole rupees happens here.
  interface PersonCalc {
    name: string;
    items: string[];
    /** Accumulated food subtotal in paise (may be fractional for non-even item splits) */
    subtotalPaise: number;
    rawTaxPaise: number;
    rawServicePaise: number;
    rawDiscountPaise: number;
    /** Total in paise before whole-rupee rounding */
    rawTotalPaise: number;
    // Whole-rupee values (for API output)
    roundedSubtotalRupees: number;
    roundedTaxRupees: number;
    roundedServiceRupees: number;
    roundedDiscountRupees: number; // ≤ 0 (non-positive)
    /** Whole-rupee total before remainder correction */
    preliminaryRupees: number;
    /** Final whole-rupee total after remainder correction */
    finalRupees: number;
  }

  const personCalcs: PersonCalc[] = people.map((person) => {
    const data = personSubtotals[person];
    // ratio is a float (unavoidable), but it is immediately applied to integer
    // paise values and the result is Math.round()-ed, preventing drift accumulation.
    const ratio = data.subtotalPaise / subtotalForRatioPaise;

    const rawTaxPaise = Math.round(taxPaise * ratio);
    const rawServicePaise = Math.round(serviceChargePaise * ratio);
    const rawDiscountPaise = Math.round(discountPaise * ratio);
    const rawRoundOffPaise = Math.round(roundOffPaise * ratio);

    const rawTotalPaise =
      data.subtotalPaise + rawTaxPaise + rawServicePaise - rawDiscountPaise + rawRoundOffPaise;

    return {
      name: person,
      items: data.items,
      subtotalPaise: data.subtotalPaise,
      rawTaxPaise,
      rawServicePaise,
      rawDiscountPaise,
      rawTotalPaise,
      roundedSubtotalRupees: Math.round(data.subtotalPaise / 100),
      roundedTaxRupees: Math.round(rawTaxPaise / 100),
      roundedServiceRupees: Math.round(rawServicePaise / 100),
      roundedDiscountRupees: -Math.round(rawDiscountPaise / 100), // non-positive e.g. -120
      preliminaryRupees: Math.round(rawTotalPaise / 100),
      finalRupees: Math.round(rawTotalPaise / 100),
    };
  });

  // 5. Deterministic Whole-Rupee Rounding & Remainder Allocation
  //
  // Because both operands are integers, remainderRupees is always an exact
  // integer — the remainder loop is safe. The original bug (remainder = 0.40
  // floating-point causing a loop that ran once and over-shot by ₹1) cannot
  // occur here.
  const sumOfPersonRupees = personCalcs.reduce((sum, p) => sum + p.finalRupees, 0);
  const remainderRupees = settlementTargetRupees - sumOfPersonRupees; // always integer

  if (remainderRupees !== 0) {
    // Sort by highest intra-rupee paise fraction to allocate the remainder
    // deterministically (the person closest to rounding up gets +₹1 first).
    const sorted = [...personCalcs].sort((a, b) => {
      // Fractional paise within the person's whole-rupee total
      const fracA = a.rawTotalPaise - Math.floor(a.rawTotalPaise / 100) * 100;
      const fracB = b.rawTotalPaise - Math.floor(b.rawTotalPaise / 100) * 100;
      if (Math.abs(fracB - fracA) > 0.001) {
        return fracB - fracA;
      }
      return b.subtotalPaise - a.subtotalPaise;
    });

    const absRemainder = Math.abs(remainderRupees); // integer, loop is always exact
    const step = remainderRupees > 0 ? 1 : -1;

    const allocatedNames: string[] = [];
    for (let i = 0; i < absRemainder; i++) {
      const target = sorted[i % sorted.length];
      target.finalRupees += step;
      allocatedNames.push(target.name);
    }

    // Format the signed remainder without any raw float interpolation
    const signedRemainderStr =
      remainderRupees > 0
        ? `+₹${remainderRupees}`
        : `-₹${Math.abs(remainderRupees)}`;

    assumptions.push(
      `Rounding remainder of ${signedRemainderStr} allocated deterministically to ${[
        ...new Set(allocatedNames),
      ].join(', ')} (based on highest fractional paise share) to reconcile sum of person totals with settlement target of ₹${settlementTargetRupees}.`
    );
  }

  // If the receipt grand total contains a sub-rupee paise component, explain
  // clearly that settlement operates at the whole-rupee level and that this is
  // not a reconciliation error. This prevents the paise amount from appearing
  // as a spurious "Mismatch" in the UI.
  const paiseComponent = grandTotalPaise % 100;
  if (paiseComponent !== 0) {
    assumptions.push(
      `Receipt grand total of ₹${formatRupees(grandTotalPaise)} includes a ₹${formatRupees(paiseComponent)} paise component. ` +
        `Per-person payable amounts use whole-rupee settlement (₹${settlementTargetRupees} total). ` +
        `The ₹${formatRupees(paiseComponent)} sub-rupee amount is absorbed by the whole-rupee rounding strategy ` +
        `and does not constitute a reconciliation mismatch.`
    );
  }

  // 6. Assemble Per-Person Splits
  const perPerson: PerPersonSplit[] = personCalcs.map((p) => ({
    name: p.name,
    items: p.items,
    subtotal: p.roundedSubtotalRupees,
    tax_share: p.roundedTaxRupees,
    service_share: p.roundedServiceRupees,
    discount_share: p.roundedDiscountRupees,
    total: p.finalRupees,
  }));

  const finalSumPersonTotals = perPerson.reduce((sum, p) => sum + p.total, 0);

  // 7. Settle-Up Transfers
  const settleUp: SettleUp[] = [];
  if (paidBy !== 'Unknown') {
    for (const p of perPerson) {
      if (p.name.toLowerCase() !== paidBy.toLowerCase() && p.total > 0) {
        settleUp.push({
          from: p.name,
          to: paidBy,
          amount: p.total,
        });
      }
    }
  }

  return {
    per_person: perPerson,
    // Preserve the exact receipt grand total (may include paise).
    // The reconciliation check operates at the whole-rupee settlement level.
    grand_total: receipt.grand_total,
    reconciliation: {
      sum_of_person_totals: finalSumPersonTotals,
      // matches_bill is true when the sum of whole-rupee person totals equals
      // Math.round(receipt.grand_total). This is the documented whole-rupee
      // settlement level: paise components in the receipt total are absorbed
      // by the rounding strategy and explained in assumptions.
      matches_bill: finalSumPersonTotals === settlementTargetRupees,
    },
    paid_by: paidBy,
    settle_up: settleUp,
    assumptions,
    flags,
  };
}
