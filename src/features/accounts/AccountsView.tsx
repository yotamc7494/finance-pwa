// src/features/accounts/AccountsView.tsx
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, queuePendingDeletion } from '../../db/db';
import type { Account, AccountType, AccountOwner } from '../transactions/types/transaction.types';
import { AccountForm } from './components/AccountForm';
import { AccountDetailModal } from './components/AccountDetailModal';
import { syncTransactionsWithGAS } from '../transactions/services/syncService';

interface AccountsViewProps {
  onViewTransactionsForAccount: (accountId: string) => void;
  onSync: () => Promise<void>;
  isSyncing: boolean;
}

const OWNER_FILTERS: { owner: 'All' | AccountOwner; label: string; activeStyle: string }[] = [
  { owner: 'All', label: 'כל החשבונות', activeStyle: 'bg-violet-500/20 text-violet-300 border-violet-500/40' },
  { owner: 'יותם', label: 'יותם', activeStyle: 'bg-[#1581BF]/20 text-[#1581BF] border-[#1581BF]/40 ring-1 ring-[#1581BF]' },
  { owner: 'עופרי', label: 'עופרי', activeStyle: 'bg-[#F6B1CE]/20 text-[#F6B1CE] border-[#F6B1CE]/40 ring-1 ring-[#F6B1CE]' },
  { owner: 'משותף', label: 'משותף', activeStyle: 'bg-purple-500/20 text-purple-300 border-purple-500/40 ring-1 ring-purple-500' },
];

const SECTIONS: { type: AccountType; title: string; icon: string; description: string }[] = [
  { type: 'Bank', title: 'בנק ועו״ש', icon: '🏦', description: 'חשבונות בנק ונזילות שוטפת' },
  { type: 'Credit Card', title: 'כרטיסי אשראי', icon: '💳', description: 'מסגרות וחיובים חודשיים' },
  { type: 'Invesments', title: 'חשבונות השקעה', icon: '📈', description: 'תיקי מסחר, פנסיה וקופות' },
];

export const AccountsView: React.FC<AccountsViewProps> = ({
  onViewTransactionsForAccount,
  onSync,
  isSyncing,
}) => {
  const [selectedOwner, setSelectedOwner] = useState<'All' | AccountOwner>('All');
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [detailAccount, setDetailAccount] = useState<Account | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Live queries
  const accounts = useLiveQuery(() => db.accounts.toArray(), []) ?? [];
  const transactions = useLiveQuery(() => db.transactions.toArray(), []) ?? [];

  // Compute live balances per account from all transactions
  const accountBalances = useMemo(() => {
    const balances = new Map<string, number>();

    // Initial base for each account
    for (const acc of accounts) {
      balances.set(acc.id, 0);
    }

    for (const t of transactions) {
      if (t.type === 'Transfer') {
        // Outgoing
        const fromCurr = balances.get(t.accountId) ?? 0;
        balances.set(t.accountId, fromCurr - t.amount);

        // Incoming
        if (t.toAccountId) {
          const toCurr = balances.get(t.toAccountId) ?? 0;
          const incomingAmt = t.convertedToAccountAmount != null ? t.convertedToAccountAmount : t.amount;
          balances.set(t.toAccountId, toCurr + incomingAmt);
        }
      } else {
        const curr = balances.get(t.accountId) ?? 0;
        if (t.type === 'Income') {
          balances.set(t.accountId, curr + t.amount);
        } else if (t.type === 'Expense') {
          // If refund, it was returned money
          balances.set(t.accountId, curr - (t.refund ? -t.amount : t.amount));
        }
      }
    }

    return balances;
  }, [accounts, transactions]);

  // Filtered accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter((a) => {
      const matchOwner = selectedOwner === 'All' || a.owner === selectedOwner;
      const matchStatus = showInactive ? true : a.status === 'Active';
      return matchOwner && matchStatus;
    });
  }, [accounts, selectedOwner, showInactive]);

  // Overall Totals
  const totals = useMemo(() => {
    let bankTotal = 0;
    let creditTotal = 0;
    let investmentsTotal = 0;

    for (const a of filteredAccounts) {
      const bal = accountBalances.get(a.id) ?? 0;
      if (a.type === 'Bank') {
        bankTotal += bal;
      } else if (a.type === 'Credit Card') {
        creditTotal += bal;
      } else if (a.type === 'Invesments') {
        investmentsTotal += bal;
      }
    }

    const netWorth = bankTotal + creditTotal + investmentsTotal;
    return { bankTotal, creditTotal, investmentsTotal, netWorth };
  }, [filteredAccounts, accountBalances]);

  // Toggle favorite
  const handleToggleFavorite = async (account: Account, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await db.accounts.update(account.id, {
        favorite: !account.favorite,
        synced: 0,
      });
      onSync();
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  // Delete account
  const handleDeleteAccount = async (id: string) => {
    try {
      await queuePendingDeletion(id, 'Accounts');
      await db.accounts.delete(id);
      setDeleteConfirmId(null);
      if (detailAccount?.id === id) setDetailAccount(null);
      onSync();
    } catch (err) {
      console.error('Failed to delete account:', err);
    }
  };

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-4 space-y-6 pb-24" dir="rtl">
      {/* ── Net Worth Overview Banner ── */}
      <div className="glass-panel p-5 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-800/80 to-slate-900/90 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block mb-1">
                שווי נקי כולל (מחושב)
              </span>
              <div
                className={`text-3xl sm:text-4xl font-black tracking-tight ${
                  totals.netWorth >= 0 ? 'text-slate-100' : 'text-rose-400'
                }`}
              >
                {totals.netWorth.toLocaleString('he-IL', { minimumFractionDigits: 2 })} ₪
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                id="btn-add-account"
                onClick={() => {
                  setEditingAccount(null);
                  setShowForm(true);
                }}
                className="btn-primary text-xs px-3.5 py-2.5 shadow-lg shadow-violet-500/20"
              >
                + חשבון חדש
              </button>
            </div>
          </div>

          {/* Sub-breakdown chips */}
          <div className="grid grid-cols-3 gap-2.5 pt-3 border-t border-white/10">
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                <span>🏦</span>
                <span>בנקים ועו״ש</span>
              </div>
              <div className="font-bold text-sm sm:text-base text-slate-200">
                {totals.bankTotal.toLocaleString('he-IL', { maximumFractionDigits: 0 })} ₪
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                <span>💳</span>
                <span>אשראי (ניצול)</span>
              </div>
              <div className="font-bold text-sm sm:text-base text-rose-300">
                {totals.creditTotal.toLocaleString('he-IL', { maximumFractionDigits: 0 })} ₪
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                <span>📈</span>
                <span>תיק השקעות</span>
              </div>
              <div className="font-bold text-sm sm:text-base text-emerald-300">
                {totals.investmentsTotal.toLocaleString('he-IL', { maximumFractionDigits: 0 })} ₪
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Filters: Owner selection & Active toggle ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Owner pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {OWNER_FILTERS.map(({ owner, label, activeStyle }) => {
            const isActive = selectedOwner === owner;
            return (
              <button
                key={owner}
                onClick={() => setSelectedOwner(owner)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all ${
                  isActive
                    ? activeStyle
                    : 'bg-slate-800/60 border-white/10 text-slate-400 hover:bg-slate-700/60'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Toggle inactive */}
        <button
          onClick={() => setShowInactive(!showInactive)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
            showInactive
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'
          }`}
        >
          {showInactive ? 'מציג לא פעילים' : 'הצג לא פעילים'}
        </button>
      </div>

      {/* ── Sections Grouped by Account Type ── */}
      <div className="space-y-8">
        {SECTIONS.map(({ type, title, icon, description }) => {
          const sectionAccounts = filteredAccounts.filter((a) => a.type === type);

          return (
            <div key={type} className="space-y-3">
              {/* Section Header */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{icon}</span>
                  <div>
                    <h2 className="text-base font-bold text-slate-100">{title}</h2>
                    <p className="text-[11px] text-slate-400">{description}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-500 font-semibold">
                  {sectionAccounts.length} חשבונות
                </span>
              </div>

              {/* Cards Grid */}
              {sectionAccounts.length === 0 ? (
                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-center text-xs text-slate-500">
                  אין חשבונות בקטגוריה זו
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {sectionAccounts.map((account) => {
                    const balance = accountBalances.get(account.id) ?? 0;
                    const isYotam = account.owner === 'יותם';
                    const isOfri = account.owner === 'עופרי';

                    // Owner tag style per format rule
                    const ownerBadge = isYotam
                      ? 'text-[#1581BF] bg-[#1581BF]/15 border-[#1581BF]/30'
                      : isOfri
                      ? 'text-[#F6B1CE] bg-[#F6B1CE]/15 border-[#F6B1CE]/30'
                      : 'text-violet-400 bg-violet-500/15 border-violet-500/30';

                    return (
                      <div
                        key={account.id}
                        onClick={() => setDetailAccount(account)}
                        className={`group relative p-4 rounded-2xl glass-panel border transition-all duration-200 cursor-pointer hover:border-white/20 hover:scale-[1.01] hover:shadow-lg ${
                          account.status === 'Not Active'
                            ? 'opacity-60 bg-slate-900/40 border-white/5'
                            : 'border-white/10 hover:border-violet-500/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={(e) => handleToggleFavorite(account, e)}
                              className="text-base text-slate-400 hover:text-amber-400 transition-colors"
                              title={account.favorite ? 'מועדף (לחץ להסרה)' : 'סמן כמועדף'}
                            >
                              {account.favorite ? '⭐' : '☆'}
                            </button>
                            <div>
                              <h3
                                className={`font-bold text-sm sm:text-base ${
                                  isYotam
                                    ? 'text-[#1581BF]'
                                    : isOfri
                                    ? 'text-[#F6B1CE]'
                                    : 'text-slate-100'
                                }`}
                              >
                                {account.name}
                              </h3>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span
                                  className={`text-[10px] px-2 py-0.2 rounded-full font-bold border ${ownerBadge}`}
                                >
                                  {account.owner}
                                </span>
                                {account.type === 'Credit Card' && account.billingDay && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 border border-white/5">
                                    חיוב ב-{account.billingDay}
                                  </span>
                                )}
                                {account.status === 'Not Active' && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-red-500/20 text-red-400 border border-red-500/20">
                                    לא פעיל
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Quick Actions */}
                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingAccount(account);
                                setShowForm(true);
                              }}
                              className="action-btn action-btn--edit"
                              title="ערוך חשבון"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmId(account.id);
                              }}
                              className="action-btn action-btn--delete"
                              title="מחק חשבון"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>

                        {/* Balance display according to AppSheet Formatted Balance formula */}
                        <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                          <span className="text-xs text-slate-400">שווי נוכחי:</span>
                          <div className="text-right">
                            {type === 'Bank' && (
                              <span
                                className={`text-base font-black ${
                                  balance >= 0 ? 'text-slate-100' : 'text-rose-400'
                                }`}
                              >
                                {balance.toLocaleString('he-IL', { minimumFractionDigits: 2 })} {account.currency === 'ILS' ? '₪' : account.currency}
                              </span>
                            )}

                            {type === 'Credit Card' && (
                              <div className="flex items-baseline gap-1">
                                <span className="text-base font-black text-rose-400">
                                  {balance.toLocaleString('he-IL', { minimumFractionDigits: 0 })}
                                </span>
                                {account.creditLimit ? (
                                  <span className="text-xs text-slate-400 font-semibold">
                                    / {account.creditLimit.toLocaleString('he-IL')} ₪
                                  </span>
                                ) : (
                                  <span className="text-xs text-slate-400"> ₪</span>
                                )}
                              </div>
                            )}

                            {type === 'Invesments' && (
                              <div className="flex items-center gap-2">
                                <span className="text-base font-black text-slate-100">
                                  {balance.toLocaleString('he-IL', { minimumFractionDigits: 0 })} ₪
                                </span>
                                {account.investmentGainPercent !== undefined && (
                                  <span
                                    className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${
                                      account.investmentGainPercent >= 0
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                    }`}
                                  >
                                    {account.investmentGainPercent >= 0 ? '+' : ''}
                                    {(account.investmentGainPercent * 100).toFixed(1)}%
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Bottom action pill: View Transactions */}
                        <div className="mt-2.5 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewTransactionsForAccount(account.id);
                            }}
                            className="text-[11px] text-violet-400 hover:text-violet-300 font-medium flex items-center gap-1 group-hover:underline"
                          >
                            <span>הצג תנועות בחשבון</span>
                            <span>←</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Account Form Modal ── */}
      {showForm && (
        <AccountForm
          editingAccount={editingAccount}
          onSaved={() => {
            setShowForm(false);
            setEditingAccount(null);
            onSync();
          }}
          onCancel={() => {
            setShowForm(false);
            setEditingAccount(null);
          }}
        />
      )}

      {/* ── Account Detail Modal ── */}
      {detailAccount && (
        <AccountDetailModal
          account={detailAccount}
          onClose={() => setDetailAccount(null)}
          onEdit={(acc) => {
            setDetailAccount(null);
            setEditingAccount(acc);
            setShowForm(true);
          }}
          onViewTransactions={(accId) => {
            setDetailAccount(null);
            onViewTransactionsForAccount(accId);
          }}
        />
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteConfirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          dir="rtl"
        >
          <div className="glass-panel w-full max-w-sm rounded-2xl border border-white/10 p-5 space-y-4">
            <h3 className="text-base font-bold text-slate-100">מחיקת חשבון</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              האם אתה בטוח שברצונך למחוק חשבון זה? פעולה זו תימחק גם מ-Google Sheets בסנכרון הבא.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="btn-secondary text-xs px-3.5 py-2"
              >
                ביטול
              </button>
              <button
                onClick={() => handleDeleteAccount(deleteConfirmId)}
                className="btn-danger text-xs px-4 py-2"
              >
                מחק לצמיתות
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
