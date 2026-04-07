const { google } = require("googleapis");
const { auth } = require("../../config");
const { buildAcnQueries } = require("../../Model/DwQueries");

const sheetsApi = google.sheets({ version: "v4", auth });
const driveApi = google.drive({ version: "v3", auth });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- BRANCH METADATA MAP ---
const BRANCH_META = {
  DW: { prefix: "SGR_ACN_DW", label: "Distribution Warehouse" }
};

const MONTH_LABELS = [
  ["JAN", "January"],
  ["FEB", "February"],
  ["MAR", "March"],
  ["APR", "April"],
  ["MAY", "May"],
  ["JUN", "June"],
  ["JUL", "July"],
  ["AUG", "August"],
  ["SEP", "September"],
  ["OCT", "October"],
  ["NOV", "November"],
  ["DEC", "December"],
];

// --- HELPER: FIND SPREADSHEET BY CURRENT MONTH NAME ---
async function getSpreadsheetIdForCurrentMonth(folderId, branchCode) {
  const meta = BRANCH_META[branchCode] || BRANCH_META["DW"];

  const now = new Date();

  // Target LAST month (mirrors config.js buildLastMonthRange logic)
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1; // 0-indexed for MONTH_LABELS
  const [shortMon, longMon] = MONTH_LABELS[month];

  const currentFileName = `BCVR [${meta.prefix}_${shortMon}_${year}] BCVR ${meta.label} | ${longMon} ${year} - Accounting`;
  console.log(
    `🔎 [ACN] Searching Drive folder for: "${currentFileName}" (Branch: ${branchCode})`,
  );

  try {
    const response = await driveApi.files.list({
      q: `'${folderId}' in parents and name contains '${currentFileName}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
      fields: "files(id, name)",
    });

    if (response.data.files.length === 0) {
      console.error(
        `❌ No spreadsheet found matching "${currentFileName}" in folder.`,
      );
      return null;
    }

    const file = response.data.files[0];
    console.log(`📂 Found active file: ${file.name} (ID: ${file.id})`);
    return file.id;
  } catch (err) {
    console.error("❌ Drive Search Error:", err.message);
    return null;
  }
}

// --- FORMATTING HELPERS ---
const PESO_KEYS =
  /price|total|value|sold|amount|cost|capital|peso|cashout|sop|expense|check.amount|request.amount|released.amount|net|remittance|deposit(?!.no|.type|.status|.date)/i;
const DATE_KEYS = /date/i;

function formatCell(key, val) {
  if (val === null || val === undefined || val === "") return val;
  if (DATE_KEYS.test(key) && (val instanceof Date || !isNaN(Date.parse(val)))) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${mm}/${dd}/${yyyy}`;
    }
  }
  if (PESO_KEYS.test(key)) {
    const num = parseFloat(String(val).replace(/,/g, ""));
    if (!isNaN(num))
      return `₱${num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return val;
}

function formatRow(rowObj) {
  return Object.entries(rowObj).map(([key, val]) => formatCell(key, val));
}

// --- SAFE HEADER EXTRACTOR ---
function getHeaders(result) {
  if (result.recordset.columns) {
    const keys = Object.keys(result.recordset.columns);
    if (keys.length > 0) return keys;
  }
  if (result.recordset.length > 0) {
    return Object.keys(result.recordset[0]);
  }
  return [];
}

function getHeadersFromRecordset(recordset) {
  if (recordset.columns) {
    const keys = Object.keys(recordset.columns);
    if (keys.length > 0) return keys;
  }
  if (recordset.length > 0) {
    return Object.keys(recordset[0]);
  }
  return [];
}

// --- SYNC FUNCTION ---
async function syncQueryToSheet(pool, spreadsheetId, query, sheetName) {
  try {
    const result = await pool.request().query(query);
    const START_ROW = 5;

    // ── Inv. Discrepancy: side-by-side (Negative → A5, Positive → J5) ────────
    if (sheetName === "Inv. Discrepancy") {
      const sets = result.recordsets;

      await sheetsApi.spreadsheets.values.batchClear({
        spreadsheetId,
        requestBody: {
          ranges: [
            `'${sheetName}'!A${START_ROW}:H1000`,
            `'${sheetName}'!J${START_ROW}:Q1000`,
          ],
        },
      });

      const batchData = [];

      const negHeaders = getHeadersFromRecordset(sets[0]);
      const negRows = (sets[0] ?? []).map((r) => formatRow(r));
      if (negHeaders.length > 0) {
        batchData.push({
          range: `'${sheetName}'!A${START_ROW}`,
          values: [negHeaders, ...negRows],
        });
      }

      const posHeaders = getHeadersFromRecordset(sets[1]);
      const posRows = (sets[1] ?? []).map((r) => formatRow(r));
      if (posHeaders.length > 0) {
        batchData.push({
          range: `'${sheetName}'!J${START_ROW}`,
          values: [posHeaders, ...posRows],
        });
      }

      if (batchData.length > 0) {
        await sheetsApi.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: { data: batchData, valueInputOption: "USER_ENTERED" },
        });
      }
      console.log(
        `✅ [${sheetName}] Neg: ${negRows.length}, Pos: ${posRows.length} row(s) — headers always at Row ${START_ROW}.`,
      );
      return;
    }

    // ── Remittance: two stacked tables, each with its own header ─────────────
    if (sheetName === "Remittance") {
      const sets = result.recordsets;

      await sheetsApi.spreadsheets.values.clear({
        spreadsheetId,
        range: `'${sheetName}'!A${START_ROW}:Z1000`,
      });

      const batchData = [];
      let nextRow = START_ROW;

      const t1Headers = getHeadersFromRecordset(sets[0]);
      const t1Rows = (sets[0] ?? []).map((r) => formatRow(r));
      if (t1Headers.length > 0) {
        batchData.push({
          range: `'${sheetName}'!A${nextRow}`,
          values: [t1Headers, ...t1Rows],
        });
        nextRow += 1 + t1Rows.length + 2;
      }

      const t2Headers = getHeadersFromRecordset(sets[1]);
      const t2Rows = (sets[1] ?? []).map((r) => formatRow(r));
      if (t2Headers.length > 0) {
        batchData.push({
          range: `'${sheetName}'!A${nextRow}`,
          values: [t2Headers, ...t2Rows],
        });
      }

      if (batchData.length > 0) {
        await sheetsApi.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: { data: batchData, valueInputOption: "USER_ENTERED" },
        });
      }
      console.log(
        `✅ [${sheetName}] T1: ${t1Rows.length}, T2: ${t2Rows.length} row(s) — headers always written.`,
      );
      return;
    }

    // ── All other sheets: header at A5, data from A6 ─────────────────────────
    const rows = result.recordset;

    await sheetsApi.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${sheetName}'!A${START_ROW}:Z1000`,
    });

    const headers = getHeaders(result);

    if (rows && rows.length > 0) {
      await sheetsApi.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sheetName}'!A${START_ROW}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [headers, ...rows.map((r) => formatRow(r))] },
      });
      console.log(
        `✅ [${sheetName}] Synced ${rows.length} row(s) + header at Row ${START_ROW}.`,
      );
    } else {
      if (headers.length > 0) {
        await sheetsApi.spreadsheets.values.update({
          spreadsheetId,
          range: `'${sheetName}'!A${START_ROW}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [headers] },
        });
      }
      console.warn(
        `⚠️  [${sheetName}] No records — header only written at Row ${START_ROW}.`,
      );
    }
  } catch (err) {
    console.error(`❌ [${sheetName}] Error:`, err.message);
  }
}

// --- MAIN EXPORT ---
exports.run = async (pool, folderId, branchCode, dbName) => {
  console.log(`\n📊 [ACN] Sync started at ${new Date().toLocaleString()}`);

  const queries = buildAcnQueries(dbName);
  const currentSpreadsheetId = await getSpreadsheetIdForCurrentMonth(
    folderId,
    branchCode,
  );

  if (!currentSpreadsheetId) {
    console.log("[ACN] ⚠️  Sync aborted: could not find target spreadsheet.");
    return;
  }

  const tabNames = Object.keys(queries);
  console.log(`📋 [ACN] Processing ${tabNames.length} tab(s)...`);

  for (let i = 0; i < tabNames.length; i++) {
    const tabName = tabNames[i];
    console.log(
      `   ⏳ [ACN] [${i + 1}/${tabNames.length}] Syncing: "${tabName}"...`,
    );
    await syncQueryToSheet(
      pool,
      currentSpreadsheetId,
      queries[tabName],
      tabName,
    );
    await sleep(3000);
  }

  console.log("✨ [ACN] All tabs synced successfully.");
};