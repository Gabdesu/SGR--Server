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
    const meta  = BRANCH_META[branchCode] || BRANCH_META['IBS'];
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
-- The variables must be declared in the same batch as the query
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';
DECLARE @groupId INT = 1; -- Change to 2 for Supplies

SELECT TOP 100
    CASE 
        WHEN MAX(group_ID) = 1 AND LEN(MAX(TBL_Category_Item_File.Item_Name)) > 4 
        THEN LEFT(MAX(TBL_Category_Item_File.Item_Name), LEN(MAX(TBL_Category_Item_File.Item_Name)) - 4)
        ELSE MAX(TBL_Category_Item_File.Item_Name) 
    END as Product, 
    COUNT(tbL_orders.order_no) as Freq, 
    SUM(CASE WHEN order_type LIKE '%Sales%' AND order_type NOT LIKE '%Transfer%' THEN QTY ELSE 0 END) as Quantity,
    MAX(Item_Packaging) as Packaging
FROM TBL_Orders_Detail
INNER JOIN tbl_orders ON TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
INNER JOIN TBL_Category_Item_File ON TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
INNER JOIN TBL_Category_File ON TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
WHERE group_id = @groupId 
  AND Order_Type LIKE '%Sales%'
  AND Order_Type NOT LIKE '%Transfer%'
  AND Order_Date BETWEEN @StartDate AND @EndDate
GROUP BY 
    CASE 
        WHEN LEN(TBL_Category_Item_File.Item_Name) > 4 
        THEN LEFT(TBL_Category_Item_File.Item_Name, LEN(TBL_Category_Item_File.Item_Name) - 4)
        ELSE TBL_Category_Item_File.Item_Name 
    END
ORDER BY Freq DESC`,

    'Fast Moving (Supplies)': `
        USE [BCVR-IBS]

-- Declare variables in the same batch to avoid Msg 137
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';
DECLARE @groupId INT = 2; -- Group 2 = Supplies

SELECT TOP 100
    -- MAX is used here to ensure we pick the name for the group
    CASE 
        WHEN MAX(group_ID) = 1 AND LEN(MAX(TBL_Category_Item_File.Item_Name)) > 4 
        THEN LEFT(MAX(TBL_Category_Item_File.Item_Name), LEN(MAX(TBL_Category_Item_File.Item_Name)) - 4)
        ELSE MAX(TBL_Category_Item_File.Item_Name) 
    END as Product, 
    COUNT(tbL_orders.order_no) as Freq, 
    SUM(CASE WHEN order_type LIKE '%Sales%' AND order_type NOT LIKE '%Transfer%' THEN QTY ELSE 0 END) as Quantity,
    MAX(Item_Packaging) as Packaging
FROM TBL_Orders_Detail
INNER JOIN tbl_orders ON TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
INNER JOIN TBL_Category_Item_File ON TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
INNER JOIN TBL_Category_File ON TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
WHERE group_id = @groupId 
  AND Order_Type LIKE '%Sales%'
  AND Order_Type NOT LIKE '%Transfer%'
  AND Order_Date BETWEEN @StartDate AND @EndDate
GROUP BY 
    CASE 
        WHEN LEN(TBL_Category_Item_File.Item_Name) > 4 
        THEN LEFT(TBL_Category_Item_File.Item_Name, LEN(TBL_Category_Item_File.Item_Name) - 4)
        ELSE TBL_Category_Item_File.Item_Name 
    END
ORDER BY Freq DESC`,

    'Procurement': `
        
-- Set the monthly reporting window
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    NULL AS Encode,
    NULL AS Entity,
    -- Column C: Days since the order was placed relative to the end of your report month
    DATEDIFF(day, O.Order_Date, @EndDate) AS [Days Lacking],
    I.Item_Name AS Product,
    NULL AS Brand,
    SUM(OD.QTY) AS Quantity,
    I.Item_Packaging AS Packaging,
    -- Using the confirmed column name from your previous discovery:
    I.Item_Org_Price AS [Unit Cost], 
    (SUM(OD.QTY) * I.Item_Org_Price) AS Total,
    'Lacking' AS Status
FROM TBL_Orders_Detail OD
INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
WHERE OD.QTY > 0 
  -- Filters for orders specifically within your target month
  AND O.Order_Date BETWEEN @StartDate AND @EndDate
GROUP BY I.Item_Name, I.Item_Packaging, I.Item_Org_Price, O.Order_Date
ORDER BY [Days Lacking] DESC;`,

    'Procurement-Special': `

