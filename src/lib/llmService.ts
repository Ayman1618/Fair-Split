import { GoogleGenerativeAI } from '@google/generative-ai';
import { ReceiptData, DescriptionData } from '../types';

// Transient HTTP status codes that are safe to retry (provider overload, rate limit)
const RETRYABLE_STATUS_CODES = new Set([429, 503, 502, 504]);
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1200;

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error(
      'GEMINI_API_KEY environment variable is not configured. Please set a valid API key in .env or environment.'
    );
  }
  return apiKey;
}

function cleanJsonResponse(rawText: string): string {
  let text = rawText.trim();
  if (text.startsWith('```json')) {
    text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (text.startsWith('```')) {
    text = text.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return text.trim();
}

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  // Gemini SDK surfaces HTTP status in message e.g. "[429 Too Many Requests]"
  for (const code of RETRYABLE_STATUS_CODES) {
    if (msg.includes(`${code}`)) return true;
  }
  return false;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = MAX_RETRIES
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryableError(err) || i === attempts) break;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (i + 1)));
    }
  }
  throw lastErr;
}

/**
 * Step 1: Extracts structured receipt data from base64 receipt image using Gemini Multimodal LLM.
 * Model: gemini-3.5-flash-lite (supports multimodal image input + JSON mode)
 */
export async function extractReceiptData(
  receiptBase64: string,
  mimeType = 'image/jpeg'
): Promise<ReceiptData> {
  const apiKey = getApiKey();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.5-flash-lite',
    generationConfig: { responseMimeType: 'application/json' },
  });

  const prompt = `You are a high-precision restaurant receipt OCR parser.
Analyze this receipt image and extract structured data in JSON format ONLY.

Return a JSON object conforming EXACTLY to this schema:
{
  "items": [
    {
      "name": "canonical item display name",
      "quantity": 1,
      "line_total": 220.0,
      "unit_price": 220.0
    }
  ],
  "subtotal": 1000.0,
  "service_charge": 50.0,
  "tax": 50.0,
  "discount": 0.0,
  "tip": 0.0,
  "round_off": 0.0,
  "grand_total": 1100.0
}

Rules:
- Extract all line items with exact display names, quantities, and line totals.
- Extract subtotal, service charge, tax (GST/VAT), discount, tip, round-off, and grand total if present.
- subtotal: Use the pre-tax, pre-service-charge food/item subtotal ONLY. Do NOT extract intermediate totals (such as "Food Total", "Subtotal Incl Tax", or "Grand Total Before Discount") as the subtotal.
- grand_total: The final printed payable amount / total amount due is the authoritative grand_total. Do not use intermediate totals (like "Total Before Discount" or "Food Total").
- Default missing numeric fields to 0.
- Do NOT perform arithmetic corrections on extracted numbers; output exact printed values.
- CRITICAL — Decimal precision: NEVER round or truncate monetary values. Preserve every decimal digit exactly as printed on the receipt. A printed value of 68.40 MUST be output as 68.40 (not 68 or 68.4 rounded further). A printed grand total of 1436.40 MUST be output as 1436.40 (not 1436).
- CRITICAL — Paise values: Indian receipts frequently contain paise (sub-rupee amounts). If a field reads "68.40" or "1436.40", the decimal portion is paise and must be preserved numerically as-is.
- CRITICAL — grand_total: Copy the final printed payable/total amount due exactly. Do not re-derive or recalculate it.
- Output ONLY valid raw JSON. No explanations, no markdown wrapping.`;

  const imagePart = {
    inlineData: {
      data: receiptBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, ''),
      mimeType,
    },
  };

  const responseText = await withRetry(async () => {
    const result = await model.generateContent([prompt, imagePart]);
    return result.response.text();
  });

  const cleaned = cleanJsonResponse(responseText);

  try {
    const parsed = JSON.parse(cleaned) as ReceiptData;

    // ---------------------------------------------------------------------------
    // Post-extraction deterministic grand-total guard.
    //
    // 1. Sub-rupee decimal truncation (< 100 paise discrepancy):
    //    If the LLM drops decimal paise (e.g. extracting 1436 instead of 1436.40),
    //    the discrepancy is small (< ₹1.00). In this unambiguous precision case,
    //    grand_total is auto-corrected to the component recomputed value.
    //
    // 2. Large structural mismatch (≥ 100 paise discrepancy):
    //    If intermediate subtotals or hierarchical charges cause a large difference
    //    (≥ ₹1.00), application code MUST NOT fabricate a replacement total.
    //    The extracted/printed grand total is preserved and a warning flag is emitted.
    // ---------------------------------------------------------------------------
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
    const correctionFlags: string[] = [];

    const fmt = (n: number) => {
      const s = n.toFixed(2);
      return s.endsWith('.00') ? s.slice(0, -3) : s;
    };

    if (diffPaise > 1 && diffPaise < 100) {
      // Sub-rupee precision/truncation error — safe to auto-correct
      const recomputedRupees = recomputedPaise / 100;
      correctionFlags.push(
        `Extracted grand total ₹${fmt(parsed.grand_total || 0)} did not match component arithmetic ` +
        `(subtotal ₹${fmt(parsed.subtotal || 0)} + tax ₹${fmt(parsed.tax || 0)} ` +
        `+ service ₹${fmt(parsed.service_charge || 0)} − discount ₹${fmt(parsed.discount || 0)} ` +
        `+ round-off ₹${fmt(parsed.round_off || 0)} = ₹${fmt(recomputedRupees)}). ` +
        `Grand total corrected to ₹${fmt(recomputedRupees)} by deterministic component arithmetic.`
      );
      finalGrandTotal = recomputedRupees;
    } else if (diffPaise >= 100) {
      // Large structural mismatch — preserve printed grand total, do NOT fabricate replacement
      const recomputedRupees = recomputedPaise / 100;
      correctionFlags.push(
        `Sum of extracted receipt components (₹${fmt(recomputedRupees)}) differs from printed grand total ` +
        `(₹${fmt(parsed.grand_total || 0)}). Preserving printed grand total.`
      );
    }

    const receiptData: ReceiptData & { _extractionFlags?: string[] } = {
      items: parsed.items || [],
      subtotal:       parsed.subtotal        || 0,
      service_charge: parsed.service_charge  || 0,
      tax:            parsed.tax             || 0,
      discount:       parsed.discount        || 0,
      tip:            parsed.tip             || 0,
      round_off:      parsed.round_off       || 0,
      grand_total:    finalGrandTotal,
    };

    // Attach correction flags so the API route can merge them into the response.
    if (correctionFlags.length > 0) {
      receiptData._extractionFlags = correctionFlags;
    }

    return receiptData;
  } catch (err) {
    throw new Error(
      `Failed to parse receipt JSON from LLM output: ${(err as Error).message}\nOutput: ${responseText}`
    );
  }
}

