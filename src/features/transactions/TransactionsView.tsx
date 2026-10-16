import React, { useEffect, useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { Transaction, FilterType, TransactionType } from './types/transaction.types';
import { TransactionForm } from './components/TransactionForm';
import {
  syncTransactionsWithGAS,
  registerOnlineSyncListener,
  type SyncResult,
} from './services/syncService';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Parse DD/MM/YYYY → sortable number (YYYYMMDD) */
const dateToSortKey = (date: string): number => {
  if (!date) return 0;
  const parts = date.split('/');
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts;
    return parseInt(`${yyyy}${mm.padStart(2, '0')}${dd.padStart(2, '0')}`, 10) || 0;
  }
  const d = new Date(date);
  return !isNaN(d.getTime()) ? d.getTime() : 0;
};

/** Format a number as a currency string */
const formatCurrency = (amount: number, currency: string) =>
  amount.toLocaleString('he-IL', { style: 'currency', currency: currency || 'ILS', minimumFractionDigits: 2 });

/** Group transactions by date, sorted descending */
function groupByDate(txns: Transaction[]): Map<string, Transaction[]> {
  const map = new Map<string, Transaction[]>();
  const sorted = [...txns].sort((a, b) => dateToSortKey(b.date) - dateToSortKey(a.date));
  for (const txn of sorted) {
    const group = map.get(txn.date) ?? [];
    group.push(txn);
    map.set(txn.date, group);
  }
  return map;
}

