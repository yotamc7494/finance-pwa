import {
  db,
  getPendingTransactions,
  getPendingAccounts,
  getPendingCategories,
} from '../../../db/db';
import type {
  Transaction,
  Account,
  Category,
  Tag,
  TransactionType,
  AccountType,
  AccountOwner,
  AccountStatus,
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
// Push pending local deletions → GAS (POST by ID)
// ─────────────────────────────────────────────────────────────────────────────

async function pushPendingDeletions(): Promise<number> {
  const pendingDeletions = await db.pendingDeletions.toArray();
  if (pendingDeletions.length === 0) return 0;

  // Group by table
  const byTable = new Map<string, string[]>();
  for (const del of pendingDeletions) {
    const tbl = del.table || 'Transactions';
    const list = byTable.get(tbl) || [];
    list.push(del.id);
    byTable.set(tbl, list);
  }

  let totalDeleted = 0;

  for (const [table, ids] of byTable.entries()) {
    try {
      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'delete',
          table,
          ids,
        }),
      });

      if (response.ok) {
        const text = await response.text();
        let json: any = null;
        try {
          json = JSON.parse(text);
        } catch {
          // not json
        }

        // Even if some rows were already deleted on the sheet, we treat as success
        // because the objective (row is deleted) is fulfilled!
        if (json && (json.status === 'success' || json.status === 'ok')) {
          await db.pendingDeletions.bulkDelete(ids);
          totalDeleted += ids.length;
          console.info(`[SyncService] Successfully processed ${ids.length} deletion(s) for ${table} in GAS.`);
        }
      }
    } catch (err) {
      console.warn(`[SyncService] Could not push deletions for ${table} to GAS:`, err);
    }
  }

  return totalDeleted;
}

// ─────────────────────────────────────────────────────────────────────────────
// Push pending local changes (Upserts by ID) → GAS (POST)
// ─────────────────────────────────────────────────────────────────────────────

async function pushPendingUpserts(): Promise<{ transactions: number; accounts: number; categories: number }> {
  const pendingTx = await getPendingTransactions();
  const pendingAcc = await getPendingAccounts();
  const pendingCat = await getPendingCategories();

  let txPushed = 0;
  let accPushed = 0;
  let catPushed = 0;

  // 1. Transactions
  if (pendingTx.length > 0) {
    try {
      // Format items with exact AppSheet / Sheets column names
      const items = pendingTx.map((t) => ({
        ID: t.id,
        Date: t.date,
        Lable: t.label,
        Catrgory_ID: t.categoryId || '',
        Currency: t.currency || 'ILS',
        Amount: t.amount,
        Account_ID: t.accountId,
        Type: t.type,
        'To Account ID': t.toAccountId || '',
        Tags: Array.isArray(t.tags) ? t.tags.join(', ') : '',
        Refund: t.refund ? 'Refund' : '',
        'Converted To Account': t.convertedToAccountAmount != null ? t.convertedToAccountAmount : '',
      }));

      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'upsert',
          table: 'Transactions',
          items,
          transactions: pendingTx, // legacy fallback
        }),
      });

      if (response.ok) {
        const text = await response.text();
        let json: any = null;
        try {
          json = JSON.parse(text);
        } catch {
          // not json
        }
        if (json && (json.status === 'success' || json.status === 'ok' || json.result === 'success')) {
          await db.transactions.bulkUpdate(
            pendingTx.map((t) => ({ key: t.id, changes: { synced: 1 as const } }))
          );
          txPushed = pendingTx.length;
          console.info(`[SyncService] Pushed ${txPushed} transaction(s) to GAS.`);
        }
      }
    } catch (err) {
      console.warn('[SyncService] Could not push pending transactions to GAS:', err);
    }
  }

  // 2. Accounts
  if (pendingAcc.length > 0) {
    try {
      const items = pendingAcc.map((a) => ({
        ID: a.id,
        Name: a.name,
        Type: a.type,
        'Credit Limit': a.creditLimit || '',
        'Billing Day': a.billingDay || '',
        Status: a.status || 'Active',
        Favorite: a.favorite,
        'Charge Account': a.chargeAccountId || '',
        'Account Currency': a.accountCurrency || 'ILS',
        Owner: a.owner,
      }));

      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'upsert',
          table: 'Accounts',
          items,
        }),
      });

      if (response.ok) {
        await db.accounts.bulkUpdate(
          pendingAcc.map((a) => ({ key: a.id, changes: { synced: 1 as const } }))
        );
        accPushed = pendingAcc.length;
        console.info(`[SyncService] Pushed ${accPushed} account(s) to GAS.`);
      }
    } catch (err) {
      console.warn('[SyncService] Could not push pending accounts to GAS:', err);
    }
  }

  // 3. Categories
  if (pendingCat.length > 0) {
    try {
      const items = pendingCat.map((c) => ({
        ID: c.id,
        Categorie: c.name,
        'Categorie Type': c.type,
        'Monthly Budget': c.monthlyBudget || 0,
        'Monthly Budget Currency': c.currency || 'ILS',
      }));

      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'upsert',
          table: 'Categories',
          items,
        }),
      });

      if (response.ok) {
        await db.categories.bulkUpdate(
          pendingCat.map((c) => ({ key: c.id, changes: { synced: 1 as const } }))
        );
        catPushed = pendingCat.length;
        console.info(`[SyncService] Pushed ${catPushed} category/ies to GAS.`);
      }
    } catch (err) {
      console.warn('[SyncService] Could not push pending categories to GAS:', err);
    }
  }

  return { transactions: txPushed, accounts: accPushed, categories: catPushed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pull latest data from GAS (GET) & Reconcile strictly by ID
// ─────────────────────────────────────────────────────────────────────────────

async function pullLatestData(): Promise<{ transactions: number; accounts: number; categories: number }> {
  const [mainRes, accountsRes, tagsRes, categoriesRes] = await Promise.allSettled([
    fetch(GAS_URL).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
      return r.json();
    }),
    fetch(`${GAS_URL}?sheet=Accounts`).then((r) => (r.ok ? r.json() : null)),
    fetch(`${GAS_URL}?sheet=Tags`).then((r) => (r.ok ? r.json() : null)),
    fetch(`${GAS_URL}?sheet=Categories`).then((r) => (r.ok ? r.json() : null)),
  ]);

  if (mainRes.status !== 'fulfilled') {
    throw new Error(`GAS GET failed: ${mainRes.reason}`);
  }

  const mainJson = mainRes.value;

  // 1. Sync Categories
  const rawCategories =
    (categoriesRes.status === 'fulfilled' && Array.isArray(categoriesRes.value) && categoriesRes.value.length > 0)
      ? categoriesRes.value
      : (mainJson.Categories || mainJson.categories || []);

  let catCount = 0;
  if (Array.isArray(rawCategories) && rawCategories.length > 0) {
    const pendingCatIds = new Set((await getPendingCategories()).map((c) => c.id));
    const pendingDelCatIds = new Set(
      (await db.pendingDeletions.where('table').equals('Categories').toArray()).map((d) => d.id)
    );

    const categories: Category[] = rawCategories
      .filter((c: any) => !pendingDelCatIds.has(String(c.ID)))
      .map((c: any) => {
        const id = String(c.ID);
        return {
          id,
          name: c.Categorie || c.Name || c.name || '',
          type: ((c['Categorie Type'] || c.type) === 'Income' ? 'Income' : 'Expense') as 'Expense' | 'Income',
          monthlyBudget: Number(c['Monthly Budget']) || 0,
          budgetLimit: Number(c['Monthly Budget']) || 0,
          spentThisMonth: Number(c['Final Amount']) || 0,
          currency: c['Monthly Budget Currency'] || 'ILS',
          exchange: Number(c.Exchange) || 1,
          finalAmount: Number(c['Final Amount']) || 0,
          icon: c.Icon || '',
          synced: 1 as const,
        };
      });

    // Update categories that don't have pending local edits
    for (const cat of categories) {
      if (!pendingCatIds.has(cat.id)) {
        await db.categories.put(cat);
      }
    }
    catCount = categories.length;
    console.info(`[SyncService] Reconciled ${categories.length} category/ies from GAS.`);
  }

  // 2. Sync Accounts
  let accCount = 0;
  const rawAccounts =
    accountsRes.status === 'fulfilled' && Array.isArray(accountsRes.value) && accountsRes.value.length > 0
      ? accountsRes.value
      : (mainJson.Accounts || mainJson.accounts || []);

  if (Array.isArray(rawAccounts) && rawAccounts.length > 0) {
    const pendingAccIds = new Set((await getPendingAccounts()).map((a) => a.id));
    const pendingDelAccIds = new Set(
      (await db.pendingDeletions.where('table').equals('Accounts').toArray()).map((d) => d.id)
    );

    const accounts: Account[] = rawAccounts
      .filter((a: any) => !pendingDelAccIds.has(String(a.ID)))
      .map((a: any) => {
        const id = String(a.ID);
        const rawType = a.Type || 'Bank';
        const type: AccountType =
          rawType === 'Credit Card' || rawType === 'Invesments' ? rawType : 'Bank';
        const rawOwner = a.Owner || 'משותף';
        const owner: AccountOwner =
          rawOwner === 'עופרי' || rawOwner === 'יותם' ? rawOwner : 'משותף';
        const status: AccountStatus = a.Status === 'Not Active' ? 'Not Active' : 'Active';
        const accountCurrency = a['Account Currency'] || a.Currency || 'ILS';

        return {
          id,
          name: a.Name || '',
          type,
          owner,
          accountCurrency,
          currency: accountCurrency,
          status,
          active: status === 'Active',
          favorite: Boolean(a.Favorite),
          creditLimit: a['Credit Limit'] !== '' && a['Credit Limit'] != null ? Number(a['Credit Limit']) : undefined,
          billingDay: a['Billing Day'] || undefined,
          chargeAccountId: a['Charge Account'] ? String(a['Charge Account']) : undefined,
          nextCreditBill: Number(a['Next Credit Bill']) || 0,
          investmentGainPercent: Number(a['Invesment Gain %']) || 0,
          investmentsGain: Number(a['Invesments Gain']) || 0,
          synced: 1 as const,
        };
      });

    for (const acc of accounts) {
      if (!pendingAccIds.has(acc.id)) {
        await db.accounts.put(acc);
      }
    }
    accCount = accounts.length;
    console.info(`[SyncService] Reconciled ${accounts.length} account(s) from GAS.`);
  }

  // 3. Sync Tags
  if (tagsRes.status === 'fulfilled' && Array.isArray(tagsRes.value) && tagsRes.value.length > 0) {
    const tags: Tag[] = tagsRes.value.map((t: any) => ({
      id: String(t.ID),
      name: t.Name || '',
    }));
    await db.tags.bulkPut(tags);
    console.info(`[SyncService] Reconciled ${tags.length} tag(s) from GAS.`);
  }

  // 4. Sync Transactions
  const rawTxns = Array.isArray(mainJson)
    ? mainJson
    : (mainJson.Transactions || mainJson.transactions || mainJson.data || []);

  if (!Array.isArray(rawTxns)) {
    throw new Error('GAS GET did not return a valid transactions list');
  }

  const pendingTxIds = new Set((await getPendingTransactions()).map((t) => t.id));
  const pendingTxDelIds = new Set(
    (await db.pendingDeletions.where('table').equals('Transactions').toArray()).map((d) => d.id)
  );

  const incoming: Transaction[] = rawTxns
    .filter((t: any) => !pendingTxDelIds.has(String(t.ID || t.id)))
    .map((t: any) => {
      const id = String(t.ID || t.id);
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
    // Only put incoming if there is NO pending local change for that ID
    const incomingToPut = incoming.filter((t) => !pendingTxIds.has(t.id));
    await db.transactions.bulkPut(incomingToPut);

    // Remove any locally synced transactions that no longer exist in GAS (remote deletions)
    // CRITICAL: If a transaction has synced === 0 (user edited it locally after remote deletion),
    // we KEEP it, so it will be recreated in GAS on next upsert!
    const incomingIds = new Set(incoming.map((t) => t.id));
    const localSynced = await db.transactions.where('synced').equals(1).toArray();
    const toRemove = localSynced.filter((t) => !incomingIds.has(t.id)).map((t) => t.id);
    if (toRemove.length > 0) {
      await db.transactions.bulkDelete(toRemove);
      console.info(`[SyncService] Removed ${toRemove.length} transaction(s) deleted remotely.`);
    }
  }

  console.info(`[SyncService] Pulled ${incoming.length} transaction(s) from GAS.`);
  return { transactions: incoming.length, accounts: accCount, categories: catCount };
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
      message: 'מצב לא מקוון. השינויים נשמרים מקומית לפי מזהה (ID) ויסונכרנו בעת חיבור.',
      timestamp: new Date(),
    };
  }

  try {
    const deletedCount = await pushPendingDeletions();
    const upsertStats = await pushPendingUpserts();
    const pullStats = await pullLatestData();

    const pendingTxStill = await getPendingTransactions();
    const pendingAccStill = await getPendingAccounts();
    const pendingCatStill = await getPendingCategories();
    const pendingDeletionsStill = await db.pendingDeletions.count();

    const totalPending =
      pendingTxStill.length + pendingAccStill.length + pendingCatStill.length + pendingDeletionsStill;

    if (totalPending > 0) {
      return {
        status: 'error',
        message: `סונכרנו נתונים, אך נותרו ${totalPending} שינויים מקומיים שממתינים לשמירה בענן (נא לוודא שקוד ה-Apps Script מעודכן).`,
        timestamp: new Date(),
        count: pullStats.transactions,
      };
    }

    const details: string[] = [];
    if (deletedCount > 0) details.push(`${deletedCount} מחיקות בוצעו`);
    if (upsertStats.transactions + upsertStats.accounts + upsertStats.categories > 0) {
      details.push(
        `${upsertStats.transactions + upsertStats.accounts + upsertStats.categories} פריטים נשמרו לפי ID`
      );
    }
    details.push(`${pullStats.transactions.toLocaleString('he-IL')} תנועות מעודכנות`);

    return {
      status: 'success',
      message: `סנכרון חכם הושלם בהצלחה! (${details.join(' · ')})`,
      timestamp: new Date(),
      count: pullStats.transactions,
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

