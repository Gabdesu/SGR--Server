const { google } = require('googleapis');
const { auth, DATE } = require('../../config');
const { prdQueries } = require('../../Model/DdsQueries');

const sheetsApi = google.sheets({ version: 'v4', auth });
const driveApi = google.drive({ version: 'v3', auth });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- BRANCH METADATA MAP ---
const BRANCH_META = {
    DDS: { prefix: 'SGR_PRD_DDS', label: 'Distribution Display Store' },
};

const MONTH_LABELS = [
    ['JAN', 'January'],  ['FEB', 'February'], ['MAR', 'March'],
    ['APR', 'April'],    ['MAY', 'May'],       ['JUN', 'June'],
    ['JUL', 'July'],     ['AUG', 'August'],    ['SEP', 'September'],
    ['OCT', 'October'],  ['NOV', 'November'],  ['DEC', 'December'],
];

// --- HELPER: FIND SPREADSHEET BY CURRENT MONTH NAME ---
async function getSpreadsheetIdForCurrentMonth(folderId, branchCode) {
    const meta  = BRANCH_META[branchCode] || BRANCH_META['DDS'];
    const now = new Date()
    // Target LAST month (mirrors config.js buildLastMonthRange logic)
    const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1; // 0-indexed for MONTH_LABELS
    const [shortMon, longMon] = MONTH_LABELS[month];

    const currentFileName = `BCVR [${meta.prefix}_${shortMon}_${year}] BCVR ${meta.label} | ${longMon} ${year} - \u200BProducts`;
    console.log(`🔎 [PRD] Searching Drive folder for: "${currentFileName}" (Branch: ${branchCode})`);

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
// ✅ Added capital|distribution to catch the renamed HPV columns
const PESO_KEYS = /price|total|value|sold|amount|cost|disc|orig|capital|distribution/i;
const DATE_KEYS = /date/i;

function formatCell(key, val) {
    if (val === null || val === undefined || val === '') return val;
    if (DATE_KEYS.test(key) && (val instanceof Date || !isNaN(Date.parse(val)))) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
            const mm   = String(d.getMonth() + 1).padStart(2, '0');
            const dd   = String(d.getDate()).padStart(2, '0');
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

/**
 * Internal helper to sync a single query to a specific sheet.
 */
async function syncQueryToSheet(pool, spreadsheetId, query, sheetName) {
    try {
        const result = await pool.request().query(query);
        const rows   = result.recordset;
        const START_ROW = 5;

        // --- SPECIAL LOGIC: HIGH PESO VALUE (Meds on Left, Supplies on Right) ---
        if (sheetName === 'High Peso Value') {

            await sheetsApi.spreadsheets.values.batchClear({
                spreadsheetId,
                requestBody: {
                    ranges: [
                        `'${sheetName}'!A${START_ROW}:F1000`,
                        `'${sheetName}'!H${START_ROW}:M1000`,
                    ]
                }
            });

            const hpvHeaders = ['', 'Product Name', 'Qty', 'Capital', 'Distribution', 'Retail'];

            if (rows && rows.length > 0) {
                const mapRow = (r) => [
                    '',
                    r['Product Name'],
                    r.Qty,
                    formatCell('Price', r.Capital),
                    formatCell('Price', r.Distribution),
                    formatCell('Price', r.Retail),
                ];
                const meds     = rows.filter(r => r.Type === 'MEDICINES').map(mapRow);
                const supplies = rows.filter(r => r.Type === 'SUPPLIES').map(mapRow);

                const batchData = [];
                if (meds.length > 0)     batchData.push({ range: `'${sheetName}'!A${START_ROW}`, values: [hpvHeaders, ...meds] });
                if (supplies.length > 0) batchData.push({ range: `'${sheetName}'!H${START_ROW}`, values: [hpvHeaders, ...supplies] });

                if (batchData.length === 0) {
                    batchData.push({ range: `'${sheetName}'!A${START_ROW}`, values: [hpvHeaders] });
                    batchData.push({ range: `'${sheetName}'!H${START_ROW}`, values: [hpvHeaders] });
                }

                await sheetsApi.spreadsheets.values.batchUpdate({
                    spreadsheetId,
                    requestBody: { data: batchData, valueInputOption: 'RAW' }
                });
                console.log(`✅ [${sheetName}] Side-by-side sync completed (headers on Row ${START_ROW}).`);

            } else {
                await sheetsApi.spreadsheets.values.batchUpdate({
                    spreadsheetId,
                    requestBody: {
                        data: [
                            { range: `'${sheetName}'!A${START_ROW}`, values: [hpvHeaders] },
                            { range: `'${sheetName}'!H${START_ROW}`, values: [hpvHeaders] },
                        ],
                        valueInputOption: 'RAW'
                    }
                });
                console.log(`⚠️ [${sheetName}] No records — headers written on Row ${START_ROW}.`);
            }

        // --- STANDARD LOGIC: ALL OTHER SHEETS ---
        } else {

            await sheetsApi.spreadsheets.values.clear({
                spreadsheetId,
                range: `'${sheetName}'!A${START_ROW}:Z1000`
            });

            const headers = Object.keys(result.recordset.columns);

            if (rows && rows.length > 0) {
                await sheetsApi.spreadsheets.values.update({
                    spreadsheetId,
                    range: `'${sheetName}'!A${START_ROW}`,
                    valueInputOption: 'RAW',
                    requestBody: {
                        values: [
                            headers,
                            ...rows.map(r => formatRow(r)),
                        ]
                    },
                });
                console.log(`✅ [${sheetName}] Data synced (headers on Row ${START_ROW}, data from Row ${START_ROW + 1}).`);
            } else {
                await sheetsApi.spreadsheets.values.update({
                    spreadsheetId,
                    range: `'${sheetName}'!A${START_ROW}`,
                    valueInputOption: 'RAW',
                    requestBody: { values: [headers] },
                });
                console.log(`⚠️ [${sheetName}] No records — headers written on Row ${START_ROW}.`);
            }
        }

    } catch (err) {
        console.error(`❌ [${sheetName}] Error:`, err.message);
    }
}

/**
 * Main entry point exported to Server.js
 */
exports.run = async (pool, folderId, branchCode) => {
    console.log(`\n📦 [PRD] Sync started at ${new Date().toLocaleString()}`);

    const currentSpreadsheetId = await getSpreadsheetIdForCurrentMonth(folderId, branchCode);

    if (!currentSpreadsheetId) {
        console.log('[PRD] ⚠️  Sync aborted: could not find target spreadsheet.');
        return;
    }

    const tabNames = Object.keys(prdQueries);
    console.log(`📋 [PRD] Processing ${tabNames.length} tab(s)...`);
    for (let i = 0; i < tabNames.length; i++) {
        const tabName = tabNames[i];
        console.log(`   ⏳ [PRD] [${i+1}/${tabNames.length}] Syncing: "${tabName}"...`);
        await syncQueryToSheet(pool, currentSpreadsheetId, prdQueries[tabName], tabName);
        await sleep(3000);
    }
    console.log('✨ [PRD] All tabs synced successfully.');
};