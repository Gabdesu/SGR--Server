const { google } = require('googleapis');
const { auth, DATE } = require('../../config');

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
            COUNT(O.order_no) AS "Freq.",
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
            COUNT(O.order_no) AS "Freq.",
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
            DATEDIFF(day, O.Order_Date, @EndDate) AS "Days Lacking",
            I.Item_Name AS Product,
            NULL AS Brand,
            SUM(OD.QTY) AS Quantity,
            I.Item_Packaging AS Packaging,
            I.Item_Org_Price AS "Unit Cost",
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
            I.Item_Name AS Product,
            NULL AS Brand,
            SUM(OD.QTY) AS Quantity,
            I.Item_Packaging AS Packaging,
            I.Item_Org_Price AS "Unit Cost",
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
            I.Item_Name AS Product,
            S.Item_QTY AS Quantity,
            I.Item_Packaging AS Packaging
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
            I.Item_Name AS Product,
            S.Item_QTY AS Quantity,
            I.Item_Packaging AS Packaging,
            I.Item_Org_Price AS "Price",
            (S.Item_QTY * I.Item_Org_Price) AS "Total"
        FROM TBL_Category_Item_File I
        INNER JOIN TBL_Stocks_Balances S ON I.Item_ID = S.Item_ID
        WHERE S.Item_QTY > 0
          AND S.Item_QTY <= 2
        ORDER BY S.Item_QTY ASC`,

    'Discounted (Loyalty)': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            I.Item_Name                 AS "Product Name",
            SUM(OD.QTY)                 AS Quantity,
            I.Item_Packaging            AS Packaging,
            AVG(OD.Disc_Price)          AS "Discounted Price",
            AVG(OD.Orig_Price)          AS "Original Price",
            SUM(OD.Disc_Price * OD.QTY) AS "Total Discounted",
            SUM(OD.Orig_Price * OD.QTY) AS "Total Original"
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
            I.Item_Name                 AS "Product Name",
            SUM(OD.QTY)                 AS Quantity,
            I.Item_Packaging            AS Packaging,
            AVG(OD.Disc_Price)          AS "Discounted Price",
            AVG(OD.Orig_Price)          AS "Original Price",
            SUM(OD.Disc_Price * OD.QTY) AS "Total Discounted",
            SUM(OD.Orig_Price * OD.QTY) AS "Total Original"
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
            I.Item_Name                 AS "Product Name",
            OD.Lot_No                   AS "Lot Number",
            OD.Exp_Date AS "Exp. Date",
            I.Item_Org_Price AS Capital,
            (OD.QTY * I.Item_Org_Price) AS Total,
            OD.QTY AS Quantity
        FROM TBL_Orders_Detail OD
        INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE OD.QTY > 0
          AND TRY_CAST(OD.Exp_Date AS DATE) BETWEEN @StartDate AND @EndDate
        ORDER BY TRY_CAST(OD.Exp_Date AS DATE) ASC`,

    'Near Expiry': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            I.Item_Name                AS "Product Name",
            OD.Lot_No                   AS "Lot Number",
            OD.Exp_Date AS "Exp. Date",
            I.Item_Org_Price AS Capital,
            (OD.QTY * I.Item_Org_Price) AS Total,
            OD.QTY AS Quantity
        FROM TBL_Orders_Detail OD
        INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE TRY_CAST(OD.Exp_Date AS DATE) BETWEEN @StartDate AND @EndDate
          AND OD.QTY > 0
        ORDER BY TRY_CAST(OD.Exp_Date AS DATE) ASC`,

    'Top Peso Sold (Meds)': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            I.Item_Name AS "Product Name",
            OD.Lot_No AS "Lot Number",
            OD.Exp_Date AS "Exp. Date",
            SUM(OD.QTY * CASE WHEN OD.Disc_Price > 0 THEN OD.Disc_Price ELSE I.Item_Org_Price END) AS Total
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
            I.Item_Name AS "Product Name",
            OD.Lot_No AS "Lot Number",
            OD.Exp_Date AS "Exp. Date",
            SUM(OD.QTY * CASE WHEN OD.Disc_Price > 0 THEN OD.Disc_Price ELSE I.Item_Org_Price END) AS Total
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
            I.Item_Name         AS "Product Name",
            S.Item_QTY          AS Qty,
            I.Item_Org_Price    AS Capital,
            I.Item_WS_With_OR   AS Distribution,
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
        'GPFS'           AS "Sales Category",
        O.Order_No       AS "Order No",
        OOS.OS_Client    AS "Entity",
        OOS.OS_OrderType AS "PO Details",
        I.Item_ID        AS "Item No",
        I.Item_Name      AS "Product Name",
        O.Order_Remarks  AS "Lacking Description",
        OOS.OS_Quantity  AS "Order Quantity",
        OOS.OS_Quantity  AS "Lacking Quantity",
        ''               AS "Purchasing Assigned",
        O.Encoded_By     AS "Encoder"
    FROM TBL_OutOfStock_Lacking OOS
    INNER JOIN TBL_Category_Item_File I ON OOS.OS_ID = I.Item_ID
    LEFT  JOIN TBL_Orders O ON OOS.OS_Client = O.Client_Name
    WHERE OOS.OS_OrderType LIKE '%Sorsogon%'
      AND OOS.OS_Date BETWEEN @StartDate AND @EndDate
    ORDER BY OOS.OS_Date DESC`,
};

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

            // ✅ Headers always defined outside if/else — always written regardless of records
            const hpvHeaders = ['', 'Product', 'Qty', 'Capital', 'Distribution', 'Retail'];

            if (rows && rows.length > 0) {
                const mapRow = (r) => [
                    '',
                    r.Product,
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

                // ✅ Even if both filtered arrays are empty, still write headers
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
                // ✅ No records at all — write headers only on both sides
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

            // ✅ Headers always extracted outside if/else — always written regardless of records
            const headers = Object.keys(result.recordset.columns);

            if (rows && rows.length > 0) {
                await sheetsApi.spreadsheets.values.update({
                    spreadsheetId,
                    range: `'${sheetName}'!A${START_ROW}`,
                    valueInputOption: 'RAW',
                    requestBody: {
                        values: [
                            headers,                        // ← Row 5 : header
                            ...rows.map(r => formatRow(r)), // ← Row 6+ : data
                        ]
                    },
                });
                console.log(`✅ [${sheetName}] Data synced (headers on Row ${START_ROW}, data from Row ${START_ROW + 1}).`);
            } else {
                // ✅ No records — write headers only
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