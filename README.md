# Fair Split

**Fair Split** is an intelligent, auditable bill-splitting application that processes restaurant receipt images alongside natural-language descriptions of who ate what and who paid.

---

## Architecture Overview

```
Receipt Image Base64
       ↓
Multimodal LLM (Gemini 3.6 Flash)
       ↓
Structured Receipt Data (Items, Prices, Subtotal, Tax, Service, Discount, Grand Total)
       ↓
Natural Language Description
       ↓
LLM Semantic Interpretation (People, Payer, Consumption Mappings, Subset Sharing)
       ↓
Validation Layer (Arithmetic Self-Checks & Cross-Reference Mapping)
       ↓
Deterministic TypeScript Financial Engine (Proportional Allocation, Whole-Rupee Rounding & Remainder Allocation)
       ↓
Reconciliation & Settle-Up Instructions
       ↓
API Response / Interactive Web Dashboard
```

---

## Why AI Interprets But Code Calculates

- **Financial Integrity**: LLMs are probabilistic models prone to hallucination, floating point rounding errors, or inaccurate sum calculations.
- **Auditable & Deterministic**: All currency math (subtotals, proportional tax/service/discount allocation, whole rupee rounding remainder management, and settle-up calculations) occurs in pure TypeScript application code.
- **Never Silently Guess Money**: If input is ambiguous or unstated (e.g., missing payer or unmapped items), the engine adds explicit **flags** rather than inventing monetary facts.

---

## Mandatory API Contract

### Endpoint
`POST /api/split`

**Headers**: `Content-Type: application/json`

### Request Body
```json
{
  "receipt_base64": "<base64-encoded image bytes, no data-URI prefix>",
  "description": "Four of us: Aman, Priya, Karan, Sara. The Gulab Jamun was shared just by Priya and Karan. Everything else was common to all four. Priya paid."
}
```

### Response Body
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
    },
    {
      "name": "Priya",
      "items": ["Paneer Butter Masala (¼)", "Dal Makhani (¼)", "Butter Naan (¼)", "Jeera Rice (¼)", "Gulab Jamun (½)", "Masala Papad (¼)"],
      "subtotal": 335,
      "tax_share": 18,
      "service_share": 17,
      "discount_share": 0,
      "total": 370
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
  "assumptions": [
    "Rounding remainder of ₹+1 allocated deterministically to Priya (based on highest subtotal/fractional share) to reconcile sum of person totals with receipt grand total of ₹1345."
  ],
  "flags": []
}
```

---

## Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Set your Google Gemini API key:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

---

## Local Setup & Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Deterministic Unit Tests (No API key required)
```bash
npm test
```

### 3. Start Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Deployment

Fair Split is a Next.js application that can be deployed to Vercel, Netlify, or any Docker/Node server.

```bash
npm run build
npm run start
```

Ensure `GEMINI_API_KEY` is configured in your production environment settings.

---

## Documentation Links

- [Edge Cases Documentation](file:///Users/ayman/Desktop/Fair-Split/docs/EDGE_CASES.md)
- [Prompt Log](file:///Users/ayman/Desktop/Fair-Split/docs/PROMPT_LOG.md)
- [Where the AI Was Wrong](file:///Users/ayman/Desktop/Fair-Split/docs/AI_FAILURES.md)
