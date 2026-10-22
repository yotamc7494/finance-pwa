// src/features/categories/components/CategoryDetailModal.tsx
import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/db';
import type { Category, Transaction } from '../../transactions/types/transaction.types';

interface CategoryDetailModalProps {
  category: Category;
  selectedMonthYear: string; // e.g. "MM/YYYY"
  onClose: () => void;
  onEdit: (category: Category) => void;
  onViewTransactions: (categoryId: string) => void;
}

export const CategoryDetailModal: React.FC<CategoryDetailModalProps> = ({
  category,
  selectedMonthYear,
  onClose,
  onEdit,
  onViewTransactions,
}) => {
  // Fetch all transactions in this category
  const allCategoryTxns = useLiveQuery(
    () => db.transactions.where('categoryId').equals(category.id).toArray(),
    [category.id]
  ) ?? [];

  // Filter for selected month
  const monthTxns = useMemo(() => {
    return allCategoryTxns.filter((t) => {
      if (!t.date) return false;
      const parts = t.date.split('/');
      if (parts.length === 3) {
        const mmYyyy = `${parts[1].padStart(2, '0')}/${parts[2]}`;
        return mmYyyy === selectedMonthYear;
      }
      return false;
    });
  }, [allCategoryTxns, selectedMonthYear]);

  // Total spent in month
  const spentThisMonth = useMemo(() => {
    return monthTxns.reduce((sum, t) => {
      const net = t.amount * (t.refund ? -1 : 1);
      return sum + net;
    }, 0);
  }, [monthTxns]);

  const budget = category.monthlyBudget || 0;
  const hasBudget = budget > 0;
  const percentUsed = hasBudget ? Math.round((spentThisMonth / budget) * 100) : 0;
  const remaining = budget - spentThisMonth;
  const isOverBudget = hasBudget && remaining < 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      dir="rtl"
    >
      <div className="glass-panel w-full max-w-lg rounded-2xl border border-white/10 p-6 max-h-[90vh] overflow-y-auto space-y-6 animate-slide-up shadow-2xl shadow-violet-950/40">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl">
              {category.icon || (category.type === 'Expense' ? '🔴' : '🟢')}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100">{category.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                    category.type === 'Expense'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  }`}
                >
                  {category.type === 'Expense' ? 'הוצאה' : 'הכנסה'}
                </span>
                <span className="text-xs text-slate-400">חודש: {selectedMonthYear}</span>
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

        {/* Budget Progress Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-800/80 to-slate-800/40 border border-white/10 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <div>
              <span className="text-xs text-slate-400 block mb-0.5">נוצל החודש</span>
              <span
                className={`text-2xl font-black ${
                  category.type === 'Expense' ? 'text-slate-100' : 'text-emerald-400'
                }`}
              >
                {spentThisMonth.toLocaleString('he-IL', { minimumFractionDigits: 0 })} ₪
              </span>
            </div>

            {hasBudget && (
              <div className="text-left">
                <span className="text-xs text-slate-400 block mb-0.5">תקציב חודשי</span>
                <span className="text-xl font-bold text-slate-300">
                  {budget.toLocaleString('he-IL')} ₪
                </span>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {hasBudget && (
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-slate-300">{percentUsed}% מהתקציב</span>
                <span
                  className={`font-bold ${
                    isOverBudget
                      ? 'text-rose-400'
                      : remaining < budget * 0.2
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {isOverBudget
                    ? `חריגה של ${Math.abs(remaining).toLocaleString('he-IL')} ₪`
                    : `נשאר החודש ${remaining.toLocaleString('he-IL')} ₪`}
                </span>
              </div>

              <div className="w-full h-3 bg-slate-700/60 rounded-full overflow-hidden p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isOverBudget
                      ? 'bg-rose-500 shadow-md shadow-rose-500/50'
                      : percentUsed >= 80
                      ? 'bg-amber-500 shadow-md shadow-amber-500/50'
                      : 'bg-emerald-500 shadow-md shadow-emerald-500/50'
                  }`}
                  style={{ width: `${Math.min(percentUsed, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Transactions in Month */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              פעולות בחודש {selectedMonthYear} ({monthTxns.length})
            </h3>
            <button
              onClick={() => {
                onClose();
                onViewTransactions(category.id);
              }}
              className="text-xs text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1"
            >
              <span>הצג הכל בתנועות</span>
              <span>←</span>
            </button>
          </div>

          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {monthTxns.map((t: Transaction) => (
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
                    t.type === 'Income' ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {t.type === 'Expense' ? '-' : '+'}
                  {t.amount.toLocaleString('he-IL')} {t.currency === 'ILS' ? '₪' : t.currency}
                </div>
              </div>
            ))}

            {monthTxns.length === 0 && (
              <div className="p-4 text-center text-xs text-slate-500 rounded-xl bg-white/[0.02] border border-white/5">
                אין עסקאות בחודש זה עבור קטגוריה זו
              </div>
            )}
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-white/10">
          <button
            onClick={() => {
              onClose();
              onViewTransactions(category.id);
            }}
            className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-1.5"
          >
            <span>📜</span>
            <span>הצג את כל הפעולות</span>
          </button>

          <button
            onClick={() => {
              onClose();
              onEdit(category);
            }}
            className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
          >
            <span>✏️</span>
            <span>ערוך קטגוריה</span>
          </button>
        </div>
      </div>
    </div>
  );
};
