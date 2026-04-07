const { google } = require('googleapis');
const { auth, DATE } = require('../../config'); // Use the shared auth from config
const { buildAcnQueries } = require('../../Model/IrigaQueries');

const sheetsApi = google.sheets({ version: 'v4', auth });
const driveApi = google.drive({ version: 'v3', auth });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- BRANCH METADATA MAP ---
const BRANCH_META = {
    IBS: { prefix: 'SGR_ACN_IBS', label: 'Iriga Branch Store'    }
};

const MONTH_LABELS = [
    ['JAN', 'January'],  ['FEB', 'February'], ['MAR', 'March'],
    ['APR', 'April'],    ['MAY', 'May'],       ['JUN', 'June'],
    ['JUL', 'July'],     ['AUG', 'August'],    ['SEP', 'September'],
    ['OCT', 'October'],  ['NOV', 'November'],  ['DEC', 'December'],
];

// --- HELPER: FIND SPREADSHEET BY CURRENT MONTH NAME ---
async function getSpreadsheetIdForCurrentMonth(folderId, branchCode) {
    const meta  = BRANCH_META[branchCode] || BRANCH_META['IBS'];
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
    // Date: MM/DD/YYYY
    if (DATE_KEYS.test(key)) {
        const d = (val instanceof Date) ? val : new Date(val);
        if (!isNaN(d.getTime())) {
            const mm   = String(d.getMonth() + 1).padStart(2, '0');
            const dd   = String(d.getDate()).padStart(2, '0');
            const yyyy = d.getFullYear();
            return `${mm}/${dd}/${yyyy}`;
        }
    }
    // Peso: ₱ prefix on numeric monetary fields
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

// --- Extract headers from recordset (works when data exists) ---
function getHeaders(recordset) {
    if (!recordset || recordset.length === 0) return [];
    return Object.keys(recordset[0]);
}

// --- Extract headers from mssql column metadata (works even on 0-row results) ---
function getHeadersFromColumns(recordset) {
    return Object.keys(recordset?.columns || {});
}

// --- UPDATED HELPER: Uses the pool passed from Server.js ---
async function syncQueryToSheet(pool, spreadsheetId, query, sheetName) {
    try {
        // Use the pool provided by Server.js
        const result = await pool.request().query(query);

        // --- SPECIAL HANDLING: CSR/OE/RS (TRIPLE TABLE SYNC) ---
        if (sheetName === 'CSR/OE/RS') {
            const sets = result.recordsets;
            const rangesToClear = [
                `'${sheetName}'!A5:K8`,    // Section 1 data
                `'${sheetName}'!A13:K15`,  // Section 2 data
                `'${sheetName}'!A20:K1000` // Section 3 data
            ];

            await sheetsApi.spreadsheets.values.batchClear({
                spreadsheetId,
                requestBody: { ranges: rangesToClear }
            });

            const batchData = [];
            
            // ✅ ADD HEADERS FOR EACH SECTION (using helper functions)
            const headers1 = sets[0] && sets[0].length > 0 ? getHeaders(sets[0]) : getHeadersFromColumns(sets[0]);
            if (headers1.length > 0) {
                const rows1 = (sets[0] || []).map(r => formatRow(r));
                batchData.push({ range: `'${sheetName}'!A5`, values: [headers1, ...rows1] });
            }
            
            const headers2 = sets[1] && sets[1].length > 0 ? getHeaders(sets[1]) : getHeadersFromColumns(sets[1]);
            if (headers2.length > 0) {
                const rows2 = (sets[1] || []).map(r => formatRow(r));
                batchData.push({ range: `'${sheetName}'!A13`, values: [headers2, ...rows2] });
            }
            
            const headers3 = sets[2] && sets[2].length > 0 ? getHeaders(sets[2]) : getHeadersFromColumns(sets[2]);
            if (headers3.length > 0) {
                const rows3 = (sets[2] || []).map(r => formatRow(r));
                batchData.push({ range: `'${sheetName}'!A20`, values: [headers3, ...rows3] });
            }

            if (batchData.length > 0) {
                await sheetsApi.spreadsheets.values.batchUpdate({
                    spreadsheetId,
                    requestBody: { data: batchData, valueInputOption: 'USER_ENTERED' }
                });
                console.log(`✅ [${sheetName}] Multi-table sync completed with headers.`);
            }
            return;
        }

        // --- SPECIAL HANDLING: Inv. Discrepancy (SIDE-BY-SIDE SYNC) ---
        if (sheetName === 'Inv. Discrepancy') {
            const sets = result.recordsets; 
            const startRow = 5;

            await sheetsApi.spreadsheets.values.batchClear({
                spreadsheetId,
                requestBody: { 
                    ranges: [
                        `'${sheetName}'!A${startRow}:H1000`, 
                        `'${sheetName}'!J${startRow}:Q1000` 
                    ] 
                }
            });

            const batchData = [];
            
            // ✅ ADD HEADERS FOR NEGATIVE VARIANCE SECTION
            // mssql .columns is a plain object keyed by name — NOT an array, so Object.keys() is correct
            const headers1 = sets[0]?.length > 0
                ? Object.keys(sets[0][0])
                : Object.keys(sets[0]?.columns || {});
            if (headers1.length > 0) {
                const rows1 = (sets[0] || []).map(r => formatRow(r));
                batchData.push({ range: `'${sheetName}'!A${startRow}`, values: [headers1, ...rows1] });
            }

            // ✅ ADD HEADERS FOR POSITIVE VARIANCE SECTION
            const headers2 = sets[1]?.length > 0
                ? Object.keys(sets[1][0])
                : Object.keys(sets[1]?.columns || {});
            if (headers2.length > 0) {
                const rows2 = (sets[1] || []).map(r => formatRow(r));
                batchData.push({ range: `'${sheetName}'!J${startRow}`, values: [headers2, ...rows2] });
            }

            if (batchData.length > 0) {
                await sheetsApi.spreadsheets.values.batchUpdate({
                    spreadsheetId,
                    requestBody: { data: batchData, valueInputOption: 'USER_ENTERED' }
                });
                console.log(`✅ [${sheetName}] Side-by-side sync completed with headers at Row ${startRow}.`);
            }
            return;
        }

        // --- STANDARD SYNC LOGIC WITH HEADERS ---
        const rows = result.recordset;
        const values = [];

        // ✅ EXTRACT HEADERS: Get column names from data or metadata
        const headers = rows && rows.length > 0
            ? getHeaders(rows)
            : getHeadersFromColumns(rows);

        if (headers.length > 0) {
            // Add headers as first row
            values.push(headers);
            
            // ✅ ADD DATA ROWS: Map and format each row
            if (rows && rows.length > 0) {
                rows.forEach(r => values.push(formatRow(r)));
            }

            // Clear data range and upload with headers starting at A5
            const clearRange = `'${sheetName}'!A5:Z1000`;
            const uploadRange = `'${sheetName}'!A5`;

            await sheetsApi.spreadsheets.values.clear({ 
                spreadsheetId, 
                range: clearRange
            });

            await sheetsApi.spreadsheets.values.update({
                spreadsheetId,
                range: uploadRange,
                valueInputOption: 'USER_ENTERED', 
                requestBody: { values },
            });
            
            if (rows && rows.length > 0) {
                console.log(`✅ [${sheetName}] Data synced: ${rows.length} rows + 1 header at A5.`);
            } else {
                console.warn(`⚠️ [${sheetName}] No records found. Header written at A5.`);
            }
        } else {
            console.warn(`⚠️ [${sheetName}] No data and no columns available.`);
        }
    } catch (err) {
        console.error(`❌ [${sheetName}] Error:`, err.message);
    }
    // CRITICAL: Removed pool.close() so other controllers can continue
}

// --- EXPORTED RUN FUNCTION: Called by Server.js ---
exports.run = async (pool, folderId, branchCode, dbName) => {
    console.log(`
📊 [ACN] Sync started at ${new Date().toLocaleString()}`);
    
    const queries = buildAcnQueries(dbName);

    // Pass folderId + branchCode to find the correct branch spreadsheet
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