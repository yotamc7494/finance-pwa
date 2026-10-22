// src/features/categories/CategoriesView.tsx
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, queuePendingDeletion } from '../../db/db';
import type { Category } from '../transactions/types/transaction.types';
import { CategoryForm } from './components/CategoryForm';
import { CategoryDetailModal } from './components/CategoryDetailModal';

interface CategoriesViewProps {
  onViewTransactionsForCategory: (categoryId: string) => void;
  onSync: () => Promise<void>;
  isSyncing: boolean;
}

const currentMonthYearString = (): string => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${yyyy}`;
};

export const CategoriesView: React.FC<CategoriesViewProps> = ({
  onViewTransactionsForCategory,
  onSync,
  isSyncing,
}) => {
  const [selectedMonthYear, setSelectedMonthYear] = useState(currentMonthYearString());
  const [activeTab, setActiveTab] = useState<'All' | 'Expense' | 'Income'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [detailCategory, setDetailCategory] = useState<Category | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Live queries
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? [];
  const transactions = useLiveQuery(() => db.transactions.toArray(), []) ?? [];

  // Available months from transactions + current month
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    set.add(currentMonthYearString());
    for (const t of transactions) {
      if (t.date) {
        const parts = t.date.split('/');
        if (parts.length === 3) {
          set.add(`${parts[1].padStart(2, '0')}/${parts[2]}`);
        }
      }
    }
    return Array.from(set).sort((a, b) => {
      const [m1, y1] = a.split('/').map(Number);
      const [m2, y2] = b.split('/').map(Number);
      return y2 !== y1 ? y2 - y1 : m2 - m1;
    });
  }, [transactions]);

  // Compute month spending & transaction counts per category
  const categoryStats = useMemo(() => {
    const spentMap = new Map<string, number>();
    const countMap = new Map<string, number>();

    for (const c of categories) {
      spentMap.set(c.id, 0);
      countMap.set(c.id, 0);
    }

    for (const t of transactions) {
      if (!t.categoryId) continue;

      // Count all-time transactions in category
      const currentCount = countMap.get(t.categoryId) ?? 0;
      countMap.set(t.categoryId, currentCount + 1);

      // Check month match
      if (t.date) {
        const parts = t.date.split('/');
        if (parts.length === 3) {
          const mmYyyy = `${parts[1].padStart(2, '0')}/${parts[2]}`;
          if (mmYyyy === selectedMonthYear) {
            const currentSpent = spentMap.get(t.categoryId) ?? 0;
            const netAmount = t.amount * (t.refund ? -1 : 1);
            spentMap.set(t.categoryId, currentSpent + netAmount);
          }
        }
      }
    }

    return { spentMap, countMap };
  }, [categories, transactions, selectedMonthYear]);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    return categories.filter((c) => {
      const matchType = activeTab === 'All' || c.type === activeTab;
      const matchSearch = !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchType && matchSearch;
    });
  }, [categories, activeTab, searchQuery]);

  // Overall Budget & Spending Totals for Expense categories
  const budgetSummary = useMemo(() => {
    let totalBudget = 0;
    let totalSpent = 0;

    for (const c of categories) {
      if (c.type === 'Expense') {
        totalBudget += c.monthlyBudget || 0;
        totalSpent += categoryStats.spentMap.get(c.id) ?? 0;
      }
    }

    const remaining = totalBudget - totalSpent;
    const percentUsed = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
    const isOver = totalBudget > 0 && remaining < 0;

    return { totalBudget, totalSpent, remaining, percentUsed, isOver };
  }, [categories, categoryStats]);

  // Delete Category
  const handleDeleteCategory = async (id: string) => {
    try {
      await queuePendingDeletion(id, 'Categories');
      await db.categories.delete(id);
      setDeleteConfirmId(null);
      if (detailCategory?.id === id) setDetailCategory(null);
      onSync();
    } catch (err) {
      console.error('Failed to delete category:', err);
    }
  };

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-4 space-y-6 pb-24" dir="rtl">
      {/* ── Budget Overview Banner ── */}
      <div className="glass-panel p-5 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-800/80 to-slate-900/90 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block mb-1">
                תקציב חודשי מול הוצאות בפועל
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black text-slate-100">
                  {budgetSummary.totalSpent.toLocaleString('he-IL', { maximumFractionDigits: 0 })} ₪
                </span>
                <span className="text-sm text-slate-400">
                  מתוך {budgetSummary.totalBudget.toLocaleString('he-IL')} ₪ תקציב
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Month selector */}
              <div className="relative">
                <select
                  value={selectedMonthYear}
                  onChange={(e) => setSelectedMonthYear(e.target.value)}
                  className="bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
                >
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      חודש {m}
                    </option>
                  ))}
                </select>
              </div>

              <button
                id="btn-add-category"
                onClick={() => {
                  setEditingCategory(null);
                  setShowForm(true);
                }}
                className="btn-primary text-xs px-3.5 py-2 shadow-lg shadow-violet-500/20"
              >
                + קטגוריה חדשה
              </button>
            </div>
          </div>

          {/* Overall Progress Bar */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-bold text-slate-300">
                {budgetSummary.percentUsed}% נוצל מהתקציב החודשי
              </span>
              <span
                className={`font-black ${
                  budgetSummary.isOver
                    ? 'text-rose-400'
                    : budgetSummary.remaining < budgetSummary.totalBudget * 0.2
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              >
                {budgetSummary.isOver
                  ? `חריגה של ${Math.abs(budgetSummary.remaining).toLocaleString('he-IL', { maximumFractionDigits: 0 })} ₪`
                  : `יתרה לתקציב: ${budgetSummary.remaining.toLocaleString('he-IL', { maximumFractionDigits: 0 })} ₪`}
              </span>
            </div>

            <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-white/5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  budgetSummary.isOver
                    ? 'bg-rose-500 shadow-lg shadow-rose-500/50'
                    : budgetSummary.percentUsed >= 80
                    ? 'bg-amber-500 shadow-lg shadow-amber-500/50'
                    : 'bg-emerald-500 shadow-lg shadow-emerald-500/50'
                }`}
                style={{ width: `${Math.min(budgetSummary.percentUsed, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Search & Filter Tabs ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Type pills */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('All')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
              activeTab === 'All'
                ? 'bg-violet-500/20 text-violet-300 border-violet-500/40 ring-1 ring-violet-500'
                : 'bg-slate-800/60 border-white/10 text-slate-400 hover:bg-slate-700/60'
            }`}
          >
            כל הקטגוריות ({categories.length})
          </button>
          <button
            onClick={() => setActiveTab('Expense')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
              activeTab === 'Expense'
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 ring-1 ring-rose-500'
                : 'bg-slate-800/60 border-white/10 text-slate-400 hover:bg-slate-700/60'
            }`}
          >
            הוצאות ({categories.filter((c) => c.type === 'Expense').length})
          </button>
          <button
            onClick={() => setActiveTab('Income')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
              activeTab === 'Income'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 ring-1 ring-emerald-500'
                : 'bg-slate-800/60 border-white/10 text-slate-400 hover:bg-slate-700/60'
            }`}
          >
            הכנסות ({categories.filter((c) => c.type === 'Income').length})
          </button>
        </div>

        {/* Search */}
        <div className="relative sm:w-64">
          <input
            type="search"
            placeholder="חיפוש קטגוריה..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input text-xs py-1.5 pr-8 w-full"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
            🔍
          </span>
        </div>
      </div>

      {/* ── Categories Sections (Expenses & Income) ── */}
      <div className="space-y-8">
        {/* Expenses Section */}
        {(activeTab === 'All' || activeTab === 'Expense') && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔴</span>
                <div>
                  <h2 className="text-base font-bold text-slate-100">קטגוריות הוצאה</h2>
                  <p className="text-[11px] text-slate-400">מעקב תקציבים וחיסכון חודשי</p>
                </div>
              </div>
              <span className="text-xs text-slate-500 font-semibold">
                {filteredCategories.filter((c) => c.type === 'Expense').length} קטגוריות
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {filteredCategories
                .filter((c) => c.type === 'Expense')
                .map((category) => {
                  const spent = categoryStats.spentMap.get(category.id) ?? 0;
                  const count = categoryStats.countMap.get(category.id) ?? 0;
                  const budget = category.monthlyBudget || 0;
                  const hasBudget = budget > 0;
                  const percent = hasBudget ? Math.round((spent / budget) * 100) : 0;
                  const remaining = budget - spent;
                  const isOver = hasBudget && remaining < 0;

                  return (
                    <div
                      key={category.id}
                      onClick={() => setDetailCategory(category)}
                      className="group relative p-4 rounded-2xl glass-panel border border-white/10 hover:border-violet-500/40 hover:scale-[1.01] hover:shadow-lg transition-all duration-200 cursor-pointer"
                    >
                      {/* Top Row: Icon + Name + Actions */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-white/10 flex items-center justify-center text-xl flex-shrink-0 group-hover:scale-110 transition-transform">
                            {category.icon || '🛒'}
                          </div>
                          <div>
                            <h3 className="font-bold text-sm sm:text-base text-slate-100">
                              {category.name}
                            </h3>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {hasBudget ? `תקציב: ${budget.toLocaleString('he-IL')} ₪` : 'ללא תקציב מוגדר'}
                            </div>
                          </div>
                        </div>

                        {/* Card Quick Actions */}
                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCategory(category);
                              setShowForm(true);
                            }}
                            className="action-btn action-btn--edit"
                            title="ערוך קטגוריה"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmId(category.id);
                            }}
                            className="action-btn action-btn--delete"
                            title="מחק קטגוריה"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      {/* Middle: Spent amount */}
                      <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                        <span className="text-xs text-slate-400">הוצאות החודש:</span>
                        <div className="text-right">
                          <span className="text-base font-black text-rose-400">
                            {spent.toLocaleString('he-IL', { minimumFractionDigits: 0 })} ₪
                          </span>
                        </div>
                      </div>

                      {/* Budget Progress Bar (Budget SVG equivalent) */}
                      {hasBudget && (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400 font-semibold">{percent}%</span>
                            <span
                              className={`font-bold ${
                                isOver
                                  ? 'text-rose-400'
                                  : remaining < budget * 0.2
                                  ? 'text-amber-400'
                                  : 'text-emerald-400'
                              }`}
                            >
                              {isOver
                                ? `חריגה של ${Math.abs(remaining).toLocaleString('he-IL')} ₪`
                                : `נשאר ${remaining.toLocaleString('he-IL')} ₪`}
                            </span>
                          </div>
                          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden p-0.5">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                isOver
                                  ? 'bg-rose-500 shadow-sm shadow-rose-500/50'
                                  : percent >= 80
                                  ? 'bg-amber-500 shadow-sm shadow-amber-500/50'
                                  : 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                              }`}
                              style={{ width: `${Math.min(percent, 100)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Bottom row */}
                      <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400">
                        <span>{count} עסקאות בסך הכל</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewTransactionsForCategory(category.id);
                          }}
                          className="text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1 group-hover:underline"
                        >
                          <span>הצג עסקאות</span>
                          <span>←</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Income Section */}
        {(activeTab === 'All' || activeTab === 'Income') && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="text-xl">🟢</span>
                <div>
                  <h2 className="text-base font-bold text-slate-100">קטגוריות הכנסה</h2>
                  <p className="text-[11px] text-slate-400">משכורות, הכנסות נוספות ומענקים</p>
                </div>
              </div>
              <span className="text-xs text-slate-500 font-semibold">
                {filteredCategories.filter((c) => c.type === 'Income').length} קטגוריות
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {filteredCategories
                .filter((c) => c.type === 'Income')
                .map((category) => {
                  const spent = categoryStats.spentMap.get(category.id) ?? 0;
                  const count = categoryStats.countMap.get(category.id) ?? 0;
                  const target = category.monthlyBudget || 0;

                  return (
                    <div
                      key={category.id}
                      onClick={() => setDetailCategory(category)}
                      className="group relative p-4 rounded-2xl glass-panel border border-white/10 hover:border-emerald-500/40 hover:scale-[1.01] hover:shadow-lg transition-all duration-200 cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-white/10 flex items-center justify-center text-xl flex-shrink-0 group-hover:scale-110 transition-transform">
                            {category.icon || '💼'}
                          </div>
                          <div>
                            <h3 className="font-bold text-sm sm:text-base text-slate-100">
                              {category.name}
                            </h3>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {target > 0 ? `יעד: ${target.toLocaleString('he-IL')} ₪` : 'הכנסה שוטפת'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCategory(category);
                              setShowForm(true);
                            }}
                            className="action-btn action-btn--edit"
                            title="ערוך קטגוריה"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmId(category.id);
                            }}
                            className="action-btn action-btn--delete"
                            title="מחק קטגוריה"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                        <span className="text-xs text-slate-400">הכנסות החודש:</span>
                        <div className="text-right">
                          <span className="text-base font-black text-emerald-400">
                            +{spent.toLocaleString('he-IL', { minimumFractionDigits: 0 })} ₪
                          </span>
                        </div>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400">
                        <span>{count} עסקאות בסך הכל</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewTransactionsForCategory(category.id);
                          }}
                          className="text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1 group-hover:underline"
                        >
                          <span>הצג עסקאות</span>
                          <span>←</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* ── Category Form Modal ── */}
      {showForm && (
        <CategoryForm
          editingCategory={editingCategory}
          onSaved={() => {
            setShowForm(false);
            setEditingCategory(null);
            onSync();
          }}
          onCancel={() => {
            setShowForm(false);
            setEditingCategory(null);
          }}
        />
      )}

      {/* ── Category Detail Modal ── */}
      {detailCategory && (
        <CategoryDetailModal
          category={detailCategory}
          selectedMonthYear={selectedMonthYear}
          onClose={() => setDetailCategory(null)}
          onEdit={(cat) => {
            setDetailCategory(null);
            setEditingCategory(cat);
            setShowForm(true);
          }}
          onViewTransactions={(catId) => {
            setDetailCategory(null);
            onViewTransactionsForCategory(catId);
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
            <h3 className="text-base font-bold text-slate-100">מחיקת קטגוריה</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              האם אתה בטוח שברצונך למחוק קטגוריה זו? פעולה זו תימחק גם מ-Google Sheets בסנכרון הבא.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="btn-secondary text-xs px-3.5 py-2"
              >
                ביטול
              </button>
              <button
                onClick={() => handleDeleteCategory(deleteConfirmId)}
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
