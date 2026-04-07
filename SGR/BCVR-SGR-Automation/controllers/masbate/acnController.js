const { google } = require('googleapis');
const { auth, DATE } = require('../../config');
const { buildAcnQueries } = require('../../Model/MasbateQueries');

const sheetsApi = google.sheets({ version: 'v4', auth });
const driveApi = google.drive({ version: 'v3', auth });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- BRANCH METADATA MAP ---
const BRANCH_META = {
    MBS: { prefix: 'SGR_ACN_MBS', label: 'Masbate Branch Store' }
};

const MONTH_LABELS = [
    ['JAN', 'January'],  ['FEB', 'February'], ['MAR', 'March'],
    ['APR', 'April'],    ['MAY', 'May'],       ['JUN', 'June'],
    ['JUL', 'July'],     ['AUG', 'August'],    ['SEP', 'September'],
    ['OCT', 'October'],  ['NOV', 'November'],  ['DEC', 'December'],
];

// --- HELPER: FIND SPREADSHEET BY CURRENT MONTH NAME ---
async function getSpreadsheetIdForCurrentMonth(folderId, branchCode) {
    const meta  = BRANCH_META[branchCode] || BRANCH_META['MBS'];
    const now = new Date()
        // Target LAST month (mirrors config.js buildLastMonthRange logic)
    const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1; // 0-indexed for MONTH_LABELS
    const [shortMon, longMon] = MONTH_LABELS[month];

    const currentFileName = `BCVR [${meta.prefix}_${shortMon}_${year}] BCVR ${meta.label} | ${longMon} ${year} - Accounting`;
    console.log(`🔎 [ACN] Searching Drive folder for: "${currentFileName}" (Branch: ${branchCode})`);

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
const PESO_KEYS = /price|total|value|sold|amount|cost|disc|orig|balance|consumption|collected|delivered|peso|cashout|commitment|rebate|tax|expense|capital/i;
const DATE_KEYS = /date/i;

function formatCell(key, val) {
    if (val === null || val === undefined || val === '') return val;
    if (DATE_KEYS.test(key)) {
        const d = (val instanceof Date) ? val : new Date(val);
        if (!isNaN(d.getTime())) {
            const mm   = String(d.getMonth() + 1).padStart(2, '0');
            const dd   = String(d.getDate()).padStart(2, '0');
            const yyyy = d.getFullYear();
            return `${mm}/${dd}/${yyyy}`;
        }
    }
    if (PESO_KEYS.test(key)) {
        const num = parseFloat(String(val).replace(/,/g, ''));
        if (!isNaN(num)) {
            return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
    }
    return val;
}

function formatRow(rowObj) {
    return Object.entries(rowObj).map(([key, val]) => formatCell(key, val));
}

// --- Extract headers from first row of a recordset ---
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
        const result = await pool.request().query(query);

        // ── SPECIAL CASE: CSR/OE/RS (three stacked sections at fixed row anchors) ──
        // Section 1 → A5   Section 2 → A13   Section 3 → A20
        if (sheetName === 'CSR/OE/RS') {
            const sets = result.recordsets;

            await sheetsApi.spreadsheets.values.batchClear({
                spreadsheetId,
                requestBody: { ranges: [] }
            });

            const batchData = [];

            // Section 1
            if (sets?.[0]) {
                const h = sets[0].length ? getHeaders(sets[0]) : getHeadersFromColumns(sets[0]);
                if (h.length) {
                    const rows = sets[0].map(r => formatRow(r));
                    batchData.push({ range: `'${sheetName}'!A5`, values: [h, ...rows] });
                    if (!rows.length) console.warn(`⚠️  [${sheetName}] Section 1: 0 rows. Header written at A5.`);
                }
            }

            // Section 2
            if (sets?.[1]) {
                const h = sets[1].length ? getHeaders(sets[1]) : getHeadersFromColumns(sets[1]);
                if (h.length) {
                    const rows = sets[1].map(r => formatRow(r));
                    batchData.push({ range: `'${sheetName}'!A13`, values: [h, ...rows] });
                    if (!rows.length) console.warn(`⚠️  [${sheetName}] Section 2: 0 rows. Header written at A13.`);
                }
            }

            // Section 3
            if (sets?.[2]) {
                const h = sets[2].length ? getHeaders(sets[2]) : getHeadersFromColumns(sets[2]);
                if (h.length) {
                    const rows = sets[2].map(r => formatRow(r));
                    batchData.push({ range: `'${sheetName}'!A20`, values: [h, ...rows] });
                    if (!rows.length) console.warn(`⚠️  [${sheetName}] Section 3: 0 rows. Header written at A20.`);
                }
            }

            if (batchData.length > 0) {
                await sheetsApi.spreadsheets.values.batchUpdate({
                    spreadsheetId,
                    requestBody: { data: batchData, valueInputOption: 'USER_ENTERED' }
                });
                console.log(`✅ [${sheetName}] Multi-section sync complete.`);
            }
            return;
        }

        // ── SPECIAL CASE: Inv. Discrepancy (two side-by-side panels, both at row 5) ──
        // Left panel (Negative Variance) → A5:H   Right panel (Positive Variance) → J5:Q
        if (sheetName === 'Inv. Discrepancy') {
            const sets = result.recordsets;

            await sheetsApi.spreadsheets.values.batchClear({
                spreadsheetId,
                requestBody: {
                    ranges: [
                        `'${sheetName}'!A5:H1000`,
                        `'${sheetName}'!J5:Q1000`,
                    ]
                }
            });

            const batchData = [];

            // Left panel — Negative Variance
            if (sets?.[0]) {
                const h = sets[0].length ? getHeaders(sets[0]) : getHeadersFromColumns(sets[0]);
                if (h.length) {
                    const rows = sets[0].map(r => formatRow(r));
                    batchData.push({ range: `'${sheetName}'!A5`, values: [h, ...rows] });
                    if (!rows.length) console.warn(`⚠️  [${sheetName}] Left (Negative): 0 rows. Header written at A5.`);
                }
            }

            // Right panel — Positive Variance
            if (sets?.[1]) {
                const h = sets[1].length ? getHeaders(sets[1]) : getHeadersFromColumns(sets[1]);
                if (h.length) {
                    const rows = sets[1].map(r => formatRow(r));
                    batchData.push({ range: `'${sheetName}'!J5`, values: [h, ...rows] });
                    if (!rows.length) console.warn(`⚠️  [${sheetName}] Right (Positive): 0 rows. Header written at J5.`);
                }
            }

            if (batchData.length > 0) {
                await sheetsApi.spreadsheets.values.batchUpdate({
                    spreadsheetId,
                    requestBody: { data: batchData, valueInputOption: 'USER_ENTERED' }
                });
                console.log(`✅ [${sheetName}] Side-by-side sync complete.`);
            }
            return;
        }

        // ── ALL OTHER SHEETS: header + data starting at A5 ───────────────────────
        const rows = result.recordset;

        await sheetsApi.spreadsheets.values.clear({
            spreadsheetId,
            range: `'${sheetName}'!A5:Z1000`,
        });

        const headers = rows && rows.length > 0
            ? getHeaders(rows)
            : getHeadersFromColumns(rows);

        if (headers.length > 0) {
            const data = rows ? rows.map(r => formatRow(r)) : [];

            await sheetsApi.spreadsheets.values.update({
                spreadsheetId,
                range: `'${sheetName}'!A5`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [headers, ...data] },
            });

            if (data.length > 0) {
                console.log(`✅ [${sheetName}] Synced ${data.length} row(s) + header at A5.`);
            } else {
                console.warn(`⚠️  [${sheetName}] 0 rows returned. Header written at A5.`);
            }
        } else {
            console.warn(`⚠️  [${sheetName}] 0 rows and no column metadata. Nothing written.`);
        }

    } catch (err) {
        console.error(`❌ [${sheetName}] Error:`, err.message);
    }
}

exports.run = async (pool, folderId, branchCode, dbName) => {
    console.log(`\n📊 [ACN] Sync started at ${new Date().toLocaleString()}`);

    const queries = buildAcnQueries();

    const currentSpreadsheetId = await getSpreadsheetIdForCurrentMonth(folderId, branchCode);

    if (!currentSpreadsheetId) {
        console.log('[ACN] ⚠️  Sync aborted: could not find target spreadsheet.');
        return;
    }

    const tabNames = Object.keys(queries);
    console.log(`📋 [ACN] Processing ${tabNames.length} tab(s)...`);
    for (let i = 0; i < tabNames.length; i++) {
        const tabName = tabNames[i];
        console.log(`   ⏳ [ACN] [${i+1}/${tabNames.length}] Syncing: "${tabName}"...`);
        await syncQueryToSheet(pool, currentSpreadsheetId, queries[tabName], tabName);
        await sleep(3000);
    }
    console.log('✨ [ACN] All tabs synced successfully.');
};