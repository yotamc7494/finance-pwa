import { db, getPendingTransactions } from '../../../db/db';
import type {
  Transaction,
  Account,
  Category,
  Tag,
  TransactionType,
} from '../types/transaction.types';

export const GAS_URL =
  'https://script.google.com/macros/s/AKfycbxAdJ1dMpYAXATyko3CeagaXld7EED5oM8Qx8KChgu3aAj24VuJiIvWIXPwMFtZa4mx/exec';

// ─────────────────────────────────────────────────────────────────────────────
// Date Formatter: ISO / Date → DD/MM/YYYY (Asia/Jerusalem timezone aware)
// ─────────────────────────────────────────────────────────────────────────────

export function parseGasDate(dateVal: unknown): string {
  if (!dateVal) {
    const now = new Date();
    return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  }

  if (typeof dateVal === 'string') {
    const ddmmyyyy = dateVal.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyy) {
      return `${ddmmyyyy[1].padStart(2, '0')}/${ddmmyyyy[2].padStart(2, '0')}/${ddmmyyyy[3]}`;
    }
  }

  const d = new Date(dateVal as string | number);
  if (!isNaN(d.getTime())) {
    try {
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jerusalem',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      return formatter.format(d);
    } catch {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
  }

  return String(dateVal);
}

// ─────────────────────────────────────────────────────────────────────────────
// Push pending local transactions → GAS (POST)
// ─────────────────────────────────────────────────────────────────────────────

async function pushPendingTransactions(): Promise<number> {
  const pending = await getPendingTransactions();
  if (pending.length === 0) return 0;

  try {
    // When sending to Google Apps Script from a browser,
    // Content-Type: text/plain avoids CORS preflight OPTIONS request
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ transactions: pending }),
    });

    if (response.ok) {
      const text = await response.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        // Not JSON
      }

      if (json && (json.status === 'success' || json.status === 'ok' || json.result === 'success')) {
        await db.transactions.bulkUpdate(
          pending.map((t) => ({ key: t.id, changes: { synced: 1 as const } }))
        );
        console.info(`[SyncService] Pushed ${pending.length} transaction(s) to GAS.`);
        return pending.length;
      }
    }
    console.warn('[SyncService] GAS POST did not return success status. Pending transactions retained locally.');
    return 0;
  } catch (err) {
    console.warn('[SyncService] Could not push pending transactions to GAS (doPost might not be set up yet):', err);
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pull latest transactions, categories, accounts, and tags from GAS (GET)
// ─────────────────────────────────────────────────────────────────────────────

async function pullLatestTransactions(): Promise<number> {
  const [mainRes, accountsRes, tagsRes] = await Promise.allSettled([
    fetch(GAS_URL).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
      return r.json();
    }),
    fetch(`${GAS_URL}?sheet=Accounts`).then((r) => (r.ok ? r.json() : null)),
    fetch(`${GAS_URL}?sheet=Tags`).then((r) => (r.ok ? r.json() : null)),
  ]);

  if (mainRes.status !== 'fulfilled') {
    throw new Error(`GAS GET failed: ${mainRes.reason}`);
  }

  const mainJson = mainRes.value;

  // 1. Sync Categories
  const rawCategories = mainJson.Categories || mainJson.categories;
  if (Array.isArray(rawCategories) && rawCategories.length > 0) {
    const categories: Category[] = rawCategories.map((c: any) => ({
      id: String(c.ID),
      name: c.Categorie || c.Name || c.name || '',
      type: ((c['Categorie Type'] || c.type) === 'Income' ? 'Income' : 'Expense') as 'Expense' | 'Income',
      budgetLimit: Number(c['Monthly Budget']) || 0,
      spentThisMonth: Number(c['Final Amount']) || 0,
    }));
    await db.categories.bulkPut(categories);
    console.info(`[SyncService] Pulled ${categories.length} category/ies from GAS.`);
  }

  // 2. Sync Accounts
  if (accountsRes.status === 'fulfilled' && Array.isArray(accountsRes.value) && accountsRes.value.length > 0) {
    const accounts: Account[] = accountsRes.value.map((a: any) => ({
      id: String(a.ID),
      name: a.Owner ? `${a.Name} (${a.Owner})` : (a.Name || ''),
      currency: a['Account Currency'] || a.Currency || 'ILS',
      active: a.Status === 'Active',
      type: a.Type,
      owner: a.Owner,
    }));
    await db.accounts.bulkPut(accounts);
    console.info(`[SyncService] Pulled ${accounts.length} account(s) from GAS.`);
  }

  // 3. Sync Tags
  if (tagsRes.status === 'fulfilled' && Array.isArray(tagsRes.value) && tagsRes.value.length > 0) {
    const tags: Tag[] = tagsRes.value.map((t: any) => ({
      id: String(t.ID),
      name: t.Name || '',
    }));
    await db.tags.bulkPut(tags);
    console.info(`[SyncService] Pulled ${tags.length} tag(s) from GAS.`);
  }

  // 4. Sync Transactions
  const rawTxns = Array.isArray(mainJson)
    ? mainJson
    : (mainJson.Transactions || mainJson.transactions || mainJson.data || []);

  if (!Array.isArray(rawTxns)) {
    throw new Error('GAS GET did not return a valid transactions list');
  }

  const incoming: Transaction[] = rawTxns.map((t: any) => {
    const id = String(t.ID || t.id || Math.random().toString(36).slice(2));
    const date = parseGasDate(t.Date || t.date);
    const rawType = t.Type || t.type;
    const type: TransactionType =
      rawType === 'Income' || rawType === 'Transfer' ? rawType : 'Expense';
    const label = String(t.Lable ?? t.Label ?? t.label ?? '');
    const categoryId = t.Catrgory_ID ? String(t.Catrgory_ID) : (t.categoryId ? String(t.categoryId) : null);
    const accountId = String(t.Account_ID || t.accountId || '');
    const toAccountId = t['To Account ID'] ? String(t['To Account ID']) : (t.toAccountId ? String(t.toAccountId) : null);
    const currency = String(t.Currency || t.currency || 'ILS');
    const amount = Math.abs(Number(t.Amount || t.amount || 0));
    const converted = t['Converted To Account']
      ? Number(t['Converted To Account'])
      : (t.convertedToAccountAmount ? Number(t.convertedToAccountAmount) : null);

    let tags: string[] = [];
    const rawTags = t.Tags ?? t.tags;
    if (Array.isArray(rawTags)) {
      tags = rawTags.map(String);
    } else if (typeof rawTags === 'string' && rawTags.trim()) {
      tags = rawTags.split(',').map((s) => s.trim()).filter(Boolean);
    }

    const refund = Boolean(t.Refund || t.refund);

    return {
      id,
      syncId: id,
      date,
      type,
      label,
      categoryId,
      accountId,
      toAccountId,
      currency,
      amount,
      convertedToAccountAmount: converted,
      tags,
      refund,
      synced: 1 as const,
    };
  });

  if (incoming.length > 0) {
    await db.transactions.bulkPut(incoming);
  }

  console.info(`[SyncService] Pulled ${incoming.length} transaction(s) from GAS.`);
  return incoming.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public sync entry-point
// ─────────────────────────────────────────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'offline';

export interface SyncResult {
  status: SyncStatus;
  message: string;
  timestamp: Date;
  count?: number;
}

export async function syncTransactionsWithGAS(): Promise<SyncResult> {
  if (!navigator.onLine) {
    return {
      status: 'offline',
      message: 'אתה במצב לא מקוון. השינויים נשמרים מקומית ויסונכרנו בעת חיבור לרשת.',
      timestamp: new Date(),
    };
  }

  try {
    await pushPendingTransactions();
    const count = await pullLatestTransactions();
    return {
      status: 'success',
      message: `סונכרנו בהצלחה ${count.toLocaleString('he-IL')} עסקאות מ-Google Sheets!`,
      timestamp: new Date(),
      count,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[SyncService] Sync failed:', message);
    return {
      status: 'error',
      message: `סנכרון נכשל: ${message}`,
      timestamp: new Date(),
    };
  }
}

// ─── Auto-sync on network restoration ────────────────────────────────────────

export function registerOnlineSyncListener(onSyncComplete?: (result: SyncResult) => void): () => void {
  const handler = async () => {
    const result = await syncTransactionsWithGAS();
    onSyncComplete?.(result);
  };

  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}
