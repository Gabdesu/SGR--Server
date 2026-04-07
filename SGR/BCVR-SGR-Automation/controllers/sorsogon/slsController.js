const { google } = require('googleapis');
const { auth, DATE } = require('../../config');
const { slsQueries } = require('../../Model/SorsogonQueries');

const sheetsApi = google.sheets({ version: 'v4', auth });
const driveApi = google.drive({ version: 'v3', auth });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- BRANCH METADATA MAP ---
const BRANCH_META = {
    SBS: { prefix: 'SGR_SLS_SBS', label: 'Sorsogon Branch Store' }
};

const MONTH_LABELS = [
    ['JAN', 'January'],  ['FEB', 'February'], ['MAR', 'March'],
    ['APR', 'April'],    ['MAY', 'May'],       ['JUN', 'June'],
    ['JUL', 'July'],     ['AUG', 'August'],    ['SEP', 'September'],
    ['OCT', 'October'],  ['NOV', 'November'],  ['DEC', 'December'],
];

// --- HELPER: FIND SPREADSHEET BY CURRENT MONTH NAME ---
async function getSpreadsheetIdForCurrentMonth(folderId, branchCode) {
    const meta  = BRANCH_META[branchCode] || BRANCH_META['SBS'];
    const now = new Date()
        // Target LAST month (mirrors config.js buildLastMonthRange logic)
    const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1; // 0-indexed for MONTH_LABELS
    const [shortMon, longMon] = MONTH_LABELS[month];

    const currentFileName = `BCVR [${meta.prefix}_${shortMon}_${year}] BCVR ${meta.label} | ${longMon} ${year} - Sales`;
    console.log(`🔎 [SLS] Searching Drive folder for: "${currentFileName}" (Branch: ${branchCode})`);

    try {
        const response = await driveApi.files.list({
            q: `'${folderId}' in parents and name contains '${currentFileName}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
            fields: 'files(id, name)',
        });

        if (response.data.files.length === 0) {
            console.error(`❌ No spreadsheet found matching "${currentFileName}" in folder.`);
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
const PESO_KEYS = /price|total|value|sold|amount|cost|disc|orig|balance|consumption|collected|delivered|booking|peso/i;
const DATE_KEYS  = /date/i;

function formatCell(key, val) {
    if (val === null || val === undefined || val === '') return val;
    if (DATE_KEYS.test(key) && (val instanceof Date || !isNaN(Date.parse(val)))) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const yyyy = d.getFullYear();
            return `${mm}/${dd}/${yyyy}`;
        }
    }
    if (PESO_KEYS.test(key)) {
        const num = parseFloat(String(val).replace(/,/g, ''));
        if (!isNaN(num)) return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return val;
}

function formatRow(rowObj) {
    return Object.entries(rowObj).map(([key, val]) => formatCell(key, val));
}

// --- Extract headers from first row of recordset ---
function getHeaders(recordset) {
    if (!recordset || recordset.length === 0) return [];
    return Object.keys(recordset[0]);
}

// --- Extract headers from mssql column metadata (works even on 0-row results) ---
function getHeadersFromColumns(recordset) {
    return Object.keys(recordset?.columns || {});
}

async function syncQueryToSheet(pool, spreadsheetId, query, sheetName) {
    try {
        const request = pool.request();
        request.multiple = true;
        const result = await request.query(query);

        // ── TOP 30: side-by-side tables ──────────────────────────────────────────
        // Layout (all anchored at row 5):
        //   Row 5  → headers for each table
        //   Row 6+ → data rows
        //   Table 1 Booking   → B5:D   Table 2 Delivered → G5:I   Table 3 Collected → L5:N
        if (sheetName === 'Top 30') {
            const headerRow = 5;
            const sets = result.recordsets;

            if (!sets || sets.length === 0) {
                console.warn(`⚠️  [${sheetName}] No recordsets returned.`);
                return;
            }

            // Clear all 3 zones (header + data)
            await sheetsApi.spreadsheets.values.batchClear({
                spreadsheetId,
                requestBody: {
                    ranges: [
                        `'${sheetName}'!B${headerRow}:D200`,
                        `'${sheetName}'!G${headerRow}:I200`,
                        `'${sheetName}'!L${headerRow}:N200`,
                    ]
                }
            });

            const batchData = [];

            // Table 1 — Booking
            const t1Headers = sets[0]?.length
                ? getHeaders(sets[0])
                : getHeadersFromColumns(sets[0]);
            if (t1Headers.length) {
                const rows = (sets[0] || []).map(r => formatRow(r));
                batchData.push({ range: `'${sheetName}'!B${headerRow}`, values: [t1Headers, ...rows] });
                if (!rows.length) console.warn(`⚠️  [${sheetName}] Table 1 (Booking): 0 rows. Header written.`);
            }

            // Table 2 — Delivered
            const t2Headers = sets[1]?.length
                ? getHeaders(sets[1])
                : getHeadersFromColumns(sets[1]);
            if (t2Headers.length) {
                const rows = (sets[1] || []).map(r => formatRow(r));
                batchData.push({ range: `'${sheetName}'!G${headerRow}`, values: [t2Headers, ...rows] });
                if (!rows.length) console.warn(`⚠️  [${sheetName}] Table 2 (Delivered): 0 rows. Header written.`);
            }

            // Table 3 — Collected
            const t3Headers = sets[2]?.length
                ? getHeaders(sets[2])
                : getHeadersFromColumns(sets[2]);
            if (t3Headers.length) {
                const rows = (sets[2] || []).map(r => formatRow(r));
                batchData.push({ range: `'${sheetName}'!L${headerRow}`, values: [t3Headers, ...rows] });
                if (!rows.length) console.warn(`⚠️  [${sheetName}] Table 3 (Collected): 0 rows. Header written.`);
            }

            if (batchData.length > 0) {
                await sheetsApi.spreadsheets.values.batchUpdate({
                    spreadsheetId,
                    requestBody: { data: batchData, valueInputOption: 'RAW' }
                });
                console.log(`✅ [${sheetName}] Side-by-side sync complete (with headers at row ${headerRow}).`);
            }
            return;
        }

        // ── ALL OTHER SHEETS: headers at A5, data from A6 ────────────────────────
        const rows = result.recordset;

        // Clear from A5 downward
        await sheetsApi.spreadsheets.values.clear({
            spreadsheetId,
            range: `'${sheetName}'!A5:Z1000`,
        });

        // Derive headers: from rows if data exists, otherwise from mssql column metadata
        const headers = rows && rows.length > 0
            ? getHeaders(rows)
            : getHeadersFromColumns(rows);

        if (headers.length > 0) {
            const data = rows ? rows.map(r => formatRow(r)) : [];

            await sheetsApi.spreadsheets.values.update({
                spreadsheetId,
                range: `'${sheetName}'!A5`,
                valueInputOption: 'RAW',
                requestBody: { values: [headers, ...data] },
            });

            if (data.length > 0) {
                console.log(`✅ [${sheetName}] Synced ${data.length} row(s) + header at A5.`);
            } else {
                console.warn(`⚠️  [${sheetName}] Query returned 0 rows. Header written at A5.`);
            }
        } else {
            console.warn(`⚠️  [${sheetName}] Query returned 0 rows and no column metadata. Nothing written.`);
        }

    } catch (err) {
        console.error(`❌ [${sheetName}] Error:`, err.message);
    }
}

// --- MAIN EXPORT ---
exports.run = async (pool, folderId, branchCode) => {
    console.log(`\n💰 [SLS] Sync started at ${new Date().toLocaleString()}`);

    const currentSpreadsheetId = await getSpreadsheetIdForCurrentMonth(folderId, branchCode);

    if (!currentSpreadsheetId) {
        console.log('[SLS] ⚠️  Sync aborted: could not find target spreadsheet.');
        return;
    }

    const tabNames = Object.keys(slsQueries);
    console.log(`📋 [SLS] Processing ${tabNames.length} tab(s)...`);

    for (let i = 0; i < tabNames.length; i++) {
        const tabName = tabNames[i];
        console.log(`   ⏳ [SLS] [${i+1}/${tabNames.length}] Syncing: "${tabName}"...`);
        await syncQueryToSheet(pool, currentSpreadsheetId, slsQueries[tabName], tabName);
        await sleep(3000);
    }

    console.log('✨ [SLS] All tabs synced successfully.');
};