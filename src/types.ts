export type Category = {
  id: string;
  name: string;
  color: string; // hex, e.g. '#ef4444'
};

export type Item = {
  id: string;
  name: string;
  price: number;
  archived: boolean;
  icon?: string; // emoji shown on the sell button
  categoryId?: string | null; // a single category, or null/undefined for none
};

export type EventKind = 'tournoi' | 'bric-a-brac' | 'autre';

export type CartLine = { itemId: string; qty: number };

export type SaleLine = {
  itemId: string;
  name: string;
  price: number;
  qty: number;
};

export type Sale = {
  id: string;
  timestamp: number;
  lines: SaleLine[];
  total: number;
  cashGiven?: number;
  change?: number;
};

// Denomination value in cents → quantity counted (e.g. { '5000': 3 } = three 50€ notes).
export type CashCount = Record<string, number>;

export type SaleEvent = {
  id: string;
  name: string;
  kind: EventKind;
  createdAt: number;
  enabledItemIds: string[];
  sales: Sale[];
  locked?: boolean; // when true, no new sales can be recorded
  cashFloat?: number; // fond de caisse in cents (starting cash)
  cashCount?: CashCount; // end-of-day cash count
};
