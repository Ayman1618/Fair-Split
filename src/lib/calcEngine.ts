import {
  ReceiptData,
  DescriptionData,
  ApiSplitResponse,
  PerPersonSplit,
  SettleUp,
} from '../types';
import { validateReceiptAndDescription } from './validator';
import { matchItemToReceipt } from './fuzzyMatcher';

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
    shareAmount: number;
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
    const sharePrice = receiptItem.line_total / numConsumers;
    const fracText = formatFraction(1, numConsumers);

    for (const consumer of itemConsumers) {
      let displayName = receiptItem.name;
      if (receiptItem.quantity > 1) {
        // Include quantity if > 1 e.g. "Butter Naan (qty 4)" or fraction
        displayName = `${receiptItem.name}${fracText}`;
      } else {
        displayName = `${receiptItem.name}${fracText}`;
      }

      consumerShares.push({
        itemName: displayName,
        consumer,
        shareAmount: sharePrice,
        fractionText: fracText,
      });
    }
  }

  // 3. Compute Per-Person Subtotals
  const personSubtotals: Record<string, { items: string[]; subtotal: number }> = {};
  for (const p of people) {
    personSubtotals[p] = { items: [], subtotal: 0 };
  }

  for (const share of consumerShares) {
    if (personSubtotals[share.consumer]) {
      personSubtotals[share.consumer].items.push(share.itemName);
      personSubtotals[share.consumer].subtotal += share.shareAmount;
    }
  }

  const totalFoodSubtotal = Object.values(personSubtotals).reduce(
    (acc, curr) => acc + curr.subtotal,
    0
  );

  const subtotalForRatio = totalFoodSubtotal > 0 ? totalFoodSubtotal : 1;

  // 4. Proportional Allocation of Charges (Tax, Service, Discount, Round-Off)
  interface PersonCalc {
    name: string;
    items: string[];
    subtotal: number;
    rawSubtotal: number;
    rawTax: number;
    rawService: number;
    rawDiscount: number;
    rawTotal: number;

    roundedSubtotal: number;
    roundedTax: number;
    roundedService: number;
    roundedDiscount: number;
    preliminaryTotal: number;
    finalTotal: number;
  }

  const personCalcs: PersonCalc[] = people.map((person) => {
    const data = personSubtotals[person];
    const ratio = data.subtotal / subtotalForRatio;

    const rawSubtotal = data.subtotal;
    const rawTax = (receipt.tax || 0) * ratio;
    const rawService = (receipt.service_charge || 0) * ratio;
    const rawDiscount = (receipt.discount || 0) * ratio;
    const rawRoundOff = (receipt.round_off || 0) * ratio;

    const rawTotal = rawSubtotal + rawTax + rawService - rawDiscount + rawRoundOff;

    return {
      name: person,
      items: data.items,
      subtotal: rawSubtotal,
      rawSubtotal,
      rawTax,
      rawService,
      rawDiscount,
      rawTotal,

      roundedSubtotal: Math.round(rawSubtotal),
      roundedTax: Math.round(rawTax),
      roundedService: Math.round(rawService),
      roundedDiscount: -Math.round(rawDiscount), // Non-positive e.g. -20
      preliminaryTotal: Math.round(rawTotal),
      finalTotal: Math.round(rawTotal),
    };
  });

  // 5. Deterministic Whole-Rupee Rounding & Remainder Allocation
  const sumOfPersonTotals = personCalcs.reduce((sum, p) => sum + p.finalTotal, 0);
  const remainder = receipt.grand_total - sumOfPersonTotals;

  if (remainder !== 0) {
    // Sort persons by highest subtotal / highest fractional share to deterministically allocate remainder
    const sorted = [...personCalcs].sort((a, b) => {
      const fracA = a.rawTotal - Math.floor(a.rawTotal);
      const fracB = b.rawTotal - Math.floor(b.rawTotal);
      if (Math.abs(fracB - fracA) > 0.001) {
        return fracB - fracA;
      }
      return b.rawSubtotal - a.rawSubtotal;
    });

    const absRemainder = Math.abs(remainder);
    const step = remainder > 0 ? 1 : -1;

    const allocatedNames: string[] = [];
    for (let i = 0; i < absRemainder; i++) {
      const target = sorted[i % sorted.length];
      target.finalTotal += step;
      allocatedNames.push(target.name);
    }

    assumptions.push(
      `Rounding remainder of ₹${remainder > 0 ? '+' : ''}${remainder} allocated deterministically to ${[
        ...new Set(allocatedNames),
      ].join(', ')} (based on highest subtotal/fractional share) to reconcile sum of person totals with receipt grand total of ₹${receipt.grand_total}.`
    );
  }

  // 6. Assemble Per-Person Splits
  const perPerson: PerPersonSplit[] = personCalcs.map((p) => ({
    name: p.name,
    items: p.items,
    subtotal: p.roundedSubtotal,
    tax_share: p.roundedTax,
    service_share: p.roundedService,
    discount_share: p.roundedDiscount,
    total: p.finalTotal,
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
    grand_total: receipt.grand_total,
    reconciliation: {
      sum_of_person_totals: finalSumPersonTotals,
      matches_bill: finalSumPersonTotals === receipt.grand_total,
    },
    paid_by: paidBy,
    settle_up: settleUp,
    assumptions,
    flags,
  };
}
