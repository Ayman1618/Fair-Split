import { NextRequest, NextResponse } from 'next/server';
import { ApiSplitRequest, ReceiptData } from '@/types';
import { extractReceiptData, interpretDescription } from '@/lib/llmService';
import { calculateBillSplit } from '@/lib/calcEngine';

// Reject payloads larger than ~8 MB (base64 image + description).
// Next.js default body size limit is typically 4MB; this is a belt-and-suspenders guard.
const MAX_DESCRIPTION_CHARS = 8_000;
const MAX_BASE64_CHARS = 10_000_000; // ~7.5 MB decoded

function sanitizeErrorMessage(message: string): string {
  // Never expose API key or internal path details to the caller
  return message
    .replace(/GEMINI_API_KEY[^\s]*/gi, '[REDACTED]')
    .replace(/AIza[0-9A-Za-z_-]{35}/g, '[REDACTED]')
    .slice(0, 400); // hard cap on message length
}

export async function POST(req: NextRequest) {
  try {
    let body: ApiSplitRequest;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    const { receipt_base64, description } = body;

    if (!receipt_base64 || typeof receipt_base64 !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid "receipt_base64" field.' },
        { status: 400 }
      );
    }

    if (receipt_base64.length > MAX_BASE64_CHARS) {
      return NextResponse.json(
        { error: 'Receipt image too large. Please upload an image under ~7.5 MB.' },
        { status: 413 }
      );
    }

    if (!description || typeof description !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid "description" field.' },
        { status: 400 }
      );
    }

    if (description.trim().length === 0) {
      return NextResponse.json(
        { error: '"description" must not be blank.' },
        { status: 400 }
      );
    }

    if (description.length > MAX_DESCRIPTION_CHARS) {
      return NextResponse.json(
        { error: '"description" is too long. Please summarise in fewer words.' },
        { status: 400 }
      );
    }

    // Step 1: Multimodal LLM Extraction
    const receiptData = await extractReceiptData(receipt_base64);

    // Step 2: Natural Language LLM Interpretation
    const descriptionData = await interpretDescription(
      description,
      receiptData.items
    );

    // Step 3: Deterministic Financial Calculation & Reconciliation
    const splitResult = calculateBillSplit(receiptData, descriptionData);

    // Merge any extraction-layer correction flags (e.g. grand-total recomputed
    // from component arithmetic because the LLM dropped a decimal) into the
    // response flags so the UI can surface them to the user.
    const extractionFlags =
      (receiptData as ReceiptData & { _extractionFlags?: string[] })._extractionFlags;
    if (extractionFlags && extractionFlags.length > 0) {
      splitResult.flags = [...extractionFlags, ...splitResult.flags];
    }

    return NextResponse.json(splitResult, { status: 200 });
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : 'Internal Server Error';
    const safeMessage = sanitizeErrorMessage(rawMessage);
    console.error('[API /api/split Error]:', rawMessage); // full message server-side only

    return NextResponse.json(
      {
        error: safeMessage,
        per_person: [],
        grand_total: 0,
        reconciliation: { sum_of_person_totals: 0, matches_bill: false },
        paid_by: 'Unknown',
        settle_up: [],
        assumptions: [],
        flags: [`Provider or processing error. Please try again. Details: ${safeMessage}`],
      },
      { status: 500 }
    );
  }
}