/** Compute daily net (Expense negative, Income positive, Transfer ignored) */
function dailyNet(txns: Transaction[]): number {
  return txns.reduce((acc, t) => {
    if (t.type === 'Transfer') return acc;
    return acc + (t.type === 'Income' ? t.amount : -t.amount);
  }, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// TransactionsView
// ─────────────────────────────────────────────────────────────────────────────

const FILTERS: FilterType[] = ['All', 'Expense', 'Income', 'Transfer'];
const FILTER_LABELS: Record<FilterType, string> = {
  All: 'הכל',
  Expense: 'הוצאות',
  Income: 'הכנסות',
  Transfer: 'העברות',
};

export const TransactionsView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('All');
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [visibleDaysCount, setVisibleDaysCount] = useState(30);

  // ── Live query ────────────────────────────────────────────────────────────

  const allTransactions = useLiveQuery(() => db.transactions.toArray(), []) ?? [];
  const accounts = useLiveQuery(() => db.accounts.toArray(), []) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? [];
  const tags = useLiveQuery(() => db.tags.toArray(), []) ?? [];

  // ── Reference lookups ─────────────────────────────────────────────────────

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts]
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );
  const tagMap = useMemo(
    () => new Map(tags.map((t) => [t.id, t])),
    [tags]
  );

  // ── Filtered & grouped data ───────────────────────────────────────────────

  const filtered = useMemo(() => {
    return allTransactions.filter((t) => {
      const matchesType = activeFilter === 'All' || t.type === activeFilter;
      const matchesSearch =
        !searchQuery ||
        t.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.date.includes(searchQuery) ||
        (t.categoryId && categoryMap.get(t.categoryId)?.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (accountMap.get(t.accountId)?.name.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesType && matchesSearch;
    });
  }, [allTransactions, activeFilter, searchQuery, categoryMap, accountMap]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  const dateEntries = useMemo(() => Array.from(grouped.entries()), [grouped]);
  const visibleDateEntries = useMemo(
    () => dateEntries.slice(0, visibleDaysCount),
    [dateEntries, visibleDaysCount]
  );

  // Reset pagination when search or filter changes
  useEffect(() => {
    setVisibleDaysCount(30);
  }, [searchQuery, activeFilter]);

  // ── Initial & Auto Sync ───────────────────────────────────────────────────

  const handleSync = async () => {
    setIsSyncing(true);
    const result = await syncTransactionsWithGAS();
    setSyncResult(result);
    setIsSyncing(false);
  };

  useEffect(() => {
    const cleanup = registerOnlineSyncListener((result) => setSyncResult(result));
    return cleanup;
  }, []);

  // Initial load sync: run once on mount
  useEffect(() => {
    let active = true;
    const runInitialSync = async () => {
      setIsSyncing(true);
      const res = await syncTransactionsWithGAS();
      if (active) {
        setSyncResult(res);
        setIsSyncing(false);
      }
    };
    runInitialSync();
    return () => {
      active = false;
    };
  }, []);

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    try {
      await db.pendingDeletions.put({ id, timestamp: Date.now() });
      await db.transactions.delete(id);
      setDeleteConfirm(null);
      handleSync();
    } catch (err) {
      console.error('Error deleting transaction:', err);
    }
  };

  // ── Form open/close ───────────────────────────────────────────────────────

  const openAdd = () => {
    setEditingTransaction(null);
    setShowForm(true);
  };

  const openEdit = (txn: Transaction) => {
    setEditingTransaction(txn);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingTransaction(null);
  };

  const handleSaved = async () => {
    closeForm();
    await handleSync();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-finance-bg text-slate-100 flex flex-col" dir="rtl">

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 glass-panel border-b border-white/10 px-4 py-4 backdrop-blur-md bg-slate-900/80">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-l from-violet-400 to-emerald-400 bg-clip-text text-transparent">
              ניהול פיננסי
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {allTransactions.length.toLocaleString('he-IL')} פעולות · {allTransactions.filter((t) => t.synced === 0).length} ממתינות לסנכרון
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Sync status badge */}
            {syncResult && (
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${
                  syncResult.status === 'success'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : syncResult.status === 'offline'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}
                title={syncResult.message}
              >
                {syncResult.status === 'success'
                  ? '✓ מסונכרן'
                  : syncResult.status === 'offline'
                  ? '📶 אופליין'
                  : '⚠ שגיאה'}
              </span>
            )}
            <button
              id="btn-sync"
              onClick={handleSync}
              disabled={isSyncing}
              className={`btn-icon p-2 rounded-xl border border-white/10 hover:bg-white/10 transition-all ${
                isSyncing ? 'opacity-70 cursor-not-allowed' : ''
              }`}
              title="סנכרן עם Google Sheets"
            >
              <svg
                className={`w-5 h-5 text-slate-200 ${isSyncing ? 'animate-spin text-violet-400' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
            <button id="btn-add-txn" onClick={openAdd} className="btn-primary px-4 py-2 text-sm gap-1.5 shadow-lg shadow-violet-500/20">
              + הוסף
            </button>
          </div>
        </div>

        {/* ── Search ── */}
        <div className="max-w-2xl mx-auto mt-3">
          <div className="relative">
            <svg
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              id="txn-search"
              type="search"
              placeholder="חיפוש לפי תיאור, קטגוריה, חשבון או תאריך..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input pr-10 w-full"
            />
          </div>
        </div>

        {/* ── Filter pills ── */}
        <div className="max-w-2xl mx-auto mt-2 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              id={`filter-${f.toLowerCase()}`}
              onClick={() => setActiveFilter(f)}
              className={`filter-pill ${activeFilter === f ? filterPillActive(f) : 'filter-pill--inactive'}`}
            >
              {FILTER_LABELS[f]}
              {f !== 'All' ? (
                <span className="ml-1 opacity-60 text-xs">
                  ({allTransactions.filter((t) => t.type === f).length})
                </span>
              ) : (
                <span className="ml-1 opacity-60 text-xs">
                  ({allTransactions.length})
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      {/* ── Status Toast / Banner ── */}
      {syncResult && (
        <div className="max-w-2xl mx-auto w-full px-4 pt-3">
          <div
            className={`p-3 rounded-xl text-xs flex items-center justify-between border ${
              syncResult.status === 'success'
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                : syncResult.status === 'offline'
                ? 'bg-amber-950/40 text-amber-300 border-amber-500/30'
                : 'bg-red-950/40 text-red-300 border-red-500/30'
            }`}
          >
            <span>{syncResult.message}</span>
            <span className="text-[10px] opacity-75">
              {syncResult.timestamp.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-4 space-y-6">

        {isSyncing && allTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
            <div className="w-12 h-12 border-4 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-200">מסנכרן נתונים מ-Google Sheets...</h3>
              <p className="text-sm text-slate-400">טוען עסקאות, חשבונות וקטגוריות</p>
            </div>
          </div>
        ) : grouped.size === 0 ? (
          <EmptyState onAdd={openAdd} onSync={handleSync} isSyncing={isSyncing} />
        ) : (
          <>
            {visibleDateEntries.map(([date, txns]) => (
              <DateGroup
                key={date}
                date={date}
                transactions={txns}
                accountMap={accountMap}
                categoryMap={categoryMap}
                tagMap={tagMap}
                onEdit={openEdit}
                onDelete={(id) => setDeleteConfirm(id)}
              />
            ))}

            {/* Load more button */}
            {dateEntries.length > visibleDaysCount && (
              <div className="text-center pt-2 pb-6">
                <button
                  onClick={() => setVisibleDaysCount((prev) => prev + 30)}
                  className="btn-secondary px-6 py-2.5 text-sm bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
                >
                  הצג עוד עסקאות (מציג {visibleDateEntries.length} מתוך {dateEntries.length} ימים)
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Modal: Form ── */}
      {showForm && (
        <Modal title={editingTransaction ? 'עריכת פעולה' : 'פעולה חדשה'} onClose={closeForm}>
          <TransactionForm
            editingTransaction={editingTransaction}
            onSaved={handleSaved}
            onCancel={closeForm}
          />
        </Modal>
      )}

      {/* ── Modal: Delete confirmation ── */}
      {deleteConfirm && (
        <Modal title="אישור מחיקה" onClose={() => setDeleteConfirm(null)} small>
          <p className="text-slate-300 mb-5">האם אתה בטוח שברצונך למחוק פעולה זו?</p>
          <div className="flex gap-3">
            <button
              id="btn-confirm-delete"
              onClick={() => handleDelete(deleteConfirm)}
              className="btn-danger flex-1"
            >
              מחק
            </button>
            <button onClick={() => setDeleteConfirm(null)} className="btn-secondary flex-1">
              ביטול
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── DateGroup ────────────────────────────────────────────────────────────────

interface DateGroupProps {
  date: string;
  transactions: Transaction[];
  accountMap: Map<string, { name: string; currency: string }>;
  categoryMap: Map<string, { name: string }>;
  tagMap: Map<string, { name: string }>;
  onEdit: (txn: Transaction) => void;
  onDelete: (id: string) => void;
}

const DateGroup: React.FC<DateGroupProps> = ({
  date,
  transactions,
  accountMap,
  categoryMap,
  tagMap,
  onEdit,
  onDelete,
}) => {
  const net = dailyNet(transactions);
  const currency = accountMap.get(transactions[0]?.accountId)?.currency ?? 'ILS';

  return (
    <section>
      {/* Group header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs font-semibold text-slate-400 tracking-wider">{date}</span>
        <span
          className={`text-sm font-bold ${
            net >= 0 ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {net >= 0 ? '+' : ''}
          {formatCurrency(net, currency)}
        </span>
      </div>

      {/* Cards */}
      <div className="space-y-2">
        {transactions.map((txn) => (
          <TransactionCard
            key={txn.id}
            txn={txn}
            accountMap={accountMap}
            categoryMap={categoryMap}
            tagMap={tagMap}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
};

// ─── TransactionCard ──────────────────────────────────────────────────────────

interface TransactionCardProps {
  txn: Transaction;
  accountMap: Map<string, { name: string; currency: string }>;
  categoryMap: Map<string, { name: string }>;
  tagMap: Map<string, { name: string }>;
  onEdit: (txn: Transaction) => void;
  onDelete: (id: string) => void;
}

const TYPE_ICONS: Record<TransactionType, string> = {
  Expense: '↓',
  Income: '↑',
  Transfer: '⇄',
};

const TYPE_COLORS: Record<TransactionType, string> = {
  Expense: 'txn-card--expense',
  Income: 'txn-card--income',
  Transfer: 'txn-card--transfer',
};

const TransactionCard: React.FC<TransactionCardProps> = ({
  txn,
  accountMap,
  categoryMap,
  tagMap,
  onEdit,
  onDelete,
}) => {
  const account = accountMap.get(txn.accountId);
  const toAccount = txn.toAccountId ? accountMap.get(txn.toAccountId) : undefined;
  const category = txn.categoryId ? categoryMap.get(txn.categoryId) : undefined;
  const amountStr = formatCurrency(txn.amount, txn.currency);

  return (
    <article className={`txn-card group ${TYPE_COLORS[txn.type]}`}>
      {/* Icon */}
      <div className={`txn-icon ${txn.type === 'Expense' ? 'txn-icon--expense' : txn.type === 'Income' ? 'txn-icon--income' : 'txn-icon--transfer'}`}>
        {TYPE_ICONS[txn.type]}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm truncate">{txn.label || 'ללא תיאור'}</span>
          {txn.refund && (
            <span className="badge badge--refund">החזר</span>
          )}
          {txn.synced === 0 && (
            <span className="badge badge--pending" title="ממתין לסנכרון">⏳</span>
          )}
        </div>
        <div className="text-xs text-slate-400 mt-0.5 flex gap-2 flex-wrap">
          {category && <span className="text-slate-300 font-medium">{category.name}</span>}
          <span>{account?.name ?? txn.accountId}</span>
          {toAccount && <span>→ {toAccount.name}</span>}
          {txn.tags.length > 0 && (
            <span className="flex gap-1 flex-wrap">
              {txn.tags.map((tag) => (
                <span key={tag} className="tag-chip tag-chip--sm">
                  {tagMap.get(tag)?.name ?? tag}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>

      {/* Amount */}
      <div className="text-left min-w-[90px]">
        <div
          className={`font-bold text-sm ${
            txn.type === 'Expense'
              ? 'text-red-400'
              : txn.type === 'Income'
              ? 'text-emerald-400'
              : 'text-violet-400'
          }`}
        >
          {txn.type === 'Expense' ? '−' : txn.type === 'Income' ? '+' : ''}
          {amountStr}
        </div>
        {txn.convertedToAccountAmount && (
          <div className="text-xs text-slate-500 mt-0.5">
            ≈ {formatCurrency(txn.convertedToAccountAmount, toAccount?.currency ?? '')}
          </div>
        )}
      </div>

      {/* Actions (visible on hover) */}
      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          id={`btn-edit-${txn.id}`}
          onClick={() => onEdit(txn)}
          className="action-btn action-btn--edit"
          title="ערוך"
        >
          ✏
        </button>
        <button
          id={`btn-delete-${txn.id}`}
          onClick={() => onDelete(txn.id)}
          className="action-btn action-btn--delete"
          title="מחק"
        >
          🗑
        </button>
      </div>
    </article>
  );
};

// ─── EmptyState ───────────────────────────────────────────────────────────────

interface EmptyStateProps {
  onAdd: () => void;
  onSync: () => void;
  isSyncing: boolean;
}

const EmptyState: React.FC<EmptyStateProps> = ({ onAdd, onSync, isSyncing }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="text-6xl mb-4">💳</div>
    <h2 className="text-xl font-bold text-slate-300 mb-2">אין פעולות להצגה</h2>
    <p className="text-slate-500 text-sm mb-6 max-w-sm">
      לחץ על סנכרון כדי למשוך את הפעולות מ-Google Sheets, או הוסף פעולה ידנית
    </p>
    <div className="flex gap-3">
      <button onClick={onSync} disabled={isSyncing} className="btn-secondary px-5 py-2.5">
        {isSyncing ? 'מסנכרן...' : '🔄 סנכרן מ-Google Sheets'}
      </button>
      <button onClick={onAdd} className="btn-primary px-5 py-2.5">
        + הוסף פעולה
      </button>
    </div>
  </div>
);

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  small?: boolean;
}

const Modal: React.FC<ModalProps> = ({ title, onClose, children, small }) => (
  <div
    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6"
    role="dialog"
    aria-modal="true"
  >
    {/* Backdrop */}
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    />

    {/* Sheet */}
    <div
      className={`relative z-10 w-full glass-panel rounded-2xl p-6 overflow-y-auto max-h-[90vh] ${
        small ? 'max-w-sm' : 'max-w-lg'
      } animate-slide-up`}
    >
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold">{title}</h2>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors text-xl leading-none"
          aria-label="סגור"
        >
          ×
        </button>
      </div>
      {children}
    </div>
  </div>
);

// ─── Filter pill helper ───────────────────────────────────────────────────────

function filterPillActive(f: FilterType): string {
  if (f === 'Expense') return 'filter-pill--expense';
  if (f === 'Income') return 'filter-pill--income';
  if (f === 'Transfer') return 'filter-pill--transfer';
  return 'filter-pill--all';
}
