import { ReceiptItem } from '../types';

export interface MatchResult {
  receiptItem: ReceiptItem;
  confidence: number;
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordTokens(text: string): string[] {
  return normalizeText(text).split(' ').filter(Boolean);
}

export function matchItemToReceipt(
  query: string,
  receiptItems: ReceiptItem[],
  threshold = 0.35
): MatchResult | null {
  const normQuery = normalizeText(query);
  const queryTokens = wordTokens(query);

  if (!normQuery || receiptItems.length === 0) return null;

  let bestItem: ReceiptItem | null = null;
  let maxScore = 0;

  for (const item of receiptItems) {
    const normItem = normalizeText(item.name);
    const itemTokens = wordTokens(item.name);

    // Exact string match
    if (normItem === normQuery) {
      return { receiptItem: item, confidence: 1.0 };
    }

    // Substring match
    if (normItem.includes(normQuery) || normQuery.includes(normItem)) {
      const score = Math.max(normQuery.length / normItem.length, normItem.length / normQuery.length) * 0.9;
      if (score > maxScore) {
        maxScore = score;
        bestItem = item;
      }
    }

    // Token overlap match
    const commonTokens = queryTokens.filter(t => itemTokens.includes(t));
    if (commonTokens.length > 0) {
      const jaccard = commonTokens.length / new Set([...queryTokens, ...itemTokens]).size;
      // boost if key nouns match
      const overlapScore = Math.min(1.0, jaccard * 1.5);
      if (overlapScore > maxScore) {
        maxScore = overlapScore;
        bestItem = item;
      }
    }
  }

  if (bestItem && maxScore >= threshold) {
    return { receiptItem: bestItem, confidence: maxScore };
  }

  return null;
}
