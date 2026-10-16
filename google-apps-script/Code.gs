/**
 * ============================================================================
 * Dual Finance Manager - Google Apps Script Backend (Code.gs)
 * ============================================================================
 * 
 * Supports Smart ID-based Synchronization:
 * 1. Identification: Every row is matched strictly by its unique "ID" in column 1.
 * 2. Safe Delete: If an ID is already deleted in the sheet, the operation is
 *    safely ignored (No-Op) to prevent deleting any random or shifted row.
 * 3. Smart Upsert: If an edited row was deleted in the cloud, it is automatically
 *    recreated (appended) with its ID and the new edited values.
 * 4. Multi-Table: Supports Transactions, Accounts, Categories, and more.
 */

// ─── GET: Fetch sheets as JSON ───────────────────────────────────────────────

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetParam = e && e.parameter && e.parameter.sheet;

    if (sheetParam) {
      var sheet = ss.getSheetByName(sheetParam);
      if (!sheet) {
        return createJsonResponse({ error: "Sheet not found: " + sheetParam }, 404);
      }
      var rows = getSheetDataAsObjects(sheet);
      return createJsonResponse(rows);
    }

    // Default: Return main datasets together
    var txSheet = ss.getSheetByName("Transactions");
    var catSheet = ss.getSheetByName("Categories");
    var accSheet = ss.getSheetByName("Accounts");
    var tagSheet = ss.getSheetByName("Tags");

    var response = {
      Transactions: txSheet ? getSheetDataAsObjects(txSheet) : [],
      Categories: catSheet ? getSheetDataAsObjects(catSheet) : [],
      Accounts: accSheet ? getSheetDataAsObjects(accSheet) : [],
      Tags: tagSheet ? getSheetDataAsObjects(tagSheet) : [],
      status: "success"
    };

    return createJsonResponse(response);
  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() }, 500);
  }
}

// ─── POST: Smart ID-based Upsert & Delete ─────────────────────────────────────

function doPost(e) {
  var lock = LockService.getScriptLock();
  // Prevent concurrency race conditions (wait up to 30 seconds)
  var hasLock = lock.tryLock(30000);
  if (!hasLock) {
    return createJsonResponse({
      status: "error",
      message: "Could not obtain lock. Server busy, please retry."
    }, 429);
  }

  try {
    var rawText = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    var data = JSON.parse(rawText);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    var results = {
      status: "success",
      deleted: 0,
      added: 0,
      updated: 0,
      ignored: 0
    };

    // ── Handle Action: Delete by ID ──
    if (data.action === "delete" || (data.ids && data.ids.length > 0)) {
      var tableName = data.table || "Transactions";
      var deleteIds = data.ids || (data.id ? [data.id] : []);
      var sheet = ss.getSheetByName(tableName);

      if (sheet && deleteIds.length > 0) {
        var idIndexMap = buildIdRowIndexMap(sheet);
        var rowsToDelete = [];

        for (var i = 0; i < deleteIds.length; i++) {
          var idStr = String(deleteIds[i]).trim();
          if (idIndexMap.hasOwnProperty(idStr)) {
            rowsToDelete.push(idIndexMap[idStr]);
          } else {
            // ID already deleted or not found: Safe No-Op!
            results.ignored++;
          }
        }

        // Sort descending so deleting rows doesn't shift remaining target rows
        rowsToDelete.sort(function(a, b) { return b - a; });
        for (var d = 0; d < rowsToDelete.length; d++) {
          sheet.deleteRow(rowsToDelete[d]);
          results.deleted++;
        }
      }
    }

    // ── Handle Action: Upsert by ID ──
    var itemsToUpsert = data.items || data.transactions || (data.item ? [data.item] : null);
    if (itemsToUpsert && itemsToUpsert.length > 0) {
      var targetTable = data.table || "Transactions";
      var targetSheet = ss.getSheetByName(targetTable);

      if (targetSheet) {
        var upsertStats = upsertRowsById(targetSheet, itemsToUpsert);
        results.added += upsertStats.added;
        results.updated += upsertStats.updated;
      }
    }

    // ── Handle Multi-Table Batch Sync Payload ──
    if (data.action === "sync") {
      if (data.deletions && Array.isArray(data.deletions)) {
        for (var k = 0; k < data.deletions.length; k++) {
          var delItem = data.deletions[k];
          var delSheet = ss.getSheetByName(delItem.table || "Transactions");
          if (delSheet && delItem.id) {
            var delMap = buildIdRowIndexMap(delSheet);
            var delIdStr = String(delItem.id).trim();
            if (delMap.hasOwnProperty(delIdStr)) {
              delSheet.deleteRow(delMap[delIdStr]);
              results.deleted++;
            } else {
              results.ignored++;
            }
          }
        }
      }

      if (data.upserts && typeof data.upserts === "object") {
        for (var tbl in data.upserts) {
          var upsertSheet = ss.getSheetByName(tbl);
          var tblItems = data.upserts[tbl];
          if (upsertSheet && Array.isArray(tblItems) && tblItems.length > 0) {
            var res = upsertRowsById(upsertSheet, tblItems);
            results.added += res.added;
            results.updated += res.updated;
          }
        }
      }
    }

    results.message = "Sync processed successfully by ID.";
    return createJsonResponse(results);

  } catch (err) {
    return createJsonResponse({
      status: "error",
      message: err.toString()
    }, 500);
  } finally {
    lock.releaseLock();
  }
}

