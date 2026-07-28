# Fair Split

Fair Split takes a restaurant receipt and a short description of who ate what and who paid. Gemini reads and interprets the inputs, while the actual money calculations are done in TypeScript.

**Live App:** https://fair-split-lovat.vercel.app/

## Submission Deliverables

| Deliverable | Where to Find It |
|---|---|
| Deployed API + Frontend | [Live App](https://fair-split-lovat.vercel.app/) and `POST /api/split` |
| Prompt Log | [docs/PROMPT_LOG.md](docs/PROMPT_LOG.md) |
| Edge Cases | [docs/EDGE_CASES.md](docs/EDGE_CASES.md) |
| Where the AI Was Wrong | [docs/AI_FAILURES.md](docs/AI_FAILURES.md) |

**Verification:** 25 / 25 automated tests passing, with successful typecheck and production build.

---

## How It Works

```text
Receipt Image + Description
        ↓
Gemini
  • Reads receipt data
  • Understands who ate what
  • Identifies who paid
        ↓
Validation
  • Checks extracted receipt values
  • Matches described items to receipt items
  • Flags suspicious or missing information
        ↓
TypeScript Calculation Engine
  • Splits item costs
  • Allocates tax, service charge and discounts
  • Handles rounding
  • Calculates settle-up amounts
        ↓
Final Split + Warnings + Assumptions
```

The main rule is simple:

> **AI interprets the input. Application code calculates the money.**

Gemini does not calculate the final bill split. This keeps the financial calculations deterministic and testable.

---

## What Fair Split Handles

- Receipt images with line items, tax, service charge, discounts and round-off
- Natural-language descriptions of who consumed each item
- Items shared by everyone or only some people
- A single person paying for the bill
- Proportional tax, service charge and discount allocation
- Decimal receipt totals such as ₹1436.40
- Whole-rupee per-person settlement
- Missing payers, unmatched items and suspicious receipt arithmetic through visible warnings

When the application cannot safely infer something, it prefers to **flag the problem rather than guess**.

See [Edge Cases](docs/EDGE_CASES.md) for the full list.

---

## Tech Stack

- Next.js 14 + TypeScript
- Tailwind CSS
- Google Gemini (`gemini-3.5-flash-lite`)
- Vitest
- Vercel

---

## API

### `POST /api/split`

Example request:

```json
{
  "receipt_base64": "<base64-encoded image>",
  "description": "Four of us: Aman, Priya, Karan, Sara. The Gulab Jamun was shared just by Priya and Karan. Everything else was common to all four. Priya paid."
}
```

The response contains:

- each person's items and total
- receipt grand total
- reconciliation result
- payer
- settle-up instructions
- assumptions
- warning flags

Example:

```json
{
  "per_person": [
    {
      "name": "Aman",
      "items": ["Paneer Butter Masala (¼)", "Dal Makhani (¼)"],
      "subtotal": 275,
      "tax_share": 14,
      "service_share": 14,
      "discount_share": 0,
      "total": 303
    }
  ],
  "grand_total": 1345,
  "reconciliation": {
    "sum_of_person_totals": 1345,
    "matches_bill": true
  },
  "paid_by": "Priya",
  "settle_up": [
    {
      "from": "Aman",
      "to": "Priya",
      "amount": 303
    }
  ],
  "assumptions": [],
  "flags": []
}
```

---

## Local Setup

Install dependencies:

```bash
npm install
```

Create your local environment file:

```bash
cp .env.example .env.local
```

Add your Gemini API key:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

Run the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

---

## Testing

Run the tests:

```bash
npx vitest run
```

Current result:

```text
Test Files  2 passed (2)
Tests       25 passed (25)
```

Typecheck and production build:

```bash
npx tsc --noEmit
npm run build
```

Both pass successfully.

---

## Current Limitations

- Receipt text must be clear enough for the model to read.
- The current version supports one payer per bill.
- Participant settlement is in whole rupees.
- Very unusual receipt layouts may produce conflicting extracted values. In those cases, Fair Split preserves the printed total and flags the mismatch instead of inventing a replacement.
- There is no authentication, history or persistence. One bill goes in and one split comes out.