// src/features/categories/components/CategoryForm.tsx
import React, { useState } from 'react';
import { db, generateUniqueId } from '../../../db/db';
import type { Category } from '../../transactions/types/transaction.types';

interface CategoryFormProps {
  editingCategory?: Category | null;
  onSaved: () => void;
  onCancel: () => void;
}

const CATEGORY_ICONS = [
  '🛒', '🍽️', '🏠', '🚗', '🍿', '🍻', '💼', '🎁', '💊',
  '✈️', '👶', '👔', '🏋️', '🎓', '🛡️', '💰', '🐾', '📦',
  '☕', '⛽', '📱', '🎮', '💄', '💇', '🔧', '🧾', '🏷️',
];

const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP'];

export const CategoryForm: React.FC<CategoryFormProps> = ({
  editingCategory,
  onSaved,
  onCancel,
}) => {
  const isEdit = Boolean(editingCategory);

  const [name, setName] = useState(editingCategory?.name || '');
  const [type, setType] = useState<'Expense' | 'Income'>(editingCategory?.type || 'Expense');
  const [monthlyBudget, setMonthlyBudget] = useState<number | ''>(
    editingCategory?.monthlyBudget ?? 0
  );
  const [currency, setCurrency] = useState(editingCategory?.currency || 'ILS');
  const [icon, setIcon] = useState(editingCategory?.icon || (type === 'Expense' ? '🛒' : '💼'));

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('נא להזין שם קטגוריה');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const categoryId = editingCategory?.id || generateUniqueId();
      const budgetVal = monthlyBudget === '' ? 0 : Number(monthlyBudget);

      const categoryData: Category = {
        id: categoryId,
        name: name.trim(),
        type,
        monthlyBudget: budgetVal,
        budgetLimit: budgetVal,
        spentThisMonth: editingCategory?.spentThisMonth || 0,
        currency,
        icon,
        synced: 0,
      };

      await db.categories.put(categoryData);
      onSaved();
    } catch (err: any) {
      console.error('Failed to save category:', err);
      setError(err?.message || 'שגיאה בשמירת הקטגוריה');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      dir="rtl"
    >
      <div className="glass-panel w-full max-w-md rounded-2xl border border-white/10 p-6 max-h-[90vh] overflow-y-auto space-y-6 animate-slide-up shadow-2xl shadow-violet-950/40">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span>{isEdit ? '✏️ עריכת קטגוריה' : '➕ קטגוריה חדשה'}</span>
          </h2>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Category Type */}
          <div>
            <label className="form-label mb-2">סוג קטגוריה</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setType('Expense');
                  if (!editingCategory) setIcon('🛒');
                }}
                className={`py-2.5 px-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                  type === 'Expense'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 ring-1 ring-rose-500 shadow-md shadow-rose-600/20'
                    : 'bg-slate-800/60 border-white/10 text-slate-400 hover:bg-slate-700/60'
                }`}
              >
                <span>🔴</span>
                <span>הוצאה</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setType('Income');
                  if (!editingCategory) setIcon('💼');
                }}
                className={`py-2.5 px-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                  type === 'Income'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 ring-1 ring-emerald-500 shadow-md shadow-emerald-600/20'
                    : 'bg-slate-800/60 border-white/10 text-slate-400 hover:bg-slate-700/60'
                }`}
              >
                <span>🟢</span>
                <span>הכנסה</span>
              </button>
            </div>
          </div>

          {/* Name & Selected Icon preview */}
          <div>
            <label className="form-label mb-1.5">שם הקטגוריה *</label>
            <div className="flex items-center gap-2">
              <div className="w-11 h-11 rounded-xl bg-slate-800 border border-white/10 flex items-center justify-center text-2xl flex-shrink-0">
                {icon}
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="לדוגמה: מזון וקניות, דלק, משכורת..."
                className="form-input flex-1"
                required
                autoFocus
              />
            </div>
          </div>

          {/* Icon Picker Grid */}
          <div>
            <label className="form-label mb-1.5">בחר אייקון לקטגוריה</label>
            <div className="grid grid-cols-9 gap-1.5 p-2 rounded-xl bg-slate-800/40 border border-white/10 max-h-32 overflow-y-auto">
              {CATEGORY_ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:scale-110 transition-transform ${
                    icon === ic
                      ? 'bg-violet-600/40 border border-violet-400 shadow-sm'
                      : 'hover:bg-white/5'
                  }`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          {/* Budget & Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label mb-1.5">תקציב חודשי (₪)</label>
              <input
                type="number"
                min="0"
                step="50"
                placeholder="0"
                value={monthlyBudget}
                onChange={(e) =>
                  setMonthlyBudget(e.target.value === '' ? '' : Number(e.target.value))
                }
                className="form-input"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                {type === 'Income' ? 'יעד הכנסה חודשי' : '0 = ללא מגבלת תקציב'}
              </span>
            </div>

            <div>
              <label className="form-label mb-1.5">מטבע</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="form-input"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c} {c === 'ILS' ? '(₪)' : c === 'USD' ? '($)' : c === 'EUR' ? '(€)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button type="button" onClick={onCancel} className="btn-secondary px-4 py-2">
              ביטול
            </button>
            <button type="submit" disabled={isSaving} className="btn-primary px-6 py-2">
              {isSaving ? 'שומר...' : isEdit ? 'שמור שינויים' : 'צור קטגוריה'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