// ─── Helper: Build Map of ID -> RowNumber (1-based index) ────────────────────

function buildIdRowIndexMap(sheet) {
  var map = {};
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return map;

  // Assuming ID is in Column 1 (A)
  var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var r = 0; r < values.length; r++) {
    var rawId = values[r][0];
    if (rawId !== "" && rawId !== null && rawId !== undefined) {
      map[String(rawId).trim()] = r + 2; // 1-based row index in spreadsheet
    }
  }
  return map;
}

// ─── Helper: Upsert rows strictly by ID ──────────────────────────────────────

function upsertRowsById(sheet, items) {
  var stats = { added: 0, updated: 0 };
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastCol < 1) return stats;

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var idColIndex = 0; // Column 1 default
  for (var c = 0; c < headers.length; c++) {
    if (String(headers[c]).trim().toUpperCase() === "ID") {
      idColIndex = c;
      break;
    }
  }

  var idRowMap = {};
  if (lastRow >= 2) {
    var idValues = sheet.getRange(2, idColIndex + 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < idValues.length; i++) {
      var idVal = idValues[i][0];
      if (idVal !== "" && idVal !== null && idVal !== undefined) {
        idRowMap[String(idVal).trim()] = i + 2;
      }
    }
  }

  for (var j = 0; j < items.length; j++) {
    var item = items[j];
    var itemId = String(item.ID || item.id || "").trim();
    if (!itemId) continue;

    var rowValues = [];
    for (var h = 0; h < headers.length; h++) {
      var headerName = String(headers[h]).trim();
      var val = getItemProperty(item, headerName);
      rowValues.push(val !== undefined ? val : "");
    }

    if (idRowMap.hasOwnProperty(itemId)) {
      // UPDATE existing row
      var existingRow = idRowMap[itemId];
      sheet.getRange(existingRow, 1, 1, rowValues.length).setValues([rowValues]);
      stats.updated++;
    } else {
      // INSERT new row (or recreate if deleted remotely)
      sheet.appendRow(rowValues);
      // Update local map so multiple edits to same item in single batch don't duplicate
      lastRow = sheet.getLastRow();
      idRowMap[itemId] = lastRow;
      stats.added++;
    }
  }

  return stats;
}

// ─── Helper: Property getter matching AppSheet / JS naming ──────────────────

function getItemProperty(item, header) {
  // Exact match
  if (item.hasOwnProperty(header)) return item[header];

  // Normalized matching (ignoring case and underscores)
  var normHeader = header.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (var key in item) {
    var normKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normHeader === normKey) {
      return item[key];
    }
  }

  // Common Aliases
  if (header === "Catrgory_ID") return item.categoryId || item.Catrgory_ID || "";
  if (header === "Account_ID") return item.accountId || item.Account_ID || "";
  if (header === "To Account ID") return item.toAccountId || item["To Account ID"] || "";
  if (header === "Lable") return item.label || item.Lable || item.Label || "";
  if (header === "Date") return item.date || item.Date || "";
  if (header === "Amount") return item.amount != null ? item.amount : "";
  if (header === "Converted To Account") return item.convertedToAccountAmount != null ? item.convertedToAccountAmount : "";
  if (header === "Refund") return item.refund ? "Refund" : (item.Refund || "");
  if (header === "Tags") return Array.isArray(item.tags) ? item.tags.join(", ") : (item.Tags || "");
  if (header === "Categorie") return item.name || item.Categorie || "";
  if (header === "Categorie Type") return item.type || item["Categorie Type"] || "";
  if (header === "Monthly Budget") return item.monthlyBudget != null ? item.monthlyBudget : (item["Monthly Budget"] || 0);
  if (header === "Account Currency") return item.accountCurrency || item.currency || item["Account Currency"] || "ILS";

  return "";
}

// ─── Helper: Get Sheet data as JSON Array ─────────────────────────────────────

function getSheetDataAsObjects(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0];
  var rows = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var obj = {};
    var hasContent = false;
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).trim();
      var cellVal = row[c];
      if (cellVal instanceof Date) {
        cellVal = cellVal.toISOString();
      }
      obj[h] = cellVal;
      if (cellVal !== "" && cellVal !== null && cellVal !== undefined) {
        hasContent = true;
      }
    }
    if (hasContent) {
      rows.push(obj);
    }
  }
  return rows;
}

// ─── Helper: JSON Response ───────────────────────────────────────────────────

function createJsonResponse(data, statusCode) {
  var output = ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}
