import type { Account, Category } from '../features/transactions/types/transaction.types';

export const SEED_ACCOUNTS: Account[] = [
  { id: 'acc-1', name: 'Bank Hapoalim (ILS)', currency: 'ILS', active: true },
  { id: 'acc-2', name: 'Discount Bank (ILS)', currency: 'ILS', active: true },
  { id: 'acc-3', name: 'PayPal (USD)', currency: 'USD', active: true },
  { id: 'acc-4', name: 'Cash (ILS)', currency: 'ILS', active: true },
  { id: 'acc-5', name: 'Revolut (EUR)', currency: 'EUR', active: false },
];

export const SEED_CATEGORIES: Category[] = [
  // Expense
  { id: 'cat-exp-1', name: 'Food & Dining', type: 'Expense', budgetLimit: 1500, spentThisMonth: 650 },
  { id: 'cat-exp-2', name: 'Transportation', type: 'Expense', budgetLimit: 500, spentThisMonth: 120 },
  { id: 'cat-exp-3', name: 'Housing', type: 'Expense', budgetLimit: 4000, spentThisMonth: 4000 },
  { id: 'cat-exp-4', name: 'Healthcare', type: 'Expense', budgetLimit: 300, spentThisMonth: 75 },
  { id: 'cat-exp-5', name: 'Entertainment', type: 'Expense', budgetLimit: 400, spentThisMonth: 210 },
  { id: 'cat-exp-6', name: 'Shopping', type: 'Expense', budgetLimit: 800, spentThisMonth: 340 },
  { id: 'cat-exp-7', name: 'Utilities', type: 'Expense', budgetLimit: 600, spentThisMonth: 480 },
  // Income
  { id: 'cat-inc-1', name: 'Salary', type: 'Income', budgetLimit: 0, spentThisMonth: 0 },
  { id: 'cat-inc-2', name: 'Freelance', type: 'Income', budgetLimit: 0, spentThisMonth: 0 },
  { id: 'cat-inc-3', name: 'Investment', type: 'Income', budgetLimit: 0, spentThisMonth: 0 },
  { id: 'cat-inc-4', name: 'Gift', type: 'Income', budgetLimit: 0, spentThisMonth: 0 },
];
