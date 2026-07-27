import { GoogleGenerativeAI } from '@google/generative-ai';
import { ReceiptData, DescriptionData } from '../types';

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

/**
 * Step 1: Extracts structured receipt data from base64 receipt image using Gemini Multimodal LLM
 */
export async function extractReceiptData(
  receiptBase64: string,
  mimeType = 'image/jpeg'
): Promise<ReceiptData> {
  const apiKey = getApiKey();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.6-flash',
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
- Default missing numeric fields to 0.
- Do NOT perform arithmetic corrections on extracted numbers; output exact printed values.
- Output ONLY valid raw JSON. No explanations, no markdown wrapping.`;

  const imagePart = {
    inlineData: {
      data: receiptBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, ''),
      mimeType,
    },
  };

  const result = await model.generateContent([prompt, imagePart]);
  const responseText = result.response.text();
  const cleaned = cleanJsonResponse(responseText);

  try {
    const parsed = JSON.parse(cleaned) as ReceiptData;
    return {
      items: parsed.items || [],
      subtotal: parsed.subtotal || 0,
      service_charge: parsed.service_charge || 0,
      tax: parsed.tax || 0,
      discount: parsed.discount || 0,
      tip: parsed.tip || 0,
      round_off: parsed.round_off || 0,
      grand_total: parsed.grand_total || 0,
    };
  } catch (err) {
    throw new Error(`Failed to parse receipt JSON from LLM output: ${(err as Error).message}\nOutput: ${responseText}`);
  }
}

/**
 * Step 2: Interprets natural language description into structured consumption rules
 */
export async function interpretDescription(
  description: string,
  receiptItems: { name: string; line_total: number }[]
): Promise<DescriptionData> {
  const apiKey = getApiKey();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.6-flash',
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
3. Map specific items mentioned in description to "item_allocations". Match "item_name" as closely as possible to the receipt items above.
4. If statements like "everything else common to all" or "shared among all" exist, set "default_consumers" to all participants.
5. Record any defensible interpretations in "assumptions".
6. Output ONLY valid raw JSON. No markdown wrappers.`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
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
    throw new Error(`Failed to parse description JSON from LLM output: ${(err as Error).message}\nOutput: ${responseText}`);
  }
}
