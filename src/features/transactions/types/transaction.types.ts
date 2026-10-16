// ─────────────────────────────────────────────────────────────────────────────
// Transaction Types
// Date format across the whole app: DD/MM/YYYY
// ─────────────────────────────────────────────────────────────────────────────

export type TransactionType = 'Expense' | 'Income' | 'Transfer';

export interface Transaction {
  /** Local IndexedDB primary key (uuid) */
  id: string;
  /** Google Sheets row ID (set after first successful sync) */
  syncId: string;
  /** Display date in DD/MM/YYYY */
  date: string;
  type: TransactionType;
  label: string;
  /** Required when type !== 'Transfer' */
  categoryId: string | null;
  /** Source account ID */
  accountId: string;
  /** Target account ID – required when type === 'Transfer' */
  toAccountId: string | null;
  /** Derived from accountId's currency */
  currency: string;
  /** Always a positive decimal */
  amount: number;
  /**
   * Required when type === 'Transfer' AND source currency !== target currency.
   * Represents the amount in the target account's currency.
   */
  convertedToAccountAmount: number | null;
  tags: string[];
  refund: boolean;
  /** 0 = pending local changes, 1 = synced to GAS */
  synced: 0 | 1;
}

// ─── Seed / Reference Data ───────────────────────────────────────────────────

export interface Account {
  id: string;
  name: string;
  currency: string;
  /** Whether the account is still active */
  active: boolean;
  type?: string;
  owner?: string;
}

export interface Category {
  id: string;
  name: string;
  /** 'Expense' | 'Income' */
  type: 'Expense' | 'Income';
  /** Monthly budget cap (Expense categories) */
  budgetLimit: number;
  /** Running total already spent in the current month */
  spentThisMonth: number;
}

export interface Tag {
  id: string;
  name: string;
}

// ─── Form State ───────────────────────────────────────────────────────────────

export type TransactionFormValues = Omit<Transaction, 'id' | 'syncId' | 'synced'>;

// ─── Filter ───────────────────────────────────────────────────────────────────

export type FilterType = 'All' | TransactionType;

// ─── GAS Sync Payload ─────────────────────────────────────────────────────────

export interface SyncPayload {
  transactions: Transaction[];
}

export interface GASResponse {
  Transactions?: any[];
  Categories?: any[];
  status?: 'success' | 'error' | string;
  message?: string;
  data?: Transaction[];
}

