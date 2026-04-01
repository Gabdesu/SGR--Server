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
    const meta  = BRANCH_META[branchCode] || BRANCH_META['MBS'];
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
            THEN LEFT(MAX(I.Item_Name), LEN(MAX(I.Item_Name)) - 4) ELSE MAX(I.Item_Name) END as [Product], 
            COUNT(O.order_no) as [Freq.], 
            SUM(CASE WHEN order_type LIKE '%Sales%' AND order_type NOT LIKE '%Transfer%' THEN QTY ELSE 0 END) as [Quantity], 
            MAX(Item_Packaging) as [Packaging]
        FROM TBL_Orders_Detail OD 
        INNER JOIN tbl_orders O ON O.Order_No = OD.Order_No 
        INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        INNER JOIN TBL_Category_File ON TBL_Category_File.Catg_ID = I.Catg_ID
        WHERE TBL_Category_File.group_ID = 1 
        AND Order_Type LIKE '%Sales%' 
        AND (CASE WHEN Encode_DateTime IS NULL OR Encode_DateTime = '' THEN CONVERT(DATE, Order_Date) ELSE CONVERT(DATE, Encode_DateTime) END) BETWEEN @StartDate AND @EndDate
        GROUP BY CASE WHEN LEN(I.Item_Name) > 4 THEN LEFT(I.Item_Name, LEN(I.Item_Name) - 4) ELSE I.Item_Name END 
        ORDER BY COUNT(O.order_no) DESC`,

    'Fast Moving (Supplies)': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT TOP 100 
            CASE WHEN MAX(TBL_Category_File.group_ID) = 1 AND LEN(MAX(I.Item_Name)) > 4 
            THEN LEFT(MAX(I.Item_Name), LEN(MAX(I.Item_Name)) - 4) ELSE MAX(I.Item_Name) END as [Product], 
            COUNT(O.order_no) as [Freq.], 
            SUM(CASE WHEN order_type LIKE '%Sales%' AND order_type NOT LIKE '%Transfer%' THEN QTY ELSE 0 END) as [Quantity], 
            MAX(Item_Packaging) as [Packaging]
        FROM TBL_Orders_Detail OD 
        INNER JOIN tbl_orders O ON O.Order_No = OD.Order_No 
        INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        INNER JOIN TBL_Category_File ON TBL_Category_File.Catg_ID = I.Catg_ID
        WHERE TBL_Category_File.group_ID = 2 
        AND Order_Type LIKE '%Sales%' 
        AND (CASE WHEN Encode_DateTime IS NULL OR Encode_DateTime = '' THEN CONVERT(DATE, Order_Date) ELSE CONVERT(DATE, Encode_DateTime) END) BETWEEN @StartDate AND @EndDate
        GROUP BY CASE WHEN LEN(I.Item_Name) > 4 THEN LEFT(I.Item_Name, LEN(I.Item_Name) - 4) ELSE I.Item_Name END 
        ORDER BY COUNT(O.order_no) DESC`,

    'Procurement': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT NULL AS Encode, NULL AS Entity, DATEDIFF(day, O.Order_Date, @EndDate) AS [Days Lacking], I.Item_Name AS [Product Name], NULL AS Brand, SUM(OD.QTY) AS [Quantity], I.Item_Packaging AS [Packaging], I.Item_Org_Price AS [Unit Cost], (SUM(OD.QTY) * I.Item_Org_Price) AS [Total], 'Lacking' AS [Status]
        FROM TBL_Orders_Detail OD INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE OD.QTY > 0 AND O.Order_Date BETWEEN '2025-01-01' AND @EndDate
        GROUP BY I.Item_Name, I.Item_Packaging, I.Item_Org_Price, O.Order_Date ORDER BY DATEDIFF(day, O.Order_Date, @EndDate) DESC`,

    'Procurement-Special': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT NULL AS Encode, NULL AS Entity, DATEDIFF(day, O.Order_Date, @EndDate) AS [Days Lacking], I.Item_Name AS [Product Name], NULL AS Brand, SUM(OD.QTY) AS [Quantity], I.Item_Packaging AS [Packaging], I.Item_Org_Price AS [Unit Cost], (SUM(OD.QTY) * I.Item_Org_Price) AS [Total], 'Special Case' AS [Status]  
        FROM TBL_Orders_Detail OD INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE OD.QTY > 0 AND O.Order_Date BETWEEN '2025-01-01' AND @EndDate AND I.Catg_ID IN (SELECT Catg_ID FROM TBL_Category_File WHERE group_ID = 3)
        GROUP BY I.Item_Name, I.Item_Packaging, I.Item_Org_Price, O.Order_Date ORDER BY DATEDIFF(day, O.Order_Date, @EndDate) DESC`,

    'Slow Moving': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT I.Item_Name AS [Product Name], S.Item_QTY AS [Quantity], I.Item_Packaging AS [Packaging] FROM TBL_Category_Item_File I INNER JOIN TBL_Stocks_Balances S ON I.Item_ID = S.Item_ID
        WHERE S.Item_QTY > 0 AND I.Item_ID NOT IN (SELECT DISTINCT OD.Item_ID FROM TBL_Orders_Detail OD INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No WHERE O.Order_Date BETWEEN @StartDate AND @EndDate)
        ORDER BY S.Item_QTY DESC`,

    'Out of Stocks': `
        SELECT DISTINCT I.Item_Name AS [Product Name], S.Item_QTY AS [Quantity], I.Item_Packaging AS [Packaging], I.Item_Org_Price AS [Price], (S.Item_QTY * I.Item_Org_Price) AS [Total]
        FROM TBL_Category_Item_File I INNER JOIN TBL_Stocks_Balances S ON I.Item_ID = S.Item_ID
        WHERE S.Item_QTY > 0 AND S.Item_QTY <= 2 ORDER BY S.Item_QTY ASC`,

    'Discounted (Loyalty)': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT I.Item_Name AS [Product Name], SUM(OD.QTY) AS [Quantity], I.Item_Packaging AS [Packaging], AVG(OD.Disc_Price) AS [Discounted Price], AVG(OD.Orig_Price) AS [Original Price], SUM(OD.Disc_Price * OD.QTY) AS [Total Discounted], SUM(OD.Orig_Price * OD.QTY) AS [Total Original]
        FROM TBL_Orders_Detail OD INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID 
        WHERE O.Order_Date BETWEEN @StartDate AND @EndDate AND OD.isLoyalty = 'Yes' GROUP BY I.Item_Name, I.Item_Packaging, I.Item_ID ORDER BY SUM(OD.Disc_Price * OD.QTY) DESC`,

    'Discounted (Senior)': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT I.Item_Name AS [Product Name], SUM(OD.QTY) AS [Quantity], I.Item_Packaging AS [Packaging], AVG(OD.Disc_Price) AS [Discounted Price], AVG(OD.Orig_Price) AS [Original Price], SUM(OD.Disc_Price * OD.QTY) AS [Total Discounted], SUM(OD.Orig_Price * OD.QTY) AS [Total Original]
        FROM TBL_Orders_Detail OD INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID 
        WHERE O.Order_Date BETWEEN @StartDate AND @EndDate AND OD.isSenior = 'Yes' GROUP BY I.Item_Name, I.Item_Packaging, I.Item_ID ORDER BY SUM(OD.Disc_Price * OD.QTY) DESC`,

    'Expired': `
        SELECT I.Item_Name AS [Product Name], OD.Lot_No AS [Lot Number], OD.Exp_Date AS [Exp. Date], I.Item_Org_Price AS [Capital], (OD.QTY * I.Item_Org_Price) AS [Total], OD.QTY AS [Quantity]
        FROM TBL_Orders_Detail OD INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE OD.QTY > 0 AND (OD.Exp_Date = '02/2026' OR OD.Exp_Date = '2/2026') ORDER BY OD.Exp_Date ASC`,

    'Near Expiry': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT I.Item_Name AS [Product Name], OD.Lot_No AS [Lot Number], OD.Exp_Date AS [Exp. Date], I.Item_Org_Price AS [Capital], (OD.QTY * I.Item_Org_Price) AS [Total], OD.QTY AS [Quantity]
        FROM TBL_Orders_Detail OD INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE TRY_CAST(OD.Exp_Date AS DATE) BETWEEN @StartDate AND @EndDate AND OD.QTY > 0 ORDER BY TRY_CAST(OD.Exp_Date AS DATE) ASC`,

    'Top Peso Sold (Meds)': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT I.Item_Name AS [Product Name], OD.Lot_No AS [Lot Number], OD.Exp_Date AS [Exp. Date], SUM(OD.QTY * CASE WHEN OD.Disc_Price > 0 THEN OD.Disc_Price ELSE I.Item_Org_Price END) AS [Total]
        FROM TBL_Orders_Detail OD INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE I.Catg_ID IN (392979, 564572, 91602, 81593) AND O.Order_Type LIKE '%Masbate%' AND CAST(O.Order_Date AS DATE) BETWEEN @StartDate AND @EndDate
        GROUP BY I.Item_Name, OD.Lot_No, OD.Exp_Date ORDER BY SUM(OD.QTY * CASE WHEN OD.Disc_Price > 0 THEN OD.Disc_Price ELSE I.Item_Org_Price END) DESC`,

    'Top Peso Sold (Supplies)': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT I.Item_Name AS [Product Name], OD.Lot_No AS [Lot Number], OD.Exp_Date AS [Exp. Date], SUM(OD.QTY * CASE WHEN OD.Disc_Price > 0 THEN OD.Disc_Price ELSE I.Item_Org_Price END) AS [Total]
        FROM TBL_Orders_Detail OD INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        WHERE I.Catg_ID IN (272586, 322690, 202276, 91931, 101946, 91901, 493490, 91936, 91908) AND O.Order_Type LIKE '%Masbate%' AND O.Order_Date BETWEEN @StartDate AND @EndDate
        GROUP BY I.Item_Name, OD.Lot_No, OD.Exp_Date ORDER BY SUM(OD.QTY * CASE WHEN OD.Disc_Price > 0 THEN OD.Disc_Price ELSE I.Item_Org_Price END) DESC`,

    'High Peso Value': `
        SELECT CASE WHEN I.Catg_ID IN (392979, 564572, 91602, 101990, 81593) THEN 'MEDICINES' ELSE 'SUPPLIES' END AS [Type], 
        I.Item_Name AS [Product Name], S.Item_QTY AS [Qty], I.Item_Org_Price AS [Capital], I.Item_WS_With_OR AS [Distribution], I.Item_Retail_Price AS [Retail]
        FROM TBL_Category_Item_File I INNER JOIN TBL_Stocks_Balances S ON I.Item_ID = S.Item_ID
        WHERE S.Item_QTY > 0 AND I.Catg_ID IN (392979, 564572, 91602, 101990, 81593, 272586, 322690, 202276, 91931, 101946, 91901, 493490, 91936, 91908)
        ORDER BY 1 ASC, I.Item_Org_Price DESC`,

    'Lacking Served': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT 'GPFS' AS [Sales Category], O.Order_No AS [Order No], OOS.OS_Client AS [Entity], OOS.OS_OrderType AS [PO Details], I.Item_ID AS [Item No], I.Item_Name AS [Product Name], O.Order_Remarks AS [Lacking Description], OOS.OS_Quantity AS [Order Quantity], OOS.OS_Quantity AS [Lacking Quantity], '' AS [Purchasing Assigned], O.Encoded_By AS [Encoder]
        FROM TBL_OutOfStock_Lacking OOS INNER JOIN TBL_Category_Item_File I ON OOS.OS_ID = I.Item_ID LEFT JOIN TBL_Orders O ON OOS.OS_Client = O.Client_Name
        WHERE OOS.OS_OrderType LIKE '%Masbate%' ORDER BY OOS.OS_Date DESC`,

    'Canvass vs Encoded Audit': `
        DECLARE @SalesCategory VARCHAR(MAX);
        DECLARE @SalesDate_From Date; 
        DECLARE @SalesDate_To Date;
        
        SET @SalesCategory = '%GOVT%';
        SET @SalesDate_From = '${DATE.sql.start}';
        SET @SalesDate_To   = '${DATE.sql.end}';
        
        select 
        TBL_Orders_Detail.Order_No,
        TBL_Orders.Canvass_No,
        Client_Name,
        Client_Terms,
        OrderDetail_ItemNo,
        Product_Name,
        COALESCE((select CD_Misc_ProductName from  TBL_Canvass_Detail where TBL_Canvass_Detail.Canvass_No = TBL_Orders.Canvass_No and CD_Misc_itemNo = OrderDetail_ItemNo), '') as CanvassDesc,
        QTY,
        Unit_Measure,
        UOM_Qty,
        COALESCE((select TBL_Canvass_Detail.CD_Quantity from  TBL_Canvass_Detail where TBL_Canvass_Detail.Canvass_No = TBL_Orders.Canvass_No and CD_Misc_itemNo = OrderDetail_ItemNo), ''),
        COALESCE((select TBL_Canvass_Detail.CD_Packaging from  TBL_Canvass_Detail where TBL_Canvass_Detail.Canvass_No = TBL_Orders.Canvass_No and CD_Misc_itemNo = OrderDetail_ItemNo), ''),
        Encoded_By
        from TBL_Orders_Detail
        INNER JOIN TBL_Orders on TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
        WHERE 
            CASE
                WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
                    THEN CONVERT(DATE, Order_Date)
                ELSE CONVERT(DATE, Encode_DateTime)
            END BETWEEN @SalesDate_From AND @SalesDate_To
            and Order_Type like @SalesCategory
        order by TBL_Orders_Detail.Order_No`,
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

        // ── SPECIAL CASE: HIGH PESO VALUE (Meds left | Supplies right, both at A5 / H5) ──
        if (sheetName === 'High Peso Value') {
            const rows = result.recordset;

            await sheetsApi.spreadsheets.values.batchClear({
                spreadsheetId,
                requestBody: {
                    ranges: [
                        `'${sheetName}'!A5:F1000`,
                        `'${sheetName}'!H5:M1000`,
                    ]
                }
            });

            // Fixed header row for this custom layout (Type column is split into two panels)
            const HPV_HEADER = ['', 'Product', 'Qty', 'Capital', 'D', 'Retail'];

            // Custom row mapper: drop Type, prepend empty # column
            const mapRow = (r) => [
                '',
                r.Product,
                r.Qty,
                formatCell('Price', r.Capital),
                formatCell('Price', r.Distribution),
                formatCell('Price', r.Retail),
            ];

            const meds     = (rows || []).filter(r => r.Type === 'MEDICINES').map(mapRow);
            const supplies = (rows || []).filter(r => r.Type === 'SUPPLIES').map(mapRow);

            const batchData = [
                { range: `'${sheetName}'!A5`, values: [HPV_HEADER, ...meds]     },
                { range: `'${sheetName}'!H5`, values: [HPV_HEADER, ...supplies] },
            ];

            await sheetsApi.spreadsheets.values.batchUpdate({
                spreadsheetId,
                requestBody: { data: batchData, valueInputOption: 'RAW' }
            });

            if (rows && rows.length > 0) {
                console.log(`✅ [${sheetName}] Side-by-side sync complete. Meds: ${meds.length}, Supplies: ${supplies.length} row(s).`);
            } else {
                console.warn(`⚠️  [${sheetName}] 0 rows returned. Headers written at A5 and H5.`);
            }
            return;
        }

        // ── ALL OTHER SHEETS: header + data starting at A5 ───────────────────────
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