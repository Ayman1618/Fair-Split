# Fair Split

**Fair Split** is an auditable, deterministic bill-splitting application that processes restaurant receipt images alongside natural-language descriptions of who ate what and who paid.

---

## Deployed link
https://fair-split-lovat.vercel.app/
## Architecture

```
Receipt Image Base64 + Consumption Description
       ↓
Gemini Interpretation (gemini-3.5-flash-lite)
  ├─ Step 1: Multimodal Receipt Data Extraction
  └─ Step 2: Natural Language Consumption & Payer Mapping
       ↓
Validation & Extraction Guard Layer
  ├─ Deterministic Component Arithmetic Correction (subtotal + tax + service - discount = grand_total)
  └─ Semantic Cross-Reference & Fuzzy Matching
       ↓
Deterministic TypeScript Calculation Engine
  ├─ Internal Integer Paise Arithmetic (eliminates IEEE-754 floating-point drift)
  ├─ Proportional Charge & Discount Allocation
  └─ Whole-Rupee Settlement Rounding & Remainder Allocation
       ↓
Reconciliation & Settle-Up Instructions
       ↓
API Response / Interactive Web Dashboard
```

---

## Core Principle: AI Interprets Context; Application Code Calculates Money

- **Financial Determinism**: LLMs extract line items and interpret consumption rules. All monetary arithmetic (subtotals, proportional tax/service/discount shares, integer paise calculations, rounding remainder distribution, and settle-up balances) is executed purely in TypeScript.
- **Auditable & Predictable**: The engine never relies on LLM arithmetic, preventing floating-point drift, hallucinations, or silent calculation errors.
- **Explicit Flags**: Ambiguities (such as unstated payers or unmatched items) trigger transparent warnings rather than guessed monetary facts.

---

## Main Capabilities

- **Multimodal Receipt Processing**: Reads line items, subtotal, tax, service charges, discounts, tip, round-off, and grand total directly from images.
- **Natural Language Parsing**: Maps complex consumption rules (subset item sharing, default item sharing, and designated payers).
- **Proportional Charges**: Distributes taxes, service fees, and discounts proportionally based on pre-tax food subtotals.
- **Whole-Rupee Settlement**: Computes per-person payable amounts as whole rupees while preserving exact printed decimal receipt totals (e.g., ₹1436.40).
- **Deterministic Settle-Up**: Generates net peer-to-peer transfers to the designated payer.

---

## Important Edge-Case Handling

- **Decimal & Paise Receipt Totals**: Preserves printed decimal grand totals (e.g. ₹1436.40). Internal arithmetic uses integer paise (1 rupee = 100 paise) so no floating-point artifacts (e.g. `0.599999999999909`) ever appear.
- **LLM Truncation Guard**: Automatically corrects extracted grand totals using deterministic component arithmetic if the LLM drops decimal paise.
- **Unstated / Invalid Payer**: Sets `paid_by` to `"Unknown"`, disables `settle_up`, and adds an explicit warning flag.
- **Unmatched Description Items**: Flags items mentioned in the description that do not exist on the receipt, excluding them from calculations.

---

## Tech Stack

- **Framework**: Next.js 14 (App Router, TypeScript)
- **Styling**: Tailwind CSS
- **AI Integration**: Google Generative AI SDK (`gemini-3.5-flash-lite`)
- **Testing**: Vitest

---

## Local Setup & Configuration

### 1. Clone & Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Set your Gemini API key in `.env.local`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Testing & Verification

Run the automated test suite (no API key required):

```bash
npm test
```

- **Current Status**: **25 / 25 tests passing** (20 engine/validator tests + 5 extraction correction tests).

To run type checking and production build verification:
```bash
npx tsc --noEmit
npm run build
```

---

## Mandatory API Contract

### Endpoint
`POST /api/split`

**Request Body**:
```json
{
  "receipt_base64": "<base64-encoded image>",
  "description": "Four of us: Aman, Priya, Karan, Sara. The Gulab Jamun was shared just by Priya and Karan. Everything else was common to all four. Priya paid."
}
```

**Response Body**:
```json
{
  "per_person": [
    {
      "name": "Aman",
      "items": ["Paneer Butter Masala (¼)", "Dal Makhani (¼)", "Butter Naan (¼)", "Jeera Rice (¼)", "Masala Papad (¼)"],
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
    { "from": "Aman", "to": "Priya", "amount": 303 }
  ],
  "assumptions": [
    "Rounding remainder of ₹+1 allocated deterministically to Priya..."
  ],
  "flags": []
}
```

---

## Limitations & Assumptions

- **Receipt Clarity**: Image quality must be sufficient for OCR line item and charge extraction.
- **Currency**: Formatted for Indian Rupees (₹) and whole-rupee participant settlement rules.
- **Single Payer**: Supports single-payer settlement per receipt submission.

---

## Documentation Links

- [Edge Cases Documentation](docs/EDGE_CASES.md)
- [Prompt Log & Architecture](docs/PROMPT_LOG.md)
- [AI Failures & Fixes](docs/AI_FAILURES.md)
