const { google } = require('googleapis');
const { auth, DATE } = require('../../config');

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

// --- SQL QUERY REPOSITORY ---
const queries = {
    // Retrieves the top 100 medicine items with the highest transaction frequency
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
    OL_BookingDate,
    OL_Entity AS 'Entity',
    DATEDIFF(DAY, OL_BookingDate, @EndDate) as Days_Lacking,
    Item_Description AS 'Product',
    Item_Brand AS 'Brand',
    Quantity,
    Item_Packaging,
    Unit_Cost 'Unit Cost',
    Unit_Total AS 'Total',
    Item_Status AS Status
FROM TBL_Orders_Lacking_Details
INNER JOIN TBL_Orders_Lacking
    ON TBL_Orders_Lacking.OL_ID = TBL_Orders_Lacking_Details.OL_ID
WHERE
    (Item_Status != 'Served'
     AND Item_Status != 'Changed Item'
     AND Item_Status != 'Waived')
    and OL_BookingDate <= @EndDate
ORDER BY Item_Description`,

    'Procurement-Special': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
    OL_BookingDate,
    OL_Entity AS 'Entity',
    DATEDIFF(DAY, OL_BookingDate, @EndDate) as Days_Lacking,
    Item_Description AS 'Product',
    Item_Brand AS 'Brand',
    Quantity,
    Item_Packaging,
    Unit_Cost 'Unit Cost',
    Unit_Total AS 'Total',
    Item_Status AS Status
FROM TBL_Orders_Lacking_Details
INNER JOIN TBL_Orders_Lacking
    ON TBL_Orders_Lacking.OL_ID = TBL_Orders_Lacking_Details.OL_ID
WHERE
    (Item_Status = 'Changed Item'
     AND Item_Status = 'Waived')
    and OL_BookingDate <= @EndDate
ORDER BY Item_Description;
`,

    'Slow Moving': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        select top 100 
Item_Name, 
sum(TBL_Stocks_Balances.Item_QTY) as Quantity, 
max(Item_Packaging) as Packaging
from TBL_Stocks_Balances
inner join TBL_Category_Item_File on TBL_Category_Item_File.Item_ID = TBL_Stocks_Balances.Item_ID
where Item_Name not in (
select Item_Name from TBL_Orders_Detail
inner join tbl_orders on tbl_orders.order_no = TBL_Orders_Detail.order_no
inner join TBL_Category_Item_File on TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
where  CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END
BETWEEN @StartDate
    AND @EndDate
and order_type like '%Sales%'
)
and TBL_Stocks_Balances.Item_QTY > 0
and Item_Name not like '%Loose%'
group by Item_Name
order by sum(TBL_Stocks_Balances.Item_QTY) desc`,

    'Out of Stocks': `
    DECLARE @StartDate DATE = '${DATE.sql.start}';
    DECLARE @EndDate   DATE = '${DATE.sql.end}';
        Select 
CONCAT(TRIM(OS_Product_Name), ' ', OS_Brand) as Product,  
sum(OS_Quantity) as Qty, 
MAX(OS_Unit) as Unit, 
CASE WHEN SUM(OS_Price * OS_Quantity) = 0 Then 0 else SUM(OS_Price * OS_Quantity) / sum(OS_Quantity) end,
SUM(OS_Price * OS_Quantity) as Total
from TBL_OutOfStock_Lacking
where OS_date >= @StartDate and OS_date <= @EndDate
group by CONCAT(TRIM(OS_Product_Name), ' ', OS_Brand)`,

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
    CONCAT(TBL_Category_Item_File.Item_Name, ' ', TBL_Category_File.Catg_Name) AS Item_Name,
    CASE 
        WHEN LEFT(TBL_category_item_file.Item_Description, 4) = 'BCVR' THEN '-' 
        ELSE TBL_category_item_file.Item_Description 
    END AS 'Item_Description',
    REPLACE(FORMAT(TBL_Category_Item_File.Item_Exp_Date, 'MM/yyyy'), '01/2040', '-') AS Item_Exp_Date,
    TBL_Category_Item_File.Item_Price AS Capital,
    TBL_Category_Item_File.Item_Price * TBL_Stocks_Balances.Item_QTY AS Total,
    CONCAT(TBL_Stocks_Balances.Item_QTY, ' ', Item_packaging) AS Quantity
FROM TBL_Category_Item_File
INNER JOIN TBL_Stocks_Balances ON TBL_Stocks_Balances.Item_ID = TBL_Category_Item_File.Item_ID
INNER JOIN TBL_Category_File ON TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
WHERE Item_Exp_Date <= CAST(EOMONTH(DATEADD(MONTH, 10, GETDATE())) AS DATETIME)
    AND TBL_Stocks_Balances.Item_QTY > 0
ORDER BY TBL_Category_Item_File.Item_Exp_Date, Item_Name`,

    'Near Expiry': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT 
    CONCAT(TBL_Category_Item_File.Item_Name, ' ', TBL_Category_File.Catg_Name) AS Item_Name,
    CASE 
        WHEN LEFT(TBL_category_item_file.Item_Description, 4) = 'BCVR' THEN '-' 
        ELSE TBL_category_item_file.Item_Description 
    END AS 'Item_Description',
    REPLACE(FORMAT(TBL_Category_Item_File.Item_Exp_Date, 'MM/yyyy'), '01/2040', '-') AS Item_Exp_Date,
    TBL_Category_Item_File.Item_Price AS Capital,
    TBL_Category_Item_File.Item_Price * TBL_Stocks_Balances.Item_QTY AS Total,
    CONCAT(TBL_Stocks_Balances.Item_QTY, ' ', Item_packaging) AS Quantity
FROM TBL_Category_Item_File
INNER JOIN TBL_Stocks_Balances ON TBL_Stocks_Balances.Item_ID = TBL_Category_Item_File.Item_ID
INNER JOIN TBL_Category_File ON TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
WHERE Item_Exp_Date <= CAST(EOMONTH(DATEADD(MONTH, -1, GETDATE())) AS DATETIME)
    AND TBL_Stocks_Balances.Item_QTY > 0
ORDER BY TBL_Category_Item_File.Item_Exp_Date, Item_Name`,

    'Top Peso Sold (Meds)': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        select top 100
CONCAT(Item_Name, ' ', Catg_Name) as Product,
SUM(QTY) as Quantity,
MAX(Item_Packaging) as Packaging,
sum(total_Cost) as Total
		from TBL_Orders_Detail
		inner join tbl_orders on TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
		inner join TBL_Category_Item_File on TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
		inner join TBL_Category_File on TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
where group_id = 1 and Order_Type like '%Sales%'
and Order_Type not like '%Transfer%'
and CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END
BETWEEN @StartDate
    AND @EndDate
--and Item_Preparation in (
--SELECT PrepType FROM @Preparation
--)
group by CONCAT(Item_Name, ' ', Catg_Name)
order by sum(total_Cost) desc`,

    'Top Peso Sold (Supplies)': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        select top 100
CONCAT(Item_Name, ' ', Catg_Name) as Product,
SUM(QTY) as Quantity,
MAX(Item_Packaging) as Packaging,
sum(total_Cost) as Total
		from TBL_Orders_Detail
		inner join tbl_orders on TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
		inner join TBL_Category_Item_File on TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
		inner join TBL_Category_File on TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
where group_id = 2 and Order_Type like '%Sales%'
and Order_Type not like '%Transfer%'
and CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END
BETWEEN @StartDate
    AND @EndDate
--and Item_Preparation in (
--SELECT PrepType FROM @Preparation
--)
group by CONCAT(Item_Name, ' ', Catg_Name)
order by sum(total_Cost) desc
`,

    'Lacking Served': `
    DECLARE @StartDate DATE = '${DATE.sql.start}';
    DECLARE @EndDate   DATE = '${DATE.sql.end}';
    SELECT 
    
    max(LEFT(Order_type, 4)) as Order_type,
    Max(TBL_Orders_Detail.Order_No) as Order_No,
    MAX(Client_Name) as Entity, 
    MAX(Client_Terms) as PO_Details,
    MAX(TBL_Orders_Detail.OrderDetail_ItemNo) as Item_No,
    TBL_Orders_Detail.Product_Name,
    MAX(TBL_Orders_Lacking_Details.Item_Description) as Lacking_Description,
    MAX(TBL_Orders_Detail.Remarks) as Remarks,
    MAX(TBL_Orders_Detail.QTY) as Order_Quantity,
    sum(TBL_Orders_Lacking_Details.Quantity) as Lacking_Quantity,
    max(OL_Purchasing) as Purchasing_Assigned,
    max(OL_Encoder)
    
FROM TBL_Orders_Detail
INNER JOIN TBL_Orders ON TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
INNER JOIN TBL_Orders_Lacking ON TBL_Orders_Lacking.Order_No = TBL_Orders_Detail.Order_No
INNER JOIN TBL_Orders_Lacking_Details ON TBL_Orders_Lacking_Details.OL_ID = TBL_Orders_Lacking.OL_ID
WHERE CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END BETWEEN @StartDate AND @EndDate
    AND Order_Type LIKE '%GOVT%'
    and Item_No = OrderDetail_ItemNo
    group by Order_Dtl, TBL_Orders_Detail.Product_Name`,
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