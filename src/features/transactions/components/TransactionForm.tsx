import React, { useEffect, useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../../db/db';
import type {
  Transaction,
  TransactionFormValues,
  Account,
  Category,
} from '../types/transaction.types';

// ─── Constants ────────────────────────────────────────────────────────────────

const TRANSACTION_TYPES = ['Expense', 'Income', 'Transfer'] as const;

const todayDDMMYYYY = (): string => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const EMPTY_FORM: TransactionFormValues = {
  date: todayDDMMYYYY(),
  type: 'Expense',
  label: '',
  categoryId: null,
  accountId: '',
  toAccountId: null,
  currency: '',
  amount: 0,
  convertedToAccountAmount: null,
  tags: [],
  refund: false,
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface TransactionFormProps {
  editingTransaction?: Transaction | null;
  onSaved: () => void;
  onCancel: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const TransactionForm: React.FC<TransactionFormProps> = ({
  editingTransaction,
  onSaved,
  onCancel,
}) => {
  const [form, setForm] = useState<TransactionFormValues>(EMPTY_FORM);
  const [tagInput, setTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof TransactionFormValues, string>>>({});

  // ── Reference data ────────────────────────────────────────────────────────

  const accounts = useLiveQuery(() => db.accounts.toArray(), []) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? [];
  const tags = useLiveQuery(() => db.tags.toArray(), []) ?? [];

  // ── Seed form when editing ────────────────────────────────────────────────

  useEffect(() => {
    if (editingTransaction) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, syncId, synced, ...rest } = editingTransaction;
      setForm(rest);
    } else {
      setForm(EMPTY_FORM);
    }
    setErrors({});
    setTagInput('');
  }, [editingTransaction]);

  // ── Derived values ────────────────────────────────────────────────────────

  const isTransfer = form.type === 'Transfer';
  const showCategory = !isTransfer;
  const showToAccount = isTransfer;
  const showTagsRefund = !isTransfer;

  const activeAccounts: Account[] = accounts.filter((a) => a.active);

  const filteredCategories: Category[] = categories.filter(
    (c) => form.type !== 'Transfer' && c.type === form.type
  );

  const selectedAccount = accounts.find((a) => a.id === form.accountId);
  const selectedToAccount = accounts.find((a) => a.id === form.toAccountId);

  const showConvertedAmount =
    isTransfer &&
    !!selectedAccount &&
    !!selectedToAccount &&
    selectedAccount.currency !== selectedToAccount.currency;

  // ── Live budget preview ───────────────────────────────────────────────────

  const selectedCategory = categories.find((c) => c.id === form.categoryId);
  const budgetRemaining =
    selectedCategory && form.type === 'Expense' && selectedCategory.budgetLimit > 0
      ? selectedCategory.budgetLimit - selectedCategory.spentThisMonth - (form.amount || 0)
      : null;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const set = useCallback(
    <K extends keyof TransactionFormValues>(key: K, value: TransactionFormValues[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    },
    []
  );

  const handleTypeChange = (type: typeof form.type) => {
    setForm((prev) => ({
      ...prev,
      type,
      categoryId: null,
      toAccountId: null,
      convertedToAccountAmount: null,
      tags: [],
      refund: false,
    }));
  };

  const handleAccountChange = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    setForm((prev) => ({
      ...prev,
      accountId,
      currency: account?.currency ?? '',
      toAccountId: prev.toAccountId === accountId ? null : prev.toAccountId,
      convertedToAccountAmount: null,
    }));
  };

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      set('tags', [...form.tags, tag]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    set('tags', form.tags.filter((t) => t !== tag));
  };

  // ── Validation ────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof TransactionFormValues, string>> = {};

    if (!form.date.match(/^\d{2}\/\d{2}\/\d{4}$/))
      newErrors.date = 'Date must be in DD/MM/YYYY format';
    if (!form.label.trim()) newErrors.label = 'Label is required';
    if (!form.accountId) newErrors.accountId = 'Account is required';
    if (form.amount <= 0) newErrors.amount = 'Amount must be greater than 0';
    if (showCategory && !form.categoryId) newErrors.categoryId = 'Category is required';
    if (showToAccount && !form.toAccountId) newErrors.toAccountId = 'Target account is required';
    if (showConvertedAmount && !form.convertedToAccountAmount)
      newErrors.convertedToAccountAmount = 'Converted amount is required for cross-currency transfer';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSaving(true);
    try {
      if (editingTransaction) {
        await db.transactions.update(editingTransaction.id, {
          ...form,
          synced: 0,
        });
      } else {
        const newTransaction: Transaction = {
          id: uuidv4(),
          syncId: '',
          ...form,
          synced: 0,
        };
        await db.transactions.add(newTransaction);
      }
      onSaved();
    } catch (err) {
      console.error('Error saving transaction:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-5" dir="rtl" noValidate>

      {/* Type pills */}
      <div>
        <label className="form-label">סוג</label>
        <div className="flex gap-2 mt-1">
          {TRANSACTION_TYPES.map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => handleTypeChange(t)}
              className={`type-pill ${
                form.type === t ? typePillActive(t) : 'type-pill--inactive'
              }`}
            >
              {t === 'Expense' ? 'הוצאה' : t === 'Income' ? 'הכנסה' : 'העברה'}
            </button>
          ))}
        </div>
      </div>

      {/* Date */}
      <FormField label="תאריך (DD/MM/YYYY)" error={errors.date}>
        <input
          id="txn-date"
          type="text"
          placeholder="DD/MM/YYYY"
          value={form.date}
          onChange={(e) => set('date', e.target.value)}
          className="form-input"
          maxLength={10}
        />
      </FormField>

      {/* Label */}
      <FormField label="תיאור" error={errors.label}>
        <input
          id="txn-label"
          type="text"
          placeholder="תיאור הפעולה..."
          value={form.label}
          onChange={(e) => set('label', e.target.value)}
          className="form-input"
        />
      </FormField>

      {/* Source Account */}
      <FormField label="חשבון מקור" error={errors.accountId}>
        <select
          id="txn-account"
          value={form.accountId}
          onChange={(e) => handleAccountChange(e.target.value)}
          className="form-input"
        >
          <option value="">בחר חשבון...</option>
          {activeAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </select>
      </FormField>

      {/* Category (Expense / Income only) */}
      {showCategory && (
        <FormField label="קטגוריה" error={errors.categoryId}>
          <select
            id="txn-category"
            value={form.categoryId ?? ''}
            onChange={(e) => set('categoryId', e.target.value || null)}
            className="form-input"
          >
            <option value="">בחר קטגוריה...</option>
            {filteredCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>
      )}

      {/* Target Account (Transfer only) */}
      {showToAccount && (
        <FormField label="חשבון יעד" error={errors.toAccountId}>
          <select
            id="txn-to-account"
            value={form.toAccountId ?? ''}
            onChange={(e) => set('toAccountId', e.target.value || null)}
            className="form-input"
          >
            <option value="">בחר חשבון יעד...</option>
            {activeAccounts
              .filter((a) => a.id !== form.accountId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
          </select>
        </FormField>
      )}

      {/* Amount */}
      <FormField label="סכום" error={errors.amount}>
        <div className="relative">
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm">
            {form.currency || '¤'}
          </span>
          <input
            id="txn-amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={form.amount || ''}
            onChange={(e) => set('amount', parseFloat(e.target.value) || 0)}
            className="form-input pr-14"
          />
        </div>
      </FormField>

      {/* Live Budget Preview */}
      {budgetRemaining !== null && (
        <div
          className={`budget-preview ${
            budgetRemaining < 0 ? 'budget-preview--over' : budgetRemaining < 100 ? 'budget-preview--warn' : 'budget-preview--ok'
          }`}
        >
          <span className="text-xs font-semibold uppercase tracking-wide opacity-70 block mb-0.5">
            יתרת תקציב חודשי
          </span>
          <span className="text-2xl font-bold">
            {budgetRemaining < 0 ? '–' : ''}
            {Math.abs(budgetRemaining).toLocaleString('he-IL', {
              style: 'currency',
              currency: form.currency || 'ILS',
            })}
          </span>
          {budgetRemaining < 0 && (
            <span className="text-xs mt-1 block opacity-80">חרגת מהתקציב!</span>
          )}
        </div>
      )}

      {/* Converted Amount (cross-currency Transfer) */}
      {showConvertedAmount && (
        <FormField
          label={`סכום בחשבון יעד (${selectedToAccount?.currency})`}
          error={errors.convertedToAccountAmount}
        >
          <div className="relative">
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm">
              {selectedToAccount?.currency}
            </span>
            <input
              id="txn-converted-amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.convertedToAccountAmount ?? ''}
              onChange={(e) =>
                set('convertedToAccountAmount', parseFloat(e.target.value) || null)
              }
              className="form-input pr-14"
            />
          </div>
        </FormField>
      )}

      {/* Tags & Refund (non-Transfer only) */}
      {showTagsRefund && (
        <>
          {/* Tags */}
          <div>
            <label className="form-label">תגיות</label>
            <div className="flex gap-2 mt-1">
              <input
                id="txn-tag-input"
                type="text"
                placeholder="הוסף תגית..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                className="form-input flex-1"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="btn-secondary px-3 py-2 text-sm"
              >
                +
              </button>
            </div>

            {/* Quick tag suggestions from sheet */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags
                  .filter((t) => !form.tags.includes(t.id) && !form.tags.includes(t.name))
                  .map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => set('tags', [...form.tags, t.id])}
                      className="text-xs px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5 transition-all"
                    >
                      + {t.name}
                    </button>
                  ))}
              </div>
            )}

            {/* Selected tags */}
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.tags.map((tag) => {
                  const tagObj = tags.find((t) => t.id === tag || t.name === tag);
                  return (
                    <span key={tag} className="tag-chip">
                      {tagObj?.name ?? tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-1 opacity-60 hover:opacity-100"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Refund */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div className="relative">
              <input
                id="txn-refund"
                type="checkbox"
                className="sr-only"
                checked={form.refund}
                onChange={(e) => set('refund', e.target.checked)}
              />
              <div
                className={`w-11 h-6 rounded-full transition-colors ${
                  form.refund ? 'bg-emerald-500' : 'bg-slate-600'
                }`}
              />
              <div
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  form.refund ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </div>
            <span className="text-sm text-slate-300">סימון כהחזר (Refund)</span>
          </label>
        </>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={isSaving} className="btn-primary flex-1">
          {isSaving ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner /> שומר...
            </span>
          ) : editingTransaction ? (
            'עדכן פעולה'
          ) : (
            'הוסף פעולה'
          )}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          ביטול
        </button>
      </div>
    </form>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface FormFieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
}

const FormField: React.FC<FormFieldProps> = ({ label, error, children }) => (
  <div>
    <label className="form-label">{label}</label>
    <div className="mt-1">{children}</div>
    {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
  </div>
);

const Spinner: React.FC = () => (
  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8v8z"
    />
  </svg>
);

// ─── CSS class helpers ────────────────────────────────────────────────────────

function typePillActive(type: string): string {
  if (type === 'Expense') return 'type-pill--expense';
  if (type === 'Income') return 'type-pill--income';
  return 'type-pill--transfer';
}
