export interface ApiSplitRequest {
  receipt_base64: string;
  description: string;
}

export interface PerPersonSplit {
  name: string;
  items: string[];
  subtotal: number;
  tax_share: number;
  service_share: number;
  discount_share: number;
  total: number;
}

export interface Reconciliation {
  sum_of_person_totals: number;
  matches_bill: boolean;
}

export interface SettleUp {
  from: string;
  to: string;
  amount: number;
}

export interface ApiSplitResponse {
  per_person: PerPersonSplit[];
  grand_total: number;
  reconciliation: Reconciliation;
  paid_by: string;
  settle_up: SettleUp[];
  assumptions: string[];
  flags: string[];
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  line_total: number;
  unit_price?: number;
}

export interface ReceiptData {
  items: ReceiptItem[];
  subtotal: number;
  service_charge: number;
  tax: number;
  discount: number;
  tip?: number;
  round_off?: number;
  grand_total: number;
}

export interface ItemAllocation {
  item_name: string;
  quantity_consumed?: number;
  consumers: string[];
}

export interface DescriptionData {
  people: string[];
  payer: string | null;
  item_allocations: ItemAllocation[];
  default_consumers: string[];
  assumptions: string[];
}
