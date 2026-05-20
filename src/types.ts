export type Item = {
  id: string;
  name: string;
  price: number;     // cents
  archived: boolean;
};

export type EventKind = 'tournoi' | 'bric-a-brac' | 'autre';

export type CartLine = { itemId: string; qty: number };

export type SaleLine = {
  itemId: string;
  name: string;
  price: number;   // cents, snapshotted at sale time
  qty: number;
};

export type Sale = {
  id: string;
  timestamp: number;
  lines: SaleLine[];
  total: number;        // cents, frozen at sale time
  cashGiven?: number;   // cents, optional
  change?: number;      // cents, optional
};

export type SaleEvent = {
  id: string;
  name: string;
  kind: EventKind;
  createdAt: number;
  enabledItemIds: string[];
  sales: Sale[];
};
