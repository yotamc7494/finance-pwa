// src/App.tsx
import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ensureInitialData } from './db/db';
import { TransactionsView } from './features/transactions/TransactionsView';
import { AccountsView } from './features/accounts/AccountsView';
import { CategoriesView } from './features/categories/CategoriesView';
import {
  syncTransactionsWithGAS,
  registerOnlineSyncListener,
  type SyncResult,
} from './features/transactions/services/syncService';
import './index.css';

type ActiveTab = 'transactions' | 'accounts' | 'categories';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('transactions');
  const [filterAccountId, setFilterAccountId] = useState<string | null>(null);
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  // Live queries for badge counts
  const pendingTxCount = useLiveQuery(
    () => db.transactions.where('synced').equals(0).count(),
    []
  ) ?? 0;
  const pendingAccCount = useLiveQuery(
    () => db.accounts.where('synced').equals(0).count(),
    []
  ) ?? 0;
  const pendingCatCount = useLiveQuery(
    () => db.categories.where('synced').equals(0).count(),
    []
  ) ?? 0;

  const totalPending = pendingTxCount + pendingAccCount + pendingCatCount;

  // Global Sync Handler
  const handleGlobalSync = async () => {
    setIsSyncing(true);
    const result = await syncTransactionsWithGAS();
    setSyncResult(result);
    setIsSyncing(false);
  };

  // Initial load: ensure seed data and run initial sync
  useEffect(() => {
    let active = true;
    const init = async () => {
      await ensureInitialData();
      setIsSyncing(true);
      const res = await syncTransactionsWithGAS();
      if (active) {
        setSyncResult(res);
        setIsSyncing(false);
      }
    };
    init();

    const cleanup = registerOnlineSyncListener((res) => setSyncResult(res));
    return () => {
      active = false;
      cleanup();
    };
  }, []);

  // Handlers for cross-view navigation
  const handleViewTransactionsForAccount = (accId: string) => {
    setFilterAccountId(accId);
    setFilterCategoryId(null);
    setActiveTab('transactions');
  };

  const handleViewTransactionsForCategory = (catId: string) => {
    setFilterCategoryId(catId);
    setFilterAccountId(null);
    setActiveTab('transactions');
  };

  return (
    <div
      className="min-h-screen bg-finance-bg text-slate-100 flex flex-col selection:bg-violet-500 selection:text-white"
      dir="rtl"
    >
      {/* ── Top Navigation Bar ── */}
      <nav className="sticky top-0 z-40 glass-panel border-b border-white/10 px-4 py-3 backdrop-blur-xl bg-slate-900/80">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          {/* Logo & App Name */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-emerald-400 p-[1px] shadow-lg shadow-violet-500/20">
              <div className="w-full h-full bg-slate-900 rounded-xl flex items-center justify-center text-lg">
                💎
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-base bg-gradient-to-l from-violet-300 via-indigo-200 to-white bg-clip-text text-transparent">
                  Dual
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/10 text-slate-400 font-medium">
                  ניהול פיננסי
                </span>
              </div>
              <p className="text-[10px] text-slate-400 hidden sm:block">
                עופרי ויותם · כספים, תקציב וחשבונות
              </p>
            </div>
          </div>

          {/* Center Tabs (Desktop) */}
          <div className="hidden md:flex items-center gap-1.5 p-1 rounded-2xl bg-slate-800/60 border border-white/10">
            <button
              id="nav-desktop-transactions"
              onClick={() => setActiveTab('transactions')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'transactions'
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <span>📋</span>
              <span>תנועות</span>
            </button>

            <button
              id="nav-desktop-accounts"
              onClick={() => setActiveTab('accounts')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'accounts'
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <span>🏦</span>
              <span>חשבונות</span>
            </button>

            <button
              id="nav-desktop-categories"
              onClick={() => setActiveTab('categories')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'categories'
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <span>🏷️</span>
              <span>קטגוריות ותקציב</span>
            </button>
          </div>

          {/* Sync & Pending Badge */}
          <div className="flex items-center gap-2">
            {totalPending > 0 && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold"
                title={`${totalPending} פריטים ממתינים לסנכרון`}
              >
                {totalPending} להעלאה
              </span>
            )}

            {syncResult && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold border transition-all hidden sm:inline-block ${
                  syncResult.status === 'success'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : syncResult.status === 'offline'
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                }`}
                title={syncResult.message}
              >
                {syncResult.status === 'success'
                  ? '✓ סונכרן'
                  : syncResult.status === 'offline'
                  ? '📶 אופליין'
                  : '⚠ שגיאה'}
              </span>
            )}

            <button
              id="btn-global-sync"
              onClick={handleGlobalSync}
              disabled={isSyncing}
              className={`btn-icon p-2 rounded-xl border border-white/10 hover:bg-white/10 transition-all ${
                isSyncing ? 'opacity-70 cursor-not-allowed' : ''
              }`}
              title="סנכרן את כל הנתונים מול Google Sheets"
            >
              <svg
                className={`w-4 h-4 text-slate-200 ${
                  isSyncing ? 'animate-spin text-violet-400' : ''
                }`}
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
          </div>
        </div>
      </nav>

      {/* ── Main View Content ── */}
      <main className="flex-1 flex flex-col">
        {activeTab === 'transactions' && (
          <TransactionsView
            initialAccountId={filterAccountId}
            initialCategoryId={filterCategoryId}
            onClearAccountFilter={() => setFilterAccountId(null)}
            onClearCategoryFilter={() => setFilterCategoryId(null)}
            onSync={handleGlobalSync}
            isSyncingGlobal={isSyncing}
            syncResultGlobal={syncResult}
          />
        )}

        {activeTab === 'accounts' && (
          <AccountsView
            onViewTransactionsForAccount={handleViewTransactionsForAccount}
            onSync={handleGlobalSync}
            isSyncing={isSyncing}
          />
        )}

        {activeTab === 'categories' && (
          <CategoriesView
            onViewTransactionsForCategory={handleViewTransactionsForCategory}
            onSync={handleGlobalSync}
            isSyncing={isSyncing}
          />
        )}
      </main>

      {/* ── Bottom Mobile Navigation Bar ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden glass-panel border-t border-white/10 px-4 py-2 backdrop-blur-2xl bg-slate-900/95 shadow-2xl">
        <div className="max-w-md mx-auto grid grid-cols-3 gap-2">
          <button
            id="nav-mobile-transactions"
            onClick={() => setActiveTab('transactions')}
            className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all ${
              activeTab === 'transactions'
                ? 'text-violet-400 font-bold bg-violet-500/15'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="text-lg">📋</span>
            <span className="text-[11px] mt-0.5">תנועות</span>
          </button>

          <button
            id="nav-mobile-accounts"
            onClick={() => setActiveTab('accounts')}
            className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all ${
              activeTab === 'accounts'
                ? 'text-violet-400 font-bold bg-violet-500/15'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="text-lg">🏦</span>
            <span className="text-[11px] mt-0.5">חשבונות</span>
          </button>

          <button
            id="nav-mobile-categories"
            onClick={() => setActiveTab('categories')}
            className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all ${
              activeTab === 'categories'
                ? 'text-violet-400 font-bold bg-violet-500/15'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="text-lg">🏷️</span>
            <span className="text-[11px] mt-0.5">קטגוריות</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default App;