-- Set the monthly reporting window
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    NULL AS [Encode],               -- Column A
    NULL AS [Entity],               -- Column B
    -- Column C: Days since order relative to the end of the report month
    DATEDIFF(day, O.Order_Date, @EndDate) AS [Days Lacking], 
    I.Item_Name AS [Product],       -- Column D
    NULL AS [Brand],                -- Column E
    SUM(OD.QTY) AS [Quantity],      -- Column F
    I.Item_Packaging AS [Packaging],-- Column G
    I.Item_Org_Price AS [Unit Cost],-- Column H
    SUM(OD.QTY * I.Item_Org_Price) AS [Total], -- Column I
    'Special Case' AS [Status]      -- Column J
FROM TBL_Orders_Detail OD
INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
WHERE OD.QTY > 0 
  -- Filter for the specific month
  AND O.Order_Date BETWEEN @StartDate AND @EndDate
  -- Keeps your specific 'Special Case' logic (group_ID = 3)
  AND I.Catg_ID IN (SELECT Catg_ID FROM TBL_Category_File WHERE group_ID = 3)
GROUP BY I.Item_Name, I.Item_Packaging, I.Item_Org_Price, O.Order_Date
ORDER BY [Days Lacking] DESC;`,

    'Slow Moving': `

-- Set your reporting month
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

-- Calculate 90 days before the end of that month
DECLARE @90DaysBefore DATE = DATEADD(day, -90, @EndDate);

SELECT 
    I.Item_Name AS Product,         -- Column A
    S.Item_QTY AS Quantity,         -- Column B
    I.Item_Packaging AS Packaging   -- Column C
FROM TBL_Category_Item_File I
INNER JOIN TBL_Stocks_Balances S ON I.Item_ID = S.Item_ID
WHERE S.Item_QTY > 0  
AND I.Item_ID NOT IN (
    -- Exclude items that were sold in the 90-day window
    SELECT DISTINCT OD.Item_ID 
    FROM TBL_Orders_Detail OD
    INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
    WHERE O.Order_Date BETWEEN @90DaysBefore AND @EndDate
)
ORDER BY S.Item_QTY DESC;`,

    'Out of Stocks': `
-- Set the audit window
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';
DECLARE @Threshold INT = 2; -- Change this number to define what "Low" is

SELECT DISTINCT 
    I.Item_Name AS Product,
    S.Item_QTY AS Quantity,
    I.Item_Packaging AS Packaging,
    I.Item_Org_Price AS [Unit Price],
    (S.Item_QTY * I.Item_Org_Price) AS [Total Value]
FROM TBL_Category_Item_File I
INNER JOIN TBL_Stocks_Balances S ON I.Item_ID = S.Item_ID
WHERE S.Item_QTY > 0             -- Must have SOME stock
  AND S.Item_QTY <= @Threshold    -- But less than or equal to 10
ORDER BY S.Item_QTY ASC;          -- Show the most urgent ones first`,

    'Discounted (Loyalty)': `
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    I.Item_Name AS [Product_Name],                       -- Column 1
    SUM(OD.QTY) AS [Quantity],                           -- Column 2
    I.Item_Packaging AS [Packaging],                     -- Column 3
    AVG(OD.Disc_Price) AS [Discounted Price],            -- Column 4
    AVG(OD.Orig_Price) AS [Original Price],              -- Column 5 (FIXED)
    SUM(OD.Disc_Price * OD.QTY) AS [Total Discounted],   -- Column 6
    SUM(OD.Orig_Price * OD.QTY) AS [Total Original]       -- Column 7 (FIXED)
FROM TBL_Orders_Detail OD
INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID 
WHERE O.Order_Date BETWEEN @StartDate AND @EndDate
  AND OD.isLoyalty = 'Yes' 
GROUP BY I.Item_Name, I.Item_Packaging, I.Item_ID 
ORDER BY [Total Discounted] DESC;`,

    'Discounted (Senior)': `
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    I.Item_Name AS [Product_Name],
    SUM(OD.QTY) AS [Quantity],
    I.Item_Packaging AS [Packaging],
    AVG(OD.Disc_Price) AS [Discounted Price],
    AVG(OD.Orig_Price) AS [Original Price],
    SUM(OD.Disc_Price * OD.QTY) AS [Total Discounted],
    SUM(OD.Orig_Price * OD.QTY) AS [Total Original]
FROM TBL_Orders_Detail OD
INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID 
WHERE O.Order_Date BETWEEN @StartDate AND @EndDate
  AND OD.isSenior = 'Yes' 
