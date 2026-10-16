// ─────────────────────────────────────────────────────────────────────────────
// Transaction & Entity Types matching Dual AppSheet Schema
// Date format across the whole app: DD/MM/YYYY
// ─────────────────────────────────────────────────────────────────────────────

export type TransactionType = 'Expense' | 'Income' | 'Transfer';

export interface Transaction {
  /** Local IndexedDB primary key (unique ID e.g. '1a86cd70' or AppSheet UNIQUEID) */
  id: string;
  /** Google Sheets row ID (same as id) */
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

// ─── Account Types ───────────────────────────────────────────────────────────

export type AccountType = 'Bank' | 'Credit Card' | 'Invesments';
export type AccountOwner = 'עופרי' | 'יותם' | 'משותף';
export type AccountStatus = 'Active' | 'Not Active';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  owner: AccountOwner;
  accountCurrency: string;
  /** Compatibility alias for accountCurrency */
  currency: string;
  status: AccountStatus;
  /** Compatibility alias for status === 'Active' */
  active: boolean;
  favorite: boolean;
  creditLimit?: number;
  billingDay?: string | number;
  chargeAccountId?: string;
  nextCreditBill?: number;
  investmentGainPercent?: number;
  investmentsGain?: number;
  cagr?: number;
  /** 0 = pending local changes, 1 = synced to GAS */
  synced: 0 | 1;
}

// ─── Category Types ──────────────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  type: 'Expense' | 'Income';
  monthlyBudget: number;
  /** Compatibility alias for monthlyBudget */
  budgetLimit: number;
  spentThisMonth: number;
  currency: string;
  exchange?: number;
  finalAmount?: number;
  icon?: string;
  /** 0 = pending local changes, 1 = synced to GAS */
  synced: 0 | 1;
}

export interface Tag {
  id: string;
  name: string;
}

// ─── Pending Deletions for Multi-Table ID-Based Sync ──────────────────────────

export type SyncableTable = 'Transactions' | 'Accounts' | 'Categories';

export interface PendingDeletion {
  id: string;
  table: SyncableTable;
  timestamp: number;
}

// ─── Form State ───────────────────────────────────────────────────────────────

export type TransactionFormValues = Omit<Transaction, 'id' | 'syncId' | 'synced'>;

export interface AccountFormValues {
  name: string;
  type: AccountType;
  owner: AccountOwner;
  accountCurrency: string;
  status: AccountStatus;
  favorite: boolean;
  creditLimit: number;
  billingDay: string;
  chargeAccountId: string;
}

export interface CategoryFormValues {
  name: string;
  type: 'Expense' | 'Income';
  monthlyBudget: number;
  currency: string;
}

// ─── Filter Types ─────────────────────────────────────────────────────────────

export type FilterType = 'All' | TransactionType;
export type OwnerFilterType = 'All' | AccountOwner;

// ─── GAS Sync Payload ─────────────────────────────────────────────────────────

export interface SyncPayload {
  action: 'sync' | 'delete' | 'upsert';
  table?: SyncableTable;
  ids?: string[];
  items?: any[];
  transactions?: Transaction[];
}

export interface GASResponse {
  Transactions?: any[];
  Categories?: any[];
  Accounts?: any[];
  Tags?: any[];
  status?: 'success' | 'error' | string;
  message?: string;
  added?: number;
  updated?: number;
  deleted?: number;
  ignored?: number;
}

