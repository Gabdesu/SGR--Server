const { google } = require('googleapis');
const { auth, DATE } = require('../../config');

const sheetsApi = google.sheets({ version: 'v4', auth });
const driveApi = google.drive({ version: 'v3', auth });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- BRANCH METADATA MAP ---
const BRANCH_META = {
    SBS: { prefix: 'SGR_SLS_SBS', label: 'Sorsogon Branch Store' },
    MBS: { prefix: 'SGR_SLS_MBS', label: 'Masbate Branch Store'  },
    IBS: { prefix: 'SGR_SLS_IBS', label: 'Iriga Branch Store'    },
};

const MONTH_LABELS = [
    ['JAN', 'January'],  ['FEB', 'February'], ['MAR', 'March'],
    ['APR', 'April'],    ['MAY', 'May'],       ['JUN', 'June'],
    ['JUL', 'July'],     ['AUG', 'August'],    ['SEP', 'September'],
    ['OCT', 'October'],  ['NOV', 'November'],  ['DEC', 'December'],
];

// --- HELPER: FIND SPREADSHEET BY CURRENT MONTH NAME ---
async function getSpreadsheetIdForCurrentMonth(folderId, branchCode) {
    const meta = BRANCH_META[branchCode] || BRANCH_META['MBS'];
    const now  = new Date();
    const year = now.getFullYear();
    const [shortMon, longMon] = MONTH_LABELS[now.getMonth()];
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

// --- SQL QUERY REPOSITORY ---
const queries = {
    'MWRS-Delivered': `
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    Order_Date AS [Order Date],
    Client_Name AS [Client Name],
    Client_Address AS [Client Address],
    Misc_NOAdate AS [Non-official Invoice],
    Misc_SalesInvoice AS [Sales Invoice],
    Misc_DeliveryReceipt AS [Official Delivery Receipt],
    '' AS [Charge Invoice],
    0.00 AS [DM],
    0.00 AS [MSDE],
    0.00 AS [GM],
    0.00 AS [LSAE],
    0.00 AS [OSEF],
    0.00 AS [ASME],
    0.00 AS [REEV],
    PO_Amount AS [Total Peso Sale]
FROM TBL_Orders
WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
  AND (Order_Type LIKE '%Masbate Wholesale Retail Sales%' OR Order_Type LIKE '%MWRS%')
ORDER BY Order_Date ASC`,

    'MWRS-Collected': `
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    Order_No AS [Order No],
    Order_Date AS [Booking Date],
    Misc_PODate AS [Payment Date],
    '' AS [Check Date],
    Client_Name AS [Entity],
    Order_Type AS [Order Details],
    Misc_NOAdate AS [Non-official Invoice],
    Misc_SalesInvoice AS [Sales Invoice],
    Misc_DeliveryReceipt AS [Delivery Receipt],
    '' AS [Charge Invoice],
    Order_Payment_Status AS [Payment Type],
    '' AS [Bank Details],
    0.00 AS [Discount],
    0.00 AS [Return],
    0.00 AS [Rebates],
    0.00 AS [Tax],
    0.00 AS [Other Charges],
    PO_Amount AS [Sales Delivered],
    Payment_Amount AS [Net Collected]
FROM TBL_Orders
WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
  AND (Order_Type LIKE '%Masbate%' OR Order_Type LIKE '%MWRS%')
ORDER BY Order_Date ASC`,

    'MFGS-Booking': `
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    O.Order_Date AS [Booking Date],
    CASE 
        WHEN I.Catg_ID IN (392979, 564572, 91602, 101990, 81593) THEN 'MEDICINES'
        WHEN I.Catg_ID IN (272586, 322690, 202276, 91931, 101946, 91901, 493490, 91936, 91908) THEN 'SUPPLIES'
        ELSE 'OTHER'
    END AS [Sales Category],
    O.Client_Name AS [Entity],
    O.Client_Address AS [End User],
    O.Order_Type AS [PO Details],
    O.PO_Amount AS [PO Amount],
    O.Payment_Amount AS [Total Delivered]
FROM TBL_Orders O
INNER JOIN TBL_Orders_Detail OD ON O.Order_No = OD.Order_No
INNER JOIN TBL_Category_Item_File I ON OD.Item_ID = I.Item_ID
WHERE (CAST(O.Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
  AND (O.Order_Type LIKE '%Masbate Field Government%' OR O.Order_Type LIKE '%MFGS%')
ORDER BY O.Order_Date ASC`,

    'MFGS-Delivered': `
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    Order_Date AS [Order Date],
    Client_Name AS [Client Name],
    Client_Address AS [Client Address],
    Misc_NOAdate AS [Non-official Invoice],
    Misc_SalesInvoice AS [Sales Invoice],
    Misc_DeliveryReceipt AS [Official Delivery Receipt],
    '' AS [Charge Invoice],
    0.00 AS [DM],
    0.00 AS [MSDE],
    0.00 AS [GM],
    0.00 AS [LSAE],
    0.00 AS [OSEF],
    0.00 AS [ASME],
    0.00 AS [REEV],
    PO_Amount AS [Total Peso Sale]
FROM TBL_Orders
WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
  AND (Order_Type LIKE '%Masbate Field Government%' OR Order_Type LIKE '%MFGS%')
ORDER BY Order_Date ASC`,

    'MFGS-Collected': `
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    O.Order_No AS [Order No],
    O.Order_Date AS [Booking Date],
    O.Misc_PODate AS [Payment Date],
    '' AS [Check Date],
    O.Client_Name AS [Procuring Entity],
    O.Order_Type AS [Order Details],
    'Order Slip#' + CAST(O.Order_No AS VARCHAR(20)) AS [Non-official Invoice],
    O.Misc_SalesInvoice AS [Sales Invoice],
    O.Misc_DeliveryReceipt AS [Official Delivery Receipt],
    '' AS [Charge Invoice],
    O.Misc_RFQDate AS [RFQ Date],
    O.Misc_PQDate AS [PQ Date],
    O.Misc_NOAdate AS [NOA Date],
    O.Misc_NTPdate AS [NTP Date],
    O.Misc_PODate AS [PO Date],
    O.Order_Payment_Status AS [Payment Type],
    0.00 AS [Tax Amount],
    O.PO_Amount AS [Stocks Delivered],
    O.Payment_Amount AS [Net Collected]
FROM TBL_Orders O
WHERE (CAST(O.Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
  AND (O.Order_Type LIKE '%Masbate Field Government%' OR O.Order_Type LIKE '%MFGS%')
ORDER BY O.Order_Date ASC`,

    'Top 30': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';

        SELECT TOP 30 'MWRS' AS [BOSC], Client_Name AS [Entity], SUM(ISNULL(PO_Amount, 0)) AS [Total PO]
        FROM TBL_Orders WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
        AND (Order_Type LIKE '%Masbate%' OR Order_Type LIKE '%MWRS%')
        GROUP BY Client_Name ORDER BY SUM(ISNULL(PO_Amount, 0)) DESC;

        SELECT TOP 30 'MWRS' AS [BOSC], Client_Name AS [Entity], SUM(CASE WHEN Misc_DeliveryReceipt IS NOT NULL THEN ISNULL(PO_Amount, 0) ELSE 0 END) AS [Total Delivered]
        FROM TBL_Orders WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
        AND (Order_Type LIKE '%Masbate%' OR Order_Type LIKE '%MWRS%')
        GROUP BY Client_Name ORDER BY SUM(ISNULL(PO_Amount, 0)) DESC;

        SELECT TOP 30 'MWRS' AS [BOSC], Client_Name AS [Entity], SUM(ISNULL(Payment_Amount, 0)) AS [Total Collected]
        FROM TBL_Orders WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
        AND (Order_Type LIKE '%Masbate%' OR Order_Type LIKE '%MWRS%')
        GROUP BY Client_Name ORDER BY SUM(ISNULL(PO_Amount, 0)) DESC;`,

    'Top AR': `
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT TOP 30
    '' AS [#],
    'MWRS' AS [BOSC],
    Client_Name AS [Entity],
    SUM(ISNULL(PO_Amount, 0)) - SUM(ISNULL(Payment_Amount, 0)) AS [Total Balance]
FROM TBL_Orders
WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
  AND (Order_Type LIKE '%Masbate%' OR Order_Type LIKE '%MWRS%')
GROUP BY Client_Name
HAVING SUM(ISNULL(PO_Amount, 0)) - SUM(ISNULL(Payment_Amount, 0)) > 0
ORDER BY [Total Balance] DESC`,

    'Top Inactive': `
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT TOP 30
    '' AS [#],
    CASE 
        WHEN Order_Type LIKE '%Government%' OR Order_Type LIKE '%MFGS%' THEN 'MFGS'
        ELSE 'MWRS'
    END AS [BOSC],
    Client_Name AS [Entity],
    SUM(ISNULL(PO_Amount, 0)) AS [Total Consumption]
FROM TBL_Orders
WHERE (Order_Type LIKE '%Masbate%' OR Order_Type LIKE '%MWRS%' OR Order_Type LIKE '%MFGS%')
GROUP BY Client_Name, Order_Type
HAVING MAX(CAST(Order_Date AS DATE)) < @StartDate
ORDER BY [Total Consumption] DESC`,

    'New Clients': `
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    '' AS [#],
    FORMAT(MIN(O.Order_Date), 'yyyy-MM-dd') AS [Date Added],
    O.Client_Name AS [Name],
    O.Client_Address AS [Address],
    O.Order_Type AS [Type]
FROM TBL_Orders O
WHERE (O.Order_Type LIKE '%Masbate%' OR O.Order_Type LIKE '%MWRS%' OR O.Order_Type LIKE '%MFGS%')
GROUP BY O.Client_Name, O.Client_Address, O.Order_Type
HAVING MIN(CAST(O.Order_Date AS DATE)) BETWEEN @StartDate AND @EndDate
ORDER BY [Date Added] ASC`,

    'Active Clients Update Audit': `
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    '' AS [#],
    FORMAT(MIN(Order_Date), 'yyyy-MM-dd') AS [Date Recorded],
    CASE 
        WHEN Order_Type LIKE '%Government%' OR Order_Type LIKE '%MFGS%' THEN 'MFGS'
        ELSE 'MWRS'
    END AS [Sales Category],
    Client_Name AS [Entity],
    FORMAT(MAX(Order_Date), 'yyyy-MM-dd') AS [Most Recent Order Date],
    COUNT(Order_No) AS [No. of Transactions]
FROM TBL_Orders
WHERE (Order_Type LIKE '%Masbate%' OR Order_Type LIKE '%MWRS%' OR Order_Type LIKE '%MFGS%')
GROUP BY Client_Name, Order_Type
HAVING MAX(Order_Date) >= @StartDate
ORDER BY [No. of Transactions] DESC`,

    'New Client Contacts': `
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    '' AS [#],
    CASE WHEN Order_Type LIKE '%MFGS%' THEN 'MFGS' ELSE 'MWRS' END AS [Sales Category],
    Client_Name AS [Entity],
    '' AS [Contact Person],
    '' AS [Position],
    '' AS [Department],
    '' AS [Birthday],
    '' AS [Contact Number],
    '' AS [Email Address],
    'New Client March 2026' AS [Remarks]
FROM TBL_Orders
GROUP BY Client_Name, Order_Type
HAVING MIN(CAST(Order_Date AS DATE)) BETWEEN @StartDate AND @EndDate`,

    'Canvass Details': `
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    O.Order_No AS [Canvass No],
    CAST(O.Order_Date AS DATE) AS [Plot Date],
    O.Client_Name AS [Canvass Name],
    CASE 
        WHEN O.Order_Type LIKE '%MFGS%' THEN 'MFGS' 
        ELSE 'MWRS' 
    END AS [Sales Category],
    '' AS [End User],
    'Masbate Staff' AS [Canvasser Name],
    '' AS [Contact],
    '' AS [Designation],
    'YES' AS [Approved?],
    'WON' AS [Result],
    O.PO_Amount AS [ABC Total],
    O.PO_Amount AS [Canvass Total],
    'System' AS [Encoder]
FROM TBL_Orders O
WHERE CAST(O.Order_Date AS DATE) BETWEEN @StartDate AND @EndDate
  AND (O.Order_Type LIKE '%Masbate%' OR O.Order_Type LIKE '%MWRS%' OR O.Order_Type LIKE '%MFGS%')
ORDER BY O.Order_Date ASC`,

    'Ordering Kiosk Details': `
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    CASE 
        WHEN O.Order_Type LIKE '%MFGS%' THEN 'MFGS' 
        ELSE 'MWRS' 
    END AS [Sales Category],
    O.Order_No AS [Order No],
    CAST(O.Order_Date AS DATE) AS [Booking Date],
    CAST(O.Order_Date AS DATE) AS [Order Date],
    O.Client_Name AS [Entity],
    O.Client_Address AS [Address],
    '' AS [End User/Requestor],
    'System_User' AS [Encoder],
    '' AS [Picker],
    '' AS [Checker],
    '' AS [Packer],
    O.Order_No AS [Canvass No./SRF No.],
    O.Order_Type AS [PO Details / Order Details],
    O.PO_Amount AS [PO Amount / Order Total]
FROM TBL_Orders O
WHERE CAST(O.Order_Date AS DATE) BETWEEN @StartDate AND @EndDate
  AND (O.Order_Type LIKE '%Masbate%' OR O.Order_Type LIKE '%MWRS%' OR O.Order_Type LIKE '%MFGS%')
ORDER BY O.Order_No ASC`,
};

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

        // ── TOP 30: three side-by-side tables, each with header at row 5 ──────────
        // Table 1 Booking   → B5:D   Table 2 Delivered → G5:I   Table 3 Collected → L5:N
        if (sheetName === 'Top 30') {
            const headerRow = 5;
            const sets = result.recordsets;

            if (!sets || sets.length === 0) {
                console.warn(`⚠️  [${sheetName}] No recordsets returned.`);
                return;
            }

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
            const t1Headers = sets[0]?.length ? getHeaders(sets[0]) : getHeadersFromColumns(sets[0]);
            if (t1Headers.length) {
                const rows = (sets[0] || []).map(r => formatRow(r));
                batchData.push({ range: `'${sheetName}'!B${headerRow}`, values: [t1Headers, ...rows] });
                if (!rows.length) console.warn(`⚠️  [${sheetName}] Table 1 (Booking): 0 rows. Header written.`);
            }

            // Table 2 — Delivered
            const t2Headers = sets[1]?.length ? getHeaders(sets[1]) : getHeadersFromColumns(sets[1]);
            if (t2Headers.length) {
                const rows = (sets[1] || []).map(r => formatRow(r));
                batchData.push({ range: `'${sheetName}'!G${headerRow}`, values: [t2Headers, ...rows] });
                if (!rows.length) console.warn(`⚠️  [${sheetName}] Table 2 (Delivered): 0 rows. Header written.`);
            }

            // Table 3 — Collected
            const t3Headers = sets[2]?.length ? getHeaders(sets[2]) : getHeadersFromColumns(sets[2]);
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
                console.log(`✅ [${sheetName}] Side-by-side sync complete (headers at row ${headerRow}).`);
            }
            return;
        }

        // ── ALL OTHER SHEETS: header + data starting at A5 ───────────────────────
        const rows = result.recordset;

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
                console.warn(`⚠️  [${sheetName}] 0 rows returned. Header written at A5.`);
            }
        } else {
            console.warn(`⚠️  [${sheetName}] 0 rows and no column metadata. Nothing written.`);
        }

    } catch (err) {
        console.error(`❌ [${sheetName}] Error:`, err.message);
    }
}

exports.run = async (pool, folderId, branchCode) => {
    console.log(`\n💰 [SLS] Sync started at ${new Date().toLocaleString()}`);

    const currentSpreadsheetId = await getSpreadsheetIdForCurrentMonth(folderId, branchCode);

    if (!currentSpreadsheetId) {
        console.log('[SLS] ⚠️  Sync aborted: could not find target spreadsheet.');
        return;
    }

    const tabNames = Object.keys(queries);
    console.log(`📋 [SLS] Processing ${tabNames.length} tab(s)...`);
    for (let i = 0; i < tabNames.length; i++) {
        const tabName = tabNames[i];
        console.log(`   ⏳ [SLS] [${i+1}/${tabNames.length}] Syncing: "${tabName}"...`);
        await syncQueryToSheet(pool, currentSpreadsheetId, queries[tabName], tabName);
        await sleep(3000);
    }
    console.log('✨ [SLS] All tabs synced successfully.');
};