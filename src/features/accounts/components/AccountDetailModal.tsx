// src/features/accounts/components/AccountDetailModal.tsx
import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/db';
import type { Account, Transaction } from '../../transactions/types/transaction.types';

interface AccountDetailModalProps {
  account: Account;
  onClose: () => void;
  onEdit: (account: Account) => void;
  onViewTransactions: (accountId: string) => void;
}

export const AccountDetailModal: React.FC<AccountDetailModalProps> = ({
  account,
  onClose,
  onEdit,
  onViewTransactions,
}) => {
  // Related transactions
  const transactions = useLiveQuery(
    () =>
      db.transactions
        .filter((t) => t.accountId === account.id || t.toAccountId === account.id)
        .toArray(),
    [account.id]
  ) ?? [];

  // Related charge account if credit card
  const chargeAccount = useLiveQuery(
    async () => {
      if (!account.chargeAccountId) return undefined;
      return await db.accounts.get(account.chargeAccountId);
    },
    [account.chargeAccountId]
  );

  // Live balance calculation
  const calculatedBalance = useMemo(() => {
    return transactions.reduce((acc, t) => {
      if (t.type === 'Transfer') {
        if (t.toAccountId === account.id) {
          return acc + (t.convertedToAccountAmount != null ? t.convertedToAccountAmount : t.amount);
        }
        if (t.accountId === account.id) {
          return acc - t.amount;
        }
        return acc;
      }
      if (t.accountId === account.id) {
        if (t.type === 'Income') {
          return acc + t.amount;
        }
        // Expense: if refund, it adds back
        return acc - (t.refund ? -t.amount : t.amount);
      }
      return acc;
    }, 0);
  }, [transactions, account.id]);

  // Color according to AppSheet format rules
  const ownerColor =
    account.owner === 'יותם'
      ? 'text-[#1581BF] bg-[#1581BF]/15 border-[#1581BF]/30'
      : account.owner === 'עופרי'
      ? 'text-[#F6B1CE] bg-[#F6B1CE]/15 border-[#F6B1CE]/30'
      : 'text-violet-400 bg-violet-500/15 border-violet-500/30';

  const typeIcon =
    account.type === 'Bank' ? '🏦' : account.type === 'Credit Card' ? '💳' : '📈';

  const typeLabel =
    account.type === 'Bank'
      ? 'בנק ועו״ש'
      : account.type === 'Credit Card'
      ? 'כרטיס אשראי'
      : 'חשבון השקעות';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      dir="rtl"
    >
      <div className="glass-panel w-full max-w-lg rounded-2xl border border-white/10 p-6 max-h-[90vh] overflow-y-auto space-y-6 animate-slide-up shadow-2xl shadow-violet-950/40">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl">
              {typeIcon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-100">{account.name}</h2>
                {account.favorite && <span title="מועדף">⭐</span>}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${ownerColor}`}>
                  {account.owner}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-white/5">
                  {typeLabel}
                </span>
                {account.status === 'Not Active' && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                    לא פעיל
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Balance Card Banner */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-800/80 to-slate-800/40 border border-white/10 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-semibold mb-1">יתרה מחושבת נוכחית</div>
            <div
              className={`text-2xl font-black tracking-tight ${
                calculatedBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {calculatedBalance.toLocaleString('he-IL', { minimumFractionDigits: 2 })} {account.currency === 'ILS' ? '₪' : account.currency}
            </div>
          </div>

          {account.type === 'Credit Card' && account.creditLimit && (
            <div className="text-left">
              <div className="text-xs text-slate-400 font-semibold mb-1">מסגרת אשראי</div>
              <div className="text-lg font-bold text-slate-200">
                {account.creditLimit.toLocaleString('he-IL')} ₪
              </div>
            </div>
          )}

          {account.type === 'Invesments' && account.investmentGainPercent !== undefined && (
            <div className="text-left">
              <div className="text-xs text-slate-400 font-semibold mb-1">תשואה</div>
              <div
                className={`text-lg font-bold ${
                  account.investmentGainPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {account.investmentGainPercent >= 0 ? '+' : ''}
                {(account.investmentGainPercent * 100).toFixed(1)}%
              </div>
            </div>
          )}
        </div>

        {/* Specific Details */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <span className="text-xs text-slate-400 block mb-0.5">מטבע</span>
            <span className="font-semibold text-slate-200">{account.accountCurrency}</span>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <span className="text-xs text-slate-400 block mb-0.5">כמות תנועות</span>
            <span className="font-semibold text-slate-200">{transactions.length}</span>
          </div>

          {account.type === 'Credit Card' && (
            <>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <span className="text-xs text-slate-400 block mb-0.5">יום חיוב</span>
                <span className="font-semibold text-slate-200">ב-{account.billingDay || 10} לחודש</span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <span className="text-xs text-slate-400 block mb-0.5">חשבון לחיוב</span>
                <span className="font-semibold text-slate-200">
                  {chargeAccount ? `${chargeAccount.name} (${chargeAccount.owner})` : 'לא הוגדר'}
                </span>
              </div>
            </>
          )}

          {account.type === 'Invesments' && (
            <>
              {account.investmentsGain !== undefined && (
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <span className="text-xs text-slate-400 block mb-0.5">רווח נומינלי</span>
                  <span
                    className={`font-semibold ${
                      account.investmentsGain >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {account.investmentsGain.toLocaleString('he-IL')} ₪
                  </span>
                </div>
              )}
              {account.cagr !== undefined && (
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <span className="text-xs text-slate-400 block mb-0.5">CAGR שנתי</span>
                  <span className="font-semibold text-slate-200">
                    {(account.cagr * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Recent Transactions in this Account */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              פעולות אחרונות בחשבון ({transactions.length})
            </h3>
            <button
              onClick={() => {
                onClose();
                onViewTransactions(account.id);
              }}
              className="text-xs text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1"
            >
              <span>הצג הכל בתנועות</span>
              <span>←</span>
            </button>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {transactions.slice(0, 5).map((t: Transaction) => (
              <div
                key={t.id}
                className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-semibold text-slate-200">{t.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{t.date}</div>
                </div>
                <div
                  className={`font-bold ${
                    t.type === 'Income'
                      ? 'text-emerald-400'
                      : t.type === 'Expense'
                      ? 'text-rose-400'
                      : 'text-violet-400'
                  }`}
                >
                  {t.type === 'Expense' ? '-' : t.type === 'Income' ? '+' : ''}
                  {t.amount.toLocaleString('he-IL')} {t.currency === 'ILS' ? '₪' : t.currency}
                </div>
              </div>
            ))}

            {transactions.length === 0 && (
              <div className="p-4 text-center text-xs text-slate-500 rounded-xl bg-white/[0.02] border border-white/5">
                אין תנועות משויכות לחשבון זה עדיין
              </div>
            )}
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-white/10">
          <button
            onClick={() => {
              onClose();
              onViewTransactions(account.id);
            }}
            className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-1.5"
          >
            <span>📜</span>
            <span>הצג תנועות חשבון</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onEdit(account);
              }}
              className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
            >
              <span>✏️</span>
              <span>ערוך חשבון</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
