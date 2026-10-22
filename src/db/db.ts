import Dexie, { type Table } from 'dexie';
import type {
  Transaction,
  Account,
  Category,
  Tag,
  PendingDeletion,
  SyncableTable,
} from '../features/transactions/types/transaction.types';
import { SEED_ACCOUNTS, SEED_CATEGORIES, SEED_TAGS } from './seedData';

// ─────────────────────────────────────────────────────────────────────────────
// Database Schema
// ─────────────────────────────────────────────────────────────────────────────

export interface SettingItem {
  key: string;
  value: any;
}

export class FinanceDB extends Dexie {
  transactions!: Table<Transaction, string>;
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  tags!: Table<Tag, string>;
  pendingDeletions!: Table<PendingDeletion, string>;
  settings!: Table<SettingItem, string>;

  constructor() {
    super('FinanceDB');

    this.version(1).stores({
      transactions: 'id, syncId, date, type, categoryId, accountId, toAccountId, synced',
      accounts: 'id, currency, active',
      categories: 'id, type',
    });

    this.version(2).stores({
      transactions: 'id, syncId, date, type, categoryId, accountId, toAccountId, synced',
      accounts: 'id, currency, active',
      categories: 'id, type',
      tags: 'id, name',
    });

    this.version(3).stores({
      transactions: 'id, syncId, date, type, categoryId, accountId, toAccountId, synced',
      accounts: 'id, currency, active',
      categories: 'id, type',
      tags: 'id, name',
      pendingDeletions: 'id, timestamp',
    });

    this.version(4).stores({
      transactions: 'id, syncId, date, type, categoryId, accountId, toAccountId, synced',
      accounts: 'id, type, owner, status, favorite, synced',
      categories: 'id, type, synced',
      tags: 'id, name',
      pendingDeletions: 'id, table, timestamp',
      settings: 'key',
    });
  }
}

export const db = new FinanceDB();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate AppSheet-compatible 8-char hex unique ID */
export function generateUniqueId(): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/** Return all active accounts */
export const getActiveAccounts = () =>
  db.accounts.filter((a) => a.status === 'Active').toArray();

/** Return categories filtered by type */
export const getCategoriesByType = (type: 'Expense' | 'Income') =>
  db.categories.where('type').equals(type).toArray();

/** Return pending (unsynced) transactions */
export const getPendingTransactions = () =>
  db.transactions.where('synced').equals(0).toArray();

/** Return pending (unsynced) accounts */
export const getPendingAccounts = () =>
  db.accounts.where('synced').equals(0).toArray();

/** Return pending (unsynced) categories */
export const getPendingCategories = () =>
  db.categories.where('synced').equals(0).toArray();

/** Register a pending deletion for any table by ID */
export async function queuePendingDeletion(id: string, table: SyncableTable = 'Transactions') {
  await db.pendingDeletions.put({
    id,
    table,
    timestamp: Date.now(),
  });
}

/** Ensure tables have initial seed data if empty */
export async function ensureInitialData() {
  const accCount = await db.accounts.count();
  if (accCount === 0) {
    await db.accounts.bulkPut(SEED_ACCOUNTS);
  }
  const catCount = await db.categories.count();
  if (catCount === 0) {
    await db.categories.bulkPut(SEED_CATEGORIES);
  }
  const tagCount = await db.tags.count();
  if (tagCount === 0) {
    await db.tags.bulkPut(SEED_TAGS);
  }
}

