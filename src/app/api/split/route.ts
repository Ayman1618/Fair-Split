import { NextRequest, NextResponse } from 'next/server';
import { ApiSplitRequest } from '@/types';
import { extractReceiptData, interpretDescription } from '@/lib/llmService';
import { calculateBillSplit } from '@/lib/calcEngine';

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

    if (!description || typeof description !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid "description" field.' },
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

    return NextResponse.json(splitResult, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('[API /api/split Error]:', message);

    return NextResponse.json(
      {
        error: message,
        per_person: [],
        grand_total: 0,
        reconciliation: { sum_of_person_totals: 0, matches_bill: false },
        paid_by: 'Unknown',
        settle_up: [],
        assumptions: [],
        flags: [`Server processing error: ${message}`],
      },
      { status: 500 }
    );
  }
}
