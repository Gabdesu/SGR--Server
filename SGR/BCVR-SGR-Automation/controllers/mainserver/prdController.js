const { google } = require('googleapis');
const { auth, DATE } = require('../../config'); // Use the shared auth from config

const sheetsApi = google.sheets({ version: 'v4', auth });
const driveApi = google.drive({ version: 'v3', auth });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- BRANCH METADATA MAP ---
const BRANCH_META = {
    SBS: { prefix: 'SGR_PRD_SBS', label: 'Sorsogon Branch Store' },
    MBS: { prefix: 'SGR_PRD_MBS', label: 'Masbate Branch Store'  },
    IBS: { prefix: 'SGR_PRD_IBS', label: 'Iriga Branch Store'    },
};

const MONTH_LABELS = [
    ['JAN', 'January'],  ['FEB', 'February'], ['MAR', 'March'],
    ['APR', 'April'],    ['MAY', 'May'],       ['JUN', 'June'],
    ['JUL', 'July'],     ['AUG', 'August'],    ['SEP', 'September'],
    ['OCT', 'October'],  ['NOV', 'November'],  ['DEC', 'December'],
];

// --- HELPER: FIND SPREADSHEET BY CURRENT MONTH NAME ---
async function getSpreadsheetIdForCurrentMonth(folderId, branchCode) {
    const meta  = BRANCH_META[branchCode] || BRANCH_META['SBS','MBS','IBS'];
    const now   = new Date();
    const year  = now.getFullYear();
    const [shortMon, longMon] = MONTH_LABELS[now.getMonth()];
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

// --- SQL QUERY REPOSITORY ---
const queries = {
    'Fast Moving (Meds)': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT TOP 100
            CASE WHEN MAX(TBL_Category_File.group_ID) = 1 AND LEN(MAX(I.Item_Name)) > 4
                 THEN LEFT(MAX(I.Item_Name), LEN(MAX(I.Item_Name)) - 4)
                 ELSE MAX(I.Item_Name) END AS Product,
            COUNT(O.order_no) AS Freq,
            SUM(CASE WHEN order_type LIKE '%Sales%' AND order_type NOT LIKE '%Transfer%' THEN QTY ELSE 0 END) AS Quantity,
            MAX(Item_Packaging) AS Packaging
        FROM TBL_Orders_Detail OD
        INNER JOIN tbl_orders O ON O.Order_No = OD.Order_No
        INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        INNER JOIN TBL_Category_File ON TBL_Category_File.Catg_ID = I.Catg_ID
        WHERE TBL_Category_File.group_ID = 1
          AND Order_Type LIKE '%Sales%'
          AND (CASE WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
                    THEN CONVERT(DATE, Order_Date)
                    ELSE CONVERT(DATE, Encode_DateTime) END) BETWEEN @StartDate AND @EndDate
        GROUP BY CASE WHEN LEN(I.Item_Name) > 4 THEN LEFT(I.Item_Name, LEN(I.Item_Name) - 4) ELSE I.Item_Name END
        ORDER BY COUNT(O.order_no) DESC`,
 
    'Fast Moving (Supplies)': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT TOP 100
            CASE WHEN MAX(TBL_Category_File.group_ID) = 1 AND LEN(MAX(I.Item_Name)) > 4
                 THEN LEFT(MAX(I.Item_Name), LEN(MAX(I.Item_Name)) - 4)
                 ELSE MAX(I.Item_Name) END AS Product,
            COUNT(O.order_no) AS Freq,
            SUM(CASE WHEN order_type LIKE '%Sales%' AND order_type NOT LIKE '%Transfer%' THEN QTY ELSE 0 END) AS Quantity,
            MAX(Item_Packaging) AS Packaging
        FROM TBL_Orders_Detail OD
        INNER JOIN tbl_orders O ON O.Order_No = OD.Order_No
        INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        INNER JOIN TBL_Category_File ON TBL_Category_File.Catg_ID = I.Catg_ID
        WHERE TBL_Category_File.group_ID = 2
          AND Order_Type LIKE '%Sales%'
          AND (CASE WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
                    THEN CONVERT(DATE, Order_Date)
                    ELSE CONVERT(DATE, Encode_DateTime) END) BETWEEN @StartDate AND @EndDate
        GROUP BY CASE WHEN LEN(I.Item_Name) > 4 THEN LEFT(I.Item_Name, LEN(I.Item_Name) - 4) ELSE I.Item_Name END
        ORDER BY COUNT(O.order_no) DESC`,
 
    'Procurement': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            NULL AS Encode,
            NULL AS Entity,
            DATEDIFF(day, O.Order_Date, @EndDate) AS DaysLacking,
            I.Item_Name,
            NULL AS Brand,
            SUM(OD.QTY) AS Quantity,
            I.Item_Packaging,
            I.Item_Org_Price,
            (SUM(OD.QTY) * I.Item_Org_Price) AS Total,
            'Lacking' AS Status
        FROM TBL_Orders_Detail OD
        INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
        INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE OD.QTY > 0
          AND O.Order_Date BETWEEN @StartDate AND @EndDate
        GROUP BY I.Item_Name, I.Item_Packaging, I.Item_Org_Price, O.Order_Date
        ORDER BY DATEDIFF(day, O.Order_Date, @EndDate) DESC`,
 
    'Procurement-Special': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            NULL AS Encode,
            NULL AS Entity,
            DATEDIFF(day, O.Order_Date, @EndDate) AS DaysLacking,
            I.Item_Name,
            NULL AS Brand,
            SUM(OD.QTY) AS Quantity,
            I.Item_Packaging,
            I.Item_Org_Price,
            SUM(OD.QTY * I.Item_Org_Price) AS Total,
            'Special Case' AS Status
        FROM TBL_Orders_Detail OD
        INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
        INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE OD.QTY > 0
          AND O.Order_Date BETWEEN @StartDate AND @EndDate
          AND I.Catg_ID IN (SELECT Catg_ID FROM TBL_Category_File WHERE group_ID = 3)
        GROUP BY I.Item_Name, I.Item_Packaging, I.Item_Org_Price, O.Order_Date
        ORDER BY DATEDIFF(day, O.Order_Date, @EndDate) DESC`,
 
    'Slow Moving': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            I.Item_Name,
            S.Item_QTY,
            I.Item_Packaging
        FROM TBL_Category_Item_File I
        INNER JOIN TBL_Stocks_Balances S ON I.Item_ID = S.Item_ID
        WHERE S.Item_QTY > 0
          AND I.Item_ID NOT IN (
              SELECT DISTINCT OD.Item_ID
              FROM TBL_Orders_Detail OD
              INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
              WHERE O.Order_Date BETWEEN @StartDate AND @EndDate
          )
        ORDER BY S.Item_QTY DESC`,
 
    'Out of Stocks': `
        SELECT DISTINCT
            I.Item_Name,
            S.Item_QTY,
            I.Item_Packaging,
            I.Item_Org_Price,
            (S.Item_QTY * I.Item_Org_Price) AS TotalValue
        FROM TBL_Category_Item_File I
        INNER JOIN TBL_Stocks_Balances S ON I.Item_ID = S.Item_ID
        WHERE S.Item_QTY > 0
          AND S.Item_QTY <= 2
        ORDER BY S.Item_QTY ASC`,
 
    'Discounted (Loyalty)': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            I.Item_Name,
            SUM(OD.QTY)              AS Qty,
            I.Item_Packaging,
            AVG(OD.Disc_Price)       AS AvgDisc,
            AVG(OD.Orig_Price)       AS AvgOrig,
            SUM(OD.Disc_Price * OD.QTY) AS TotalDisc,
            SUM(OD.Orig_Price * OD.QTY) AS TotalOrig
        FROM TBL_Orders_Detail OD
        INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
        INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE O.Order_Date BETWEEN @StartDate AND @EndDate
          AND OD.isLoyalty = 'Yes'
        GROUP BY I.Item_Name, I.Item_Packaging, I.Item_ID
        ORDER BY SUM(OD.Disc_Price * OD.QTY) DESC`,
 
    'Discounted (Senior)': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            I.Item_Name,
            SUM(OD.QTY)              AS Qty,
            I.Item_Packaging,
            AVG(OD.Disc_Price)       AS AvgDisc,
            AVG(OD.Orig_Price)       AS AvgOrig,
            SUM(OD.Disc_Price * OD.QTY) AS TotalDisc,
            SUM(OD.Orig_Price * OD.QTY) AS TotalOrig
        FROM TBL_Orders_Detail OD
        INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
        INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE O.Order_Date BETWEEN @StartDate AND @EndDate
          AND OD.isSenior = 'Yes'
        GROUP BY I.Item_Name, I.Item_Packaging, I.Item_ID
        ORDER BY SUM(OD.Disc_Price * OD.QTY) DESC`,
 
    'Expired': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            I.Item_Name,
            OD.Lot_No,
            OD.Exp_Date,
            I.Item_Org_Price,
            (OD.QTY * I.Item_Org_Price) AS TotalValue,
            OD.QTY
        FROM TBL_Orders_Detail OD
        INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE OD.QTY > 0
          AND TRY_CAST(OD.Exp_Date AS DATE) BETWEEN @StartDate AND @EndDate
        ORDER BY TRY_CAST(OD.Exp_Date AS DATE) ASC`,
 
    'Near Expiry': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            I.Item_Name,
            OD.Lot_No,
            OD.Exp_Date,
            I.Item_Org_Price,
            (OD.QTY * I.Item_Org_Price) AS Total,
            OD.QTY
        FROM TBL_Orders_Detail OD
        INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE TRY_CAST(OD.Exp_Date AS DATE) BETWEEN @StartDate AND @EndDate
          AND OD.QTY > 0
        ORDER BY TRY_CAST(OD.Exp_Date AS DATE) ASC`,
 
    'Top Peso Sold (Meds)': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            I.Item_Name,
            OD.Lot_No,
            OD.Exp_Date,
            SUM(OD.QTY * CASE WHEN OD.Disc_Price > 0 THEN OD.Disc_Price ELSE I.Item_Org_Price END) AS TotalSold
        FROM TBL_Orders_Detail OD
        INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
        INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE I.Catg_ID IN (392979, 564572, 91602, 81593)
          AND O.Order_Type LIKE '%Sorsogon%'
          AND CAST(O.Order_Date AS DATE) BETWEEN @StartDate AND @EndDate
        GROUP BY I.Item_Name, OD.Lot_No, OD.Exp_Date
        ORDER BY SUM(OD.QTY * CASE WHEN OD.Disc_Price > 0 THEN OD.Disc_Price ELSE I.Item_Org_Price END) DESC`,
 
    'Top Peso Sold (Supplies)': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            I.Item_Name,
            OD.Lot_No,
            OD.Exp_Date,
            SUM(OD.QTY * CASE WHEN OD.Disc_Price > 0 THEN OD.Disc_Price ELSE I.Item_Org_Price END) AS TotalSold
        FROM TBL_Orders_Detail OD
        INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
        INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE I.Catg_ID IN (272586, 322690, 202276, 91931, 101946, 91901, 493490, 91936, 91908)
          AND O.Order_Type LIKE '%Sorsogon%'
          AND CAST(O.Order_Date AS DATE) BETWEEN @StartDate AND @EndDate
        GROUP BY I.Item_Name, OD.Lot_No, OD.Exp_Date
        ORDER BY SUM(OD.QTY * CASE WHEN OD.Disc_Price > 0 THEN OD.Disc_Price ELSE I.Item_Org_Price END) DESC`,
 
    'High Peso Value': `
        SELECT
            CASE WHEN I.Catg_ID IN (392979, 564572, 91602, 101990, 81593)
                 THEN 'MEDICINES' ELSE 'SUPPLIES' END AS Type,
            I.Item_Name    AS Product,
            S.Item_QTY     AS Qty,
            I.Item_Org_Price AS Price,
            I.Item_WS_With_OR AS WSOR,
            I.Item_Retail_Price AS Retail
        FROM TBL_Category_Item_File I
        INNER JOIN TBL_Stocks_Balances S ON I.Item_ID = S.Item_ID
        WHERE S.Item_QTY > 0
          AND I.Catg_ID IN (392979, 564572, 91602, 101990, 81593,
                            272586, 322690, 202276, 91931, 101946,
                            91901, 493490, 91936, 91908)
        ORDER BY 1 ASC, I.Item_Org_Price DESC`,
 
    'Lacking Served': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            'GPFS'              AS Source,
            O.Order_No,
            OOS.OS_Client,
            OOS.OS_OrderType,
            I.Item_ID,
            I.Item_Name,
            O.Order_Remarks,
            OOS.OS_Quantity,
            OOS.OS_Quantity     AS LackingQty,
            ''                  AS Notes,
            O.Encoded_By
        FROM TBL_OutOfStock_Lacking OOS
        INNER JOIN TBL_Category_Item_File I ON OOS.OS_ID = I.Item_ID
        LEFT  JOIN TBL_Orders O ON OOS.OS_Client = O.Client_Name
        WHERE OOS.OS_OrderType LIKE '%Sorsogon%'
          AND OOS.OS_Date BETWEEN @StartDate AND @EndDate
        ORDER BY OOS.OS_Date DESC`,

    
};

// --- FORMATTING HELPERS ---
const PESO_KEYS = /price|total|value|sold|amount|cost|disc|orig/i;
const DATE_KEYS  = /date/i;

function formatCell(key, val) {
    if (val === null || val === undefined || val === '') return val;
    // Date formatting: MM/DD/YYYY
    if (DATE_KEYS.test(key) && (val instanceof Date || !isNaN(Date.parse(val)))) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const yyyy = d.getFullYear();
            return `${mm}/${dd}/${yyyy}`;
        }
    }
    // Peso formatting: prepend ₱ to numeric monetary fields
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
 * Uses the pool passed from the main server.
 */
async function syncQueryToSheet(pool, spreadsheetId, query, sheetName) {
    try {
        const result = await pool.request().query(query);
        const rows = result.recordset;

        const startAtRow6 = [
            'Out of Stocks', 'Expired', 'Near Expiry', 
            'Top Peso Sold (Meds)', 'Top Peso Sold (Supplies)'
        ];

        const startRow = (sheetName === 'High Peso Value') ? 5 : (startAtRow6.includes(sheetName) ? 6 : 5);

        // --- SPECIAL LOGIC: HIGH PESO VALUE (Meds on Left, Supplies on Right) ---
        if (sheetName === 'High Peso Value') {
            await sheetsApi.spreadsheets.values.batchClear({
                spreadsheetId,
                requestBody: { 
                    ranges: [
                        `'${sheetName}'!A${startRow}:F1000`, 
                        `'${sheetName}'!H${startRow}:M1000`
                    ] 
                }
            });

            if (rows && rows.length > 0) {
                // Formatting rows to match the sheet layout: [Empty, Product, Qty, Price, WSOR, Retail]
                const mapRow = (r) => [
                    '',
                    r.Product,
                    r.Qty,
                    formatCell('Price', r.Price),
                    formatCell('Price', r.WSOR),
                    formatCell('Price', r.Retail),
                ];
                const meds = rows.filter(r => r.Type === 'MEDICINES').map(mapRow);
                const supplies = rows.filter(r => r.Type === 'SUPPLIES').map(mapRow);

                const batchData = [];
                if (meds.length > 0) batchData.push({ range: `'${sheetName}'!A${startRow}`, values: meds });
                if (supplies.length > 0) batchData.push({ range: `'${sheetName}'!H${startRow}`, values: supplies });

                if (batchData.length > 0) {
                    await sheetsApi.spreadsheets.values.batchUpdate({
                        spreadsheetId,
                        requestBody: { data: batchData, valueInputOption: 'RAW' }
                    });
                    console.log(`✅ [${sheetName}] Side-by-side sync completed at Row ${startRow}.`);
                }
            } else {
                console.log(`⚠️ [${sheetName}] SKIPPED: No records found.`);
            }
        } 
        // --- STANDARD LOGIC: ALL OTHER SHEETS ---
        else {
            const dataRange = `'${sheetName}'!A${startRow}:Z1000`; 
            await sheetsApi.spreadsheets.values.clear({ spreadsheetId, range: dataRange });

            if (rows && rows.length > 0) {
                const values = rows.map(r => formatRow(r));
                await sheetsApi.spreadsheets.values.update({
                    spreadsheetId,
                    range: `'${sheetName}'!A${startRow}`,
                    valueInputOption: 'RAW',
                    requestBody: { values },
                });
                console.log(`✅ [${sheetName}] Data synced at Row ${startRow}.`);
            } else {
                console.log(`⚠️ [${sheetName}] SKIPPED: No records found.`);
            }
        }
    } catch (err) {
        console.error(`❌ [${sheetName}] Error:`, err.message);
    }
    // pool.close() is REMOVED. Server.js handles closing the connection after all tasks finish.
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

    const tabNames = Object.keys(queries);
    console.log(`📋 [PRD] Processing ${tabNames.length} tab(s)...`);
    for (let i = 0; i < tabNames.length; i++) {
        const tabName = tabNames[i];
        console.log(`   ⏳ [PRD] [${i+1}/${tabNames.length}] Syncing: "${tabName}"...`);
        await syncQueryToSheet(pool, currentSpreadsheetId, queries[tabName], tabName);
        await sleep(3000);
    }
    console.log('✨ [PRD] All tabs synced successfully.');
};