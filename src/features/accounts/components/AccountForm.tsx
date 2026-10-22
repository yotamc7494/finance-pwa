// src/features/accounts/components/AccountForm.tsx
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, generateUniqueId } from '../../../db/db';
import type {
  Account,
  AccountType,
  AccountOwner,
  AccountStatus,
} from '../../transactions/types/transaction.types';

interface AccountFormProps {
  editingAccount?: Account | null;
  onSaved: () => void;
  onCancel: () => void;
}

const ACCOUNT_TYPES: { type: AccountType; label: string; icon: string }[] = [
  { type: 'Bank', label: 'בנק ועו״ש', icon: '🏦' },
  { type: 'Credit Card', label: 'כרטיס אשראי', icon: '💳' },
  { type: 'Invesments', label: 'השקעות', icon: '📈' },
];

const OWNERS: { owner: AccountOwner; label: string; colorClass: string; bgClass: string; activeClass: string }[] = [
  {
    owner: 'יותם',
    label: 'יותם',
    colorClass: 'text-[#1581BF]',
    bgClass: 'hover:bg-[#1581BF]/20 border-white/10 text-slate-300',
    activeClass: 'bg-[#1581BF]/20 text-[#1581BF] border-[#1581BF]/40 ring-1 ring-[#1581BF]',
  },
  {
    owner: 'עופרי',
    label: 'עופרי',
    colorClass: 'text-[#F6B1CE]',
    bgClass: 'hover:bg-[#F6B1CE]/20 border-white/10 text-slate-300',
    activeClass: 'bg-[#F6B1CE]/20 text-[#F6B1CE] border-[#F6B1CE]/40 ring-1 ring-[#F6B1CE]',
  },
  {
    owner: 'משותף',
    label: 'משותף',
    colorClass: 'text-violet-400',
    bgClass: 'hover:bg-violet-500/20 border-white/10 text-slate-300',
    activeClass: 'bg-violet-500/20 text-violet-400 border-violet-500/40 ring-1 ring-violet-500',
  },
];

const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP'];

export const AccountForm: React.FC<AccountFormProps> = ({
  editingAccount,
  onSaved,
  onCancel,
}) => {
  const isEdit = Boolean(editingAccount);

  const [name, setName] = useState(editingAccount?.name || '');
  const [type, setType] = useState<AccountType>(editingAccount?.type || 'Bank');
  const [owner, setOwner] = useState<AccountOwner>(editingAccount?.owner || 'משותף');
  const [accountCurrency, setAccountCurrency] = useState(editingAccount?.accountCurrency || 'ILS');
  const [status, setStatus] = useState<AccountStatus>(editingAccount?.status || 'Active');
  const [favorite, setFavorite] = useState(editingAccount?.favorite || false);

  // Credit card specific fields
  const [creditLimit, setCreditLimit] = useState<number | ''>(editingAccount?.creditLimit ?? '');
  const [billingDay, setBillingDay] = useState(editingAccount?.billingDay ? String(editingAccount.billingDay) : '10');
  const [chargeAccountId, setChargeAccountId] = useState(editingAccount?.chargeAccountId || '');

  // Investments specific fields
  const [investmentGainPercent, setInvestmentGainPercent] = useState<number | ''>(
    editingAccount?.investmentGainPercent ? editingAccount.investmentGainPercent * 100 : ''
  );
  const [investmentsGain, setInvestmentsGain] = useState<number | ''>(
    editingAccount?.investmentsGain ?? ''
  );
  const [cagr, setCagr] = useState<number | ''>(
    editingAccount?.cagr ? editingAccount.cagr * 100 : ''
  );

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available bank accounts for chargeAccount dropdown
  const bankAccounts = useLiveQuery(
    () => db.accounts.filter((a) => a.type === 'Bank' && a.status === 'Active').toArray(),
    []
  ) ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('נא להזין שם חשבון');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const accountId = editingAccount?.id || generateUniqueId();
      const accountData: Account = {
        id: accountId,
        name: name.trim(),
        type,
        owner,
        accountCurrency,
        currency: accountCurrency,
        status,
        active: status === 'Active',
        favorite,
        creditLimit: type === 'Credit Card' && creditLimit !== '' ? Number(creditLimit) : undefined,
        billingDay: type === 'Credit Card' ? billingDay : undefined,
        chargeAccountId: type === 'Credit Card' ? chargeAccountId || undefined : undefined,
        investmentGainPercent:
          type === 'Invesments' && investmentGainPercent !== ''
            ? Number(investmentGainPercent) / 100
            : editingAccount?.investmentGainPercent,
        investmentsGain:
          type === 'Invesments' && investmentsGain !== ''
            ? Number(investmentsGain)
            : editingAccount?.investmentsGain,
        cagr:
          type === 'Invesments' && cagr !== ''
            ? Number(cagr) / 100
            : editingAccount?.cagr,
        synced: 0,
      };

      await db.accounts.put(accountData);
      onSaved();
    } catch (err: any) {
      console.error('Failed to save account:', err);
      setError(err?.message || 'שגיאה בשמירת החשבון');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      dir="rtl"
    >
      <div className="glass-panel w-full max-w-lg rounded-2xl border border-white/10 p-6 max-h-[90vh] overflow-y-auto space-y-6 animate-slide-up shadow-2xl shadow-violet-950/40">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span>{isEdit ? '✏️ עריכת חשבון' : '➕ חשבון חדש'}</span>
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
          {/* Account Name */}
          <div>
            <label className="form-label mb-1.5">שם החשבון *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="לדוגמה: עו״ש פועלים, אשראי מקס, אינטראקטיב..."
              className="form-input"
              required
              autoFocus
            />
          </div>

          {/* Account Type */}
          <div>
            <label className="form-label mb-2">סוג חשבון</label>
            <div className="grid grid-cols-3 gap-2">
              {ACCOUNT_TYPES.map(({ type: t, label, icon }) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`py-2.5 px-3 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                    type === t
                      ? 'bg-violet-600/30 border-violet-500 text-violet-300 ring-1 ring-violet-500 shadow-md shadow-violet-600/20'
                      : 'bg-slate-800/60 border-white/10 text-slate-400 hover:bg-slate-700/60'
                  }`}
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Owner */}
          <div>
            <label className="form-label mb-2">בעל חשבון</label>
            <div className="grid grid-cols-3 gap-2">
              {OWNERS.map(({ owner: o, label, bgClass, activeClass }) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOwner(o)}
                  className={`py-2 px-3 rounded-xl border text-sm font-bold transition-all ${
                    owner === o ? activeClass : bgClass
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Currency & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label mb-1.5">מטבע חשבון</label>
              <select
                value={accountCurrency}
                onChange={(e) => setAccountCurrency(e.target.value)}
                className="form-input"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c} {c === 'ILS' ? '(₪)' : c === 'USD' ? '($)' : c === 'EUR' ? '(€)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label mb-1.5">סטטוס פעילות</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AccountStatus)}
                className="form-input"
              >
                <option value="Active">פעיל</option>
                <option value="Not Active">לא פעיל</option>
              </select>
            </div>
          </div>

          {/* Favorite Switch */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-xl">{favorite ? '⭐' : '☆'}</span>
              <div>
                <div className="text-sm font-semibold text-slate-200">הצג במועדפים בלוח הבקרה</div>
                <div className="text-xs text-slate-400">גישה מהירה במסך הבית ובדשבורד</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFavorite(!favorite)}
              className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                favorite ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  favorite ? '-translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* ── Conditional: Credit Card Fields ── */}
          {type === 'Credit Card' && (
            <div className="p-4 rounded-xl bg-violet-950/20 border border-violet-500/20 space-y-4">
              <h3 className="text-xs font-bold text-violet-300 uppercase tracking-wider flex items-center gap-1.5">
                <span>💳</span>
                <span>הגדרות כרטיס אשראי</span>
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label mb-1.5">מסגרת אשראי (₪)</label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="15000"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value === '' ? '' : Number(e.target.value))}
                    className="form-input"
                  />
                </div>

                <div>
                  <label className="form-label mb-1.5">יום חיוב בחודש</label>
                  <select
                    value={billingDay}
                    onChange={(e) => setBillingDay(e.target.value)}
                    className="form-input"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={String(d)}>
                        ב-{d} לחודש
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label mb-1.5">חשבון בנק לחיוב</label>
                <select
                  value={chargeAccountId}
                  onChange={(e) => setChargeAccountId(e.target.value)}
                  className="form-input"
                >
                  <option value="">-- בחר חשבון בנק מקור --</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.owner})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* ── Conditional: Investments Fields ── */}
          {type === 'Invesments' && (
            <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/20 space-y-4">
              <h3 className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                <span>📈</span>
                <span>נתוני השקעה ותשואות</span>
              </h3>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="form-label mb-1.5">תשואה כוללת (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="14.5"
                    value={investmentGainPercent}
                    onChange={(e) =>
                      setInvestmentGainPercent(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="form-input"
                  />
                </div>

                <div>
                  <label className="form-label mb-1.5">רווח נומינלי (₪)</label>
                  <input
                    type="number"
                    step="1"
                    placeholder="12500"
                    value={investmentsGain}
                    onChange={(e) =>
                      setInvestmentsGain(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="form-input"
                  />
                </div>

                <div>
                  <label className="form-label mb-1.5">CAGR (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="9.2"
                    value={cagr}
                    onChange={(e) => setCagr(e.target.value === '' ? '' : Number(e.target.value))}
                    className="form-input"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button type="button" onClick={onCancel} className="btn-secondary px-4 py-2">
              ביטול
            </button>
            <button type="submit" disabled={isSaving} className="btn-primary px-6 py-2">
              {isSaving ? 'שומר...' : isEdit ? 'שמור שינויים' : 'צור חשבון'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