/**
 * Step 2: Interprets natural language description into structured consumption rules.
 * Model: gemini-3.5-flash-lite (text-only, structured JSON output)
 */
export async function interpretDescription(
  description: string,
  receiptItems: { name: string; line_total: number }[]
): Promise<DescriptionData> {
  const apiKey = getApiKey();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.5-flash-lite',
    generationConfig: { responseMimeType: 'application/json' },
  });

  const itemsListStr = receiptItems
    .map((i) => ` - ${i.name} (₹${i.line_total})`)
    .join('\n');

  const prompt = `You are a semantic natural language parser for bill splitting.
Analyze the plain-English description of who consumed what and who paid.

Receipt Items Available:
${itemsListStr}

Description to Interpret:
"${description}"

Return a JSON object conforming EXACTLY to this schema:
{
  "people": ["Aman", "Priya", "Karan", "Sara"],
  "payer": "Priya",
  "item_allocations": [
    {
      "item_name": "Gulab Jamun",
      "consumers": ["Priya", "Karan"]
    }
  ],
  "default_consumers": ["Aman", "Priya", "Karan", "Sara"],
  "assumptions": ["Understood 'everything else' to mean all items except Gulab Jamun are shared equally among all 4 people."]
}

Rules:
1. Extract all named participants in the "people" array.
2. Identify who paid in the "payer" field. If unstated or ambiguous, return null for "payer".
3. For "item_allocations", ONLY include items that can be matched to the Receipt Items Available list above. Do NOT invent items that are not on the receipt.
4. If the description references an item that does NOT appear in the receipt list, do NOT include it in "item_allocations". Instead, record it in "assumptions" as: "Item '[name]' mentioned in description was not found on the receipt and was excluded."
5. If statements like "everything else common to all" or "shared among all" exist, set "default_consumers" to all participants.
6. Record any defensible interpretations in "assumptions". If all items mentioned in the description were matched to receipt items, record: "All items mentioned in the description were matched to items on the receipt."
7. Output ONLY valid raw JSON. No markdown wrappers.`;

  const responseText = await withRetry(async () => {
    const result = await model.generateContent(prompt);
    return result.response.text();
  });

  const cleaned = cleanJsonResponse(responseText);

  try {
    const parsed = JSON.parse(cleaned) as DescriptionData;
    return {
      people: parsed.people || [],
      payer: parsed.payer || null,
      item_allocations: parsed.item_allocations || [],
      default_consumers: parsed.default_consumers || parsed.people || [],
      assumptions: parsed.assumptions || [],
    };
  } catch (err) {
    throw new Error(
      `Failed to parse description JSON from LLM output: ${(err as Error).message}\nOutput: ${responseText}`
    );
  }
}
