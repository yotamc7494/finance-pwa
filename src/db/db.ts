import Dexie, { type Table } from 'dexie';
import type { Transaction, Account, Category, Tag } from '../features/transactions/types/transaction.types';
import { SEED_ACCOUNTS, SEED_CATEGORIES } from './seedData';

// ─────────────────────────────────────────────────────────────────────────────
// Database Schema
// ─────────────────────────────────────────────────────────────────────────────

export class FinanceDB extends Dexie {
  transactions!: Table<Transaction, string>;
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  tags!: Table<Tag, string>;

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
  }
}

export const db = new FinanceDB();

// ─── Seed reference data on first load ───────────────────────────────────────

db.on('ready', async () => {
  const accountCount = await db.accounts.count();
  if (accountCount === 0) {
    await db.accounts.bulkAdd(SEED_ACCOUNTS);
  }

  const categoryCount = await db.categories.count();
  if (categoryCount === 0) {
    await db.categories.bulkAdd(SEED_CATEGORIES);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return all active accounts */
export const getActiveAccounts = () => db.accounts.where('active').equals(1).toArray();

/** Return categories filtered by type */
export const getCategoriesByType = (type: 'Expense' | 'Income') =>
  db.categories.where('type').equals(type).toArray();

/** Return pending (unsynced) transactions */
export const getPendingTransactions = () =>
  db.transactions.where('synced').equals(0).toArray();