GROUP BY I.Item_Name, I.Item_Packaging, I.Item_ID 
ORDER BY [Total Discounted] DESC;`,


    'Expired': `
-- Set the audit window (February 2026)
DECLARE @TargetMonth NVARCHAR(7) = '02/2026'; -- Matches your "Exp. Date" format
DECLARE @TargetMonthAlt NVARCHAR(7) = '02/2026'; -- Matches the single digit format

SELECT 
    I.Item_Name AS [Product Name],      -- Column A
    OD.Lot_No AS [Lot Number],          -- Column B
    OD.Exp_Date AS [Exp. Date],         -- Column C
    I.Item_Org_Price AS [Capital],      -- Column D
    (OD.QTY * I.Item_Org_Price) AS [Total], -- Column E
    OD.QTY AS [Quantity]                -- Column F
FROM TBL_Orders_Detail OD
INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
WHERE OD.QTY > 0 
  -- Find items that expired in or before Feb 2026 based on your text format
  AND (OD.Exp_Date = @TargetMonth OR OD.Exp_Date = @TargetMonthAlt)
ORDER BY OD.Exp_Date ASC;`,

    'Near Expiry': `
-- Set your reporting window here
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    I.Item_Name AS [Product Name],                  
    OD.Lot_No AS [Lot Number],                      
    OD.Exp_Date AS [Exp. Date],                     
    I.Item_Org_Price AS [Capital],                 
    (OD.QTY * I.Item_Org_Price) AS [Total],         
    OD.QTY AS [Quantity]                            
FROM TBL_Orders_Detail OD
INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
WHERE TRY_CAST(OD.Exp_Date AS DATE) BETWEEN @StartDate AND DATEADD(day, 30, @StartDate)
  AND OD.QTY > 0
ORDER BY TRY_CAST(OD.Exp_Date AS DATE) ASC;`,

    'Top Peso Sold (Meds)': `

-- Set the 2025 audit window
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT TOP 30
    I.Item_Name AS [Product Name],
    OD.Lot_No AS [Lot Number],
    OD.Exp_Date AS [Exp. Date],
    -- Calculation: Priority to Disc_Price, fallback to Item_Org_Price, fallback to 0 to avoid NULLs
    SUM(OD.QTY * ISNULL(CASE 
        WHEN OD.Disc_Price > 0 THEN OD.Disc_Price 
        ELSE I.Item_Org_Price 
    END, 0)) AS [Total]
FROM TBL_Orders_Detail OD
INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
-- Using your confirmed Medicine Catg_IDs
WHERE I.Catg_ID IN (392979, 564572, 91602, 81593) 
  AND (O.Order_Type LIKE '%Iriga%' OR O.Order_Type LIKE '%BFGS%')
  AND O.Order_Type NOT LIKE '%Transfer%'
  AND CAST(O.Order_Date AS DATE) BETWEEN @StartDate AND @EndDate
GROUP BY 
    I.Item_Name, 
    OD.Lot_No,  
    OD.Exp_Date
ORDER BY [Total] DESC`,

    'Top Peso Sold (Supplies)': `

-- Set the 2025 audit window
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT TOP 30
    I.Item_Name AS [Product Name],
    OD.Lot_No AS [Lot Number],
    OD.Exp_Date AS [Exp. Date],
    -- Calculation: Total Peso value only
    SUM(OD.QTY * ISNULL(CASE 
        WHEN OD.Disc_Price > 0 THEN OD.Disc_Price 
        ELSE I.Item_Org_Price 
    END, 0)) AS [Total]
FROM TBL_Orders_Detail OD
INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
INNER JOIN TBL_Category_File C ON C.Catg_ID = I.Catg_ID
-- Targeted to Supplies/Consumables
WHERE (C.Catg_Name LIKE '%SUPPLY%' OR C.Catg_Name LIKE '%CONSUMABLE%')
  AND (O.Order_Type LIKE '%Iriga%' OR O.Order_Type LIKE '%BFGS%')
  AND O.Order_Type NOT LIKE '%Transfer%'
  AND CAST(O.Order_Date AS DATE) BETWEEN @StartDate AND @EndDate
GROUP BY 
    I.Item_Name, 
    OD.Lot_No, 
    OD.Exp_Date
ORDER BY [Total] DESC`,

    'High Peso Value': `
-- MEDICINES SECTION
SELECT 
    'MEDICINES' AS [Type],
    I.Item_Name AS [Product Name],
    ISNULL(S.Item_QTY, 0) AS [Qty],
    ISNULL(I.Item_Org_Price, 0) AS [Capital],      
    ISNULL(I.Item_WS_With_OR, 0) AS [Distribution], 
    ISNULL(I.Item_Retail_Price, 0) AS [Retail]      
