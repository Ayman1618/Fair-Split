import { ReceiptData, DescriptionData } from '../types';
import { matchItemToReceipt } from './fuzzyMatcher';

export interface ValidationResult {
  flags: string[];
  assumptions: string[];
}

export function validateReceiptAndDescription(
  receipt: ReceiptData,
  description: DescriptionData
): ValidationResult {
  const flags: string[] = [];
  const assumptions: string[] = [...(description.assumptions || [])];

  // 1. Receipt Validation
  if (!receipt.items || receipt.items.length === 0) {
    flags.push('Receipt contains no line items.');
  }

  const itemsSum = receipt.items.reduce((acc, item) => acc + item.line_total, 0);
  if (receipt.subtotal && Math.abs(itemsSum - receipt.subtotal) > 1.0) {
    flags.push(
      `Sum of line items (₹${itemsSum.toFixed(2)}) does not match printed subtotal (₹${receipt.subtotal.toFixed(2)}).`
    );
  }

  const calculatedGrandTotal =
    (receipt.subtotal || itemsSum) +
    (receipt.tax || 0) +
    (receipt.service_charge || 0) -
    (receipt.discount || 0) +
    (receipt.round_off || 0);

  if (Math.abs(calculatedGrandTotal - receipt.grand_total) > 1.0) {
    flags.push(
      `Sum of receipt charges (₹${calculatedGrandTotal.toFixed(2)}) does not match printed grand total (₹${receipt.grand_total.toFixed(2)}).`
    );
  }

  // 2. Description Validation
  if (!description.people || description.people.length === 0) {
    flags.push('No participants identified in description.');
  }

  if (!description.payer) {
    flags.push('Payer not stated in description.');
  } else if (
    description.people &&
    !description.people.some(
      (p) => p.toLowerCase() === description.payer?.toLowerCase()
    )
  ) {
    flags.push(`Stated payer '${description.payer}' is not listed among the participants.`);
  }

  // 3. Mapping Validation
  const validPeopleLower = (description.people || []).map((p) => p.toLowerCase());

  for (const alloc of description.item_allocations || []) {
    const matched = matchItemToReceipt(alloc.item_name, receipt.items || []);
    if (!matched) {
      flags.push(
        `Description item '${alloc.item_name}' could not be matched to any receipt line item.`
      );
    }

    for (const consumer of alloc.consumers || []) {
      if (!validPeopleLower.includes(consumer.toLowerCase())) {
        flags.push(
          `Unknown participant '${consumer}' referenced for item '${alloc.item_name}'.`
        );
      }
    }
  }

  return { flags, assumptions };
}
