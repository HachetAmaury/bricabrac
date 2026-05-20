export type Item = {
  id: string;
  name: string;
  price: number;
  archived: boolean;
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

export type SaleEvent = {
  id: string;
  name: string;
  kind: EventKind;
  createdAt: number;
  enabledItemIds: string[];
  sales: Sale[];
};