FROM TBL_Category_Item_File I
LEFT JOIN TBL_Stocks_Balances S ON I.Item_ID = S.Item_ID
INNER JOIN TBL_Category_File C ON C.Catg_ID = I.Catg_ID
WHERE (
    C.Catg_Name LIKE '%PHARMA%' 
    OR C.Catg_Name LIKE '%MED%' 
    OR I.Catg_ID IN (572975, 613224, 613276, 623346, 81593, 81591, 81592)
)
AND I.Item_Org_Price > 0 

UNION ALL

-- SUPPLIES SECTION
SELECT 
    'SUPPLIES' AS [Type],
    I.Item_Name AS [Product Name],
    ISNULL(S.Item_QTY, 0) AS [Qty],
    ISNULL(I.Item_Org_Price, 0) AS [Capital],      
    ISNULL(I.Item_WS_With_OR, 0) AS [Distribution], 
    ISNULL(I.Item_Retail_Price, 0) AS [Retail]      
FROM TBL_Category_Item_File I
LEFT JOIN TBL_Stocks_Balances S ON I.Item_ID = S.Item_ID
INNER JOIN TBL_Category_File C ON C.Catg_ID = I.Catg_ID
WHERE (
    C.Catg_Name LIKE '%SUPPLY%' 
    OR C.Catg_Name LIKE '%CONSUMABLE%'
)
AND I.Item_Org_Price > 0

ORDER BY [Type] ASC, [Capital] DESC;`,

    'Lacking Served': `

    DECLARE @StartDate DATE = '${DATE.sql.start}';
    DECLARE @EndDate   DATE = '${DATE.sql.end}';
SELECT 
    -- Static label for your spreadsheet
    'GPFS' AS [Sales Category],
    
    OL.Order_No AS [Order No],             -- Column B
    OL.OL_Entity AS [Entity],              -- Column C
    OL.OL_Details AS [PO Details],         -- Column D
    I.Item_ID AS [Item No],                -- Column E
    I.Item_Name AS [Product Name],         -- Column F
    OL.OL_Details AS [Lacking Description],-- Column G
    
    -- Quantities from the Lacking table
    1 AS [Order Quantity],                 -- Fallback if Qty column is missing
    OL.Total_Lacking AS [Lacking Quantity],-- Column I
    
    '' AS [Purchasing Assigned],           -- Column J
    OL.OL_Encoder AS [Encoder]             -- Column K

FROM TBL_Orders_Lacking OL
-- Joining with the Item File to get the standard ID and Name
LEFT JOIN TBL_Category_Item_File I ON OL.OL_Details LIKE '%' + I.Item_Name + '%'
-- Filtering for recent Iriga branch data (2025-2026)
WHERE CAST(OL.OL_Completion_Date AS DATE) >= @StartDate
ORDER BY OL.OL_Completion_Date DESC;`,

'Canvass vs Encoded Audit': `
DECLARE @SalesCategory VARCHAR(MAX) = '%GOVT%';
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    o.Order_No AS [Order No],
    o.Canvass_No AS [Canvas\nNo],
    o.Client_Name AS [Entity],
    o.Client_Terms AS [PO Details], -- Mapping to spreadsheet column D
    od.OrderDetail_ItemNo AS [#],
    od.Product_Name AS [Product Description],
    COALESCE(cd.CD_Misc_ProductName, '') AS [Canvass Description],
    od.QTY AS [Order Qt],
    od.Unit_Measure AS [Packaging],
    od.UOM_Qty AS [QTY/PC],
    COALESCE(cd.CD_Quantity, 0) AS [Canvass Qty],
    COALESCE(cd.CD_Packaging, '') AS [Canvass Packaging],
    o.Encoded_By AS [Encoder]
FROM TBL_Orders_Detail od
INNER JOIN TBL_Orders o ON o.Order_No = od.Order_No
-- Using LEFT JOIN instead of subqueries for much better speed
LEFT JOIN TBL_Canvass_Detail cd ON cd.Canvass_No = o.Canvass_No 
    AND cd.CD_Misc_itemNo = od.OrderDetail_ItemNo
WHERE 
    -- Since 'Encode_DateTime' doesn't exist, we filter by Order_Date
    CONVERT(DATE, o.Order_Date) BETWEEN @StartDate AND @EndDate
    AND o.Order_Type LIKE @SalesCategory
ORDER BY o.Order_No, od.OrderDetail_ItemNo`
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
 * Uses the pool passed from the main server.
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