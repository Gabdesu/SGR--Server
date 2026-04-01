const { google } = require('googleapis');
const { auth, DATE } = require('../../config'); // Use the shared auth from config

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
    const meta  = BRANCH_META[branchCode] || BRANCH_META['SBS','MBS','IBS'];
    
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

// --- SQL QUERY REPOSITORY ---
const queries = {
    'SWRS-Delivered': `
       -- Report for March 2026
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    Order_Date AS [Order Date],                   -- Column A
    Client_Name AS [Client Name],                 -- Column B
    Client_Address AS [Client Address],           -- Column C
    Misc_NOAdate AS [Non-official Invoice],       -- Column D
    Misc_SalesInvoice AS [Sales Invoice],         -- Column E
    Misc_DeliveryReceipt AS [Official Delivery Receipt], -- Column F
    
    -- Using Order_Status or Remarks as a placeholder for Charge Invoice if empty
    '' AS [Charge Invoice],                       -- Column G 
    
    -- Adjustment Placeholders (Columns H through N)
    0.00 AS [DM],
    0.00 AS [MSDE],
    0.00 AS [GM],
    0.00 AS [LSAE],
    0.00 AS [OSEF],
    0.00 AS [ASME],
    0.00 AS [REEV],
    
    PO_Amount AS [Total Peso Sale]                -- Column O
FROM TBL_Orders
WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
  AND (Order_Type LIKE '%Sorsogon Wholesale Retail Sales%' 
       OR Order_Type LIKE '%SWRS%')               -- Matches your sheet header
ORDER BY Order_Date ASC`,

'SWRS-Collected': `
-- Report for March 2026
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    Order_No AS [Order No],                    -- Column A
    Order_Date AS [Booking Date],              -- Column B
    Misc_PODate AS [Payment Date],             -- Column C (Mapped based on schema)
    '' AS [Check Date],                        -- Column D (Manual entry or placeholder)
    Client_Name AS [Entity],                   -- Column E
    Order_Type AS [Order Details],             -- Column F
    Misc_NOAdate AS [Non-official Invoice],    -- Column G
    Misc_SalesInvoice AS [Sales Invoice],      -- Column H
    Misc_DeliveryReceipt AS [Delivery Receipt],-- Column I
    '' AS [Charge Invoice],                    -- Column J (Confirmed missing in previous error)
    
    -- Payment & Financial Details
    Order_Payment_Status AS [Payment Type],    -- Column K
    '' AS [Bank Details],                      -- Column L
    0.00 AS [Discount],                        -- Column M
    0.00 AS [Return],                          -- Column N
    0.00 AS [Rebates],                         -- Column O
    0.00 AS [Tax],                             -- Column P
    0.00 AS [Other Charges],                   -- Column Q
    
    PO_Amount AS [Sales Delivered],            -- Column R
    Payment_Amount AS [Net Collected]          -- Column S
FROM TBL_Orders
WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
  AND (Order_Type LIKE '%Sorsogon%' OR Order_Type LIKE '%SWRS%')
ORDER BY Order_Date ASC`,


'SFGS-Booking': `
-- Reports
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    O.Order_Date AS [Booking Date],              -- Column A
    
    -- Categorizing based on your previously identified IDs
    CASE 
        WHEN I.Catg_ID IN (392979, 564572, 91602, 101990, 81593) THEN 'MEDICINES'
        WHEN I.Catg_ID IN (272586, 322690, 202276, 91931, 101946, 91901, 493490, 91936, 91908) THEN 'SUPPLIES'
        ELSE 'OTHER'
    END AS [Sales Category],                     -- Column B
    
    O.Client_Name AS [Entity],                   -- Column C
    O.Client_Address AS [End User],               -- Column D (Often used as End User in your sheet)
    O.Order_Type AS [PO Details],                -- Column E
    
    -- Financials
    O.PO_Amount AS [PO Amount],                  -- Column F
    O.Payment_Amount AS [Total Delivered]        -- Column G
    
FROM TBL_Orders O
INNER JOIN TBL_Orders_Detail OD ON O.Order_No = OD.Order_No
INNER JOIN TBL_Category_Item_File I ON OD.Item_ID = I.Item_ID
WHERE (CAST(O.Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
  -- Filtering specifically for SFGS (Government Sales)
  AND (O.Order_Type LIKE '%Sorsogon Field Government%' OR O.Order_Type LIKE '%SFGS%')
ORDER BY O.Order_Date ASC`,


'SFGS-Delivered': `

-- Report for March 2026
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    Order_Date AS [Order Date],                   -- Column A
    Client_Name AS [Client Name],                 -- Column B
    Client_Address AS [Client Address],           -- Column C
    Misc_NOAdate AS [Non-official Invoice],       -- Column D
    Misc_SalesInvoice AS [Sales Invoice],         -- Column E
    Misc_DeliveryReceipt AS [Official Delivery Receipt], -- Column F
    '' AS [Charge Invoice],                       -- Column G (Manual Entry)
    
    -- Adjustment Placeholders (Columns H through N)
    0.00 AS [DM],
    0.00 AS [MSDE],
    0.00 AS [GM],
    0.00 AS [LSAE],
    0.00 AS [OSEF],
    0.00 AS [ASME],
    0.00 AS [REEV],
    
    PO_Amount AS [Total Peso Sale]                -- Column O
FROM TBL_Orders
WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
  -- Specific filter for Government Sales
  AND (Order_Type LIKE '%Sorsogon Field Government%' OR Order_Type LIKE '%SFGS%')
ORDER BY Order_Date ASC`,


'SFGS-Collected': `

-- Report for March 2026
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    O.Order_No AS [Order No],                    
    O.Order_Date AS [Booking Date],              
    O.Misc_PODate AS [Payment Date],             
    '' AS [Check Date],                          
    O.Client_Name AS [Procuring Entity],         
    O.Order_Type AS [Order Details],             
    -- Fixed: Using CAST to ensure the concatenation treats everything as text
    'Order Slip#' + CAST(O.Order_No AS VARCHAR(20)) AS [Non-official Invoice], 
    O.Misc_SalesInvoice AS [Sales Invoice],      
    O.Misc_DeliveryReceipt AS [Official Delivery Receipt],
    '' AS [Charge Invoice],                      
    
    -- Document Tracking
    O.Misc_RFQDate AS [RFQ Date],                
    O.Misc_PQDate AS [PQ Date],                  
    O.Misc_NOAdate AS [NOA Date],                
    O.Misc_NTPdate AS [NTP Date],                
    O.Misc_PODate AS [PO Date],                  
    
    -- Financials
    O.Order_Payment_Status AS [Payment Type],    
    0.00 AS [Tax Amount],                        
    O.PO_Amount AS [Stocks Delivered],           
    O.Payment_Amount AS [Net Collected]          

FROM TBL_Orders O
WHERE (CAST(O.Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
  AND (O.Order_Type LIKE '%Sorsogon Field Government%' OR O.Order_Type LIKE '%SFGS%')
ORDER BY O.Order_Date ASC`,


'Top 30': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';

        -- 1. TOP 30 BOOKING (Columns B, C, D)
        SELECT TOP 30 'SWRS' AS [BOSC], Client_Name AS [Entity], SUM(ISNULL(PO_Amount, 0)) AS [Total PO]
        FROM TBL_Orders WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
        AND (Order_Type LIKE '%Sorsogon%' OR Order_Type LIKE '%SWRS%')
        GROUP BY Client_Name ORDER BY SUM(ISNULL(PO_Amount, 0)) DESC;

        -- 2. TOP 30 DELIVERED (Columns H, I, J)
        SELECT TOP 30 'SWRS' AS [BOSC], Client_Name AS [Entity], SUM(CASE WHEN Misc_DeliveryReceipt IS NOT NULL THEN ISNULL(PO_Amount, 0) ELSE 0 END) AS [Total Delivered]
        FROM TBL_Orders WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
        AND (Order_Type LIKE '%Sorsogon%' OR Order_Type LIKE '%SWRS%')
        GROUP BY Client_Name ORDER BY SUM(ISNULL(PO_Amount, 0)) DESC;

        -- 3. TOP 30 COLLECTED (Columns M, N, O)
        SELECT TOP 30 'SWRS' AS [BOSC], Client_Name AS [Entity], SUM(ISNULL(Payment_Amount, 0)) AS [Total Collected]
        FROM TBL_Orders WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
        AND (Order_Type LIKE '%Sorsogon%' OR Order_Type LIKE '%SWRS%')
        GROUP BY Client_Name ORDER BY SUM(ISNULL(PO_Amount, 0)) DESC;`,


'Top AR': `
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT TOP 30
    '' AS [#],              -- Empty Column A Placeholder
    'SWRS' AS [BOSC],       -- Column B
    Client_Name AS [Entity], -- Column C
    SUM(ISNULL(PO_Amount, 0)) - SUM(ISNULL(Payment_Amount, 0)) AS [Total Balance] -- Column D
FROM TBL_Orders
WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
  AND (Order_Type LIKE '%Sorsogon%' OR Order_Type LIKE '%SWRS%')
GROUP BY Client_Name
HAVING SUM(ISNULL(PO_Amount, 0)) - SUM(ISNULL(Payment_Amount, 0)) > 0
ORDER BY [Total Balance] DESC`,


'Top Inactive': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT TOP 30
    '' AS [#],              -- Empty Column A Placeholder
    CASE 
        WHEN Order_Type LIKE '%Government%' OR Order_Type LIKE '%SFGS%' THEN 'SFGS'
        ELSE 'SWRS'
    END AS [BOSC],          -- Column B
    Client_Name AS [Entity], -- Column C
    SUM(ISNULL(PO_Amount, 0)) AS [Total Consumption] -- Column D
FROM TBL_Orders
WHERE (Order_Type LIKE '%Sorsogon%' OR Order_Type LIKE '%SWRS%' OR Order_Type LIKE '%SFGS%')
GROUP BY Client_Name, Order_Type
HAVING MAX(CAST(Order_Date AS DATE)) < @StartDate
ORDER BY [Total Consumption] DESC`,


'New Clients': `
    DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';

    SELECT 
        '' AS [#], -- Column A Placeholder
        FORMAT(MIN(O.Order_Date), 'yyyy-MM-dd') AS [Date Added], -- Column B
        O.Client_Name AS [Name],                                -- Column C
        O.Client_Address AS [Address],                          -- Column D
        O.Order_Type AS [Type]                                  -- Column E
    FROM TBL_Orders O
    WHERE (O.Order_Type LIKE '%Sorsogon%' OR O.Order_Type LIKE '%SWRS%' OR O.Order_Type LIKE '%SFGS%')
    GROUP BY O.Client_Name, O.Client_Address, O.Order_Type
    HAVING MIN(CAST(O.Order_Date AS DATE)) BETWEEN @StartDate AND @EndDate
    ORDER BY [Date Added] ASC`,

'Active Clients Update Audit': `
    DECLARE @StartDate DATE = '${DATE.sql.start}';
    DECLARE @EndDate   DATE = '${DATE.sql.end}';

    SELECT 
        '' AS [#], -- Column A Placeholder
        FORMAT(MIN(Order_Date), 'yyyy-MM-dd') AS [Date Recorded], -- Column B
        CASE 
            WHEN Order_Type LIKE '%Government%' OR Order_Type LIKE '%SFGS%' THEN 'SFGS'
            ELSE 'SWRS'
        END AS [Sales Category],                                  -- Column C
        Client_Name AS [Entity],                                   -- Column D
        FORMAT(MAX(Order_Date), 'yyyy-MM-dd') AS [Most Recent Order Date], -- Column E
        COUNT(Order_No) AS [No. of Transactions]                   -- Column F
    FROM TBL_Orders
    WHERE (Order_Type LIKE '%Sorsogon%' OR Order_Type LIKE '%SWRS%' OR Order_Type LIKE '%SFGS%')
    GROUP BY Client_Name, Order_Type
    HAVING MAX(Order_Date) >= @StartDate
    ORDER BY [No. of Transactions] DESC`,



'New Client Contacts': `
    DECLARE @StartDate DATE = '${DATE.sql.start}';
    DECLARE @EndDate   DATE = '${DATE.sql.end}';

    SELECT 
        '' AS [#], -- Column A Placeholder
        CASE WHEN Order_Type LIKE '%SFGS%' THEN 'SFGS' ELSE 'SWRS' END AS [SalesCategory], -- Column B
        Client_Name AS [Entity], -- Column C
        '' AS [Contact Person],  -- Column D
        '' AS [Position],        -- Column E
        '' AS [Department],      -- Column F
        '' AS [Birthday],        -- Column G
        '' AS [Contact Number],  -- Column H
        '' AS [Email Address],   -- Column I
        'New Client March 2026' AS [Remarks] -- Column J
    FROM TBL_Orders
    GROUP BY Client_Name, Order_Type
    HAVING MIN(CAST(Order_Date AS DATE)) BETWEEN @StartDate AND @EndDate`,


'Canvass Details': `

DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    O.Order_No AS [Canvass No],                     -- Col A
    CAST(O.Order_Date AS DATE) AS [Plot Date],      -- Col B
    O.Client_Name AS [Canvass Name],                -- Col C
    CASE 
        WHEN O.Order_Type LIKE '%SFGS%' THEN 'SFGS' 
        ELSE 'SWRS' 
    END AS [Sales Category],                        -- Col D
    '' AS [End User],                               -- Col E (Manual)
    'Sorsogon Staff' AS [Canvasser Name],           -- Col F
    '' AS [Contact],                                -- Col G (Manual)
    '' AS [Designation],                            -- Col H (Manual)
    'YES' AS [Approved?],                           -- Col I
    'WON' AS [Result],                              -- Col J
    O.PO_Amount AS [ABC Total],                     -- Col K
    O.PO_Amount AS [Canvass Total],                 -- Col L
    'System' AS [Encoder]                           -- Col M
FROM TBL_Orders O
WHERE CAST(O.Order_Date AS DATE) BETWEEN @StartDate AND @EndDate
  AND (O.Order_Type LIKE '%Sorsogon%' OR O.Order_Type LIKE '%SWRS%' OR O.Order_Type LIKE '%SFGS%')
ORDER BY O.Order_Date ASC`,


'Ordering Kiosk Details': `

DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    CASE 
        WHEN O.Order_Type LIKE '%SFGS%' THEN 'SFGS' 
        ELSE 'SWRS' 
    END AS [Sales Category],                        -- Col A
    O.Order_No AS [Order No],                       -- Col B
    CAST(O.Order_Date AS DATE) AS [Booking Date],   -- Col C
    CAST(O.Order_Date AS DATE) AS [Order Date],     -- Col D
    O.Client_Name AS [Entity],                      -- Col E
    O.Client_Address AS [Address],                  -- Col F
    '' AS [End User/Requestor],                     -- Col G (Manual)
    'System_User' AS [Encoder],                     -- Col H
    '' AS [Picker],                                 -- Col I (Manual)
    '' AS [Checker],                                -- Col J (Manual)
    '' AS [Packer],                                 -- Col K (Manual)
    O.Order_No AS [Canvass No./SRF No.],            -- Col L
    O.Order_Type AS [PO Details / Order Details],   -- Col M
    O.PO_Amount AS [PO Amount / Order Total]        -- Col N
FROM TBL_Orders O
WHERE CAST(O.Order_Date AS DATE) BETWEEN @StartDate AND @EndDate
  AND (O.Order_Type LIKE '%Sorsogon%' OR O.Order_Type LIKE '%SWRS%' OR O.Order_Type LIKE '%SFGS%')
ORDER BY O.Order_No ASC`
};

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

// This function is now internal to the controller and uses the pool passed from Server.js
async function syncQueryToSheet(pool, spreadsheetId, query, sheetName) {
    try {
        const result = await pool.request().query(query);
        
        // --- LOGIC FOR TOP 30 (SIDE-BY-SIDE SYNC) ---
        // Sheet has a fixed grid (36 rows x 15 cols). 3 tables sit side by side:
        //   Table 1 (Booking)   → B6:D  — cols: BOSC=B, Entity=C, Total PO=D
        //   Table 2 (Delivered) → G6:I  — cols: BOSC=G, Entity=H, Total Delivered=I
        //   Table 3 (Collected) → L6:N  — cols: BOSC=L, Entity=M, Total Collected=N
        if (sheetName === 'Top 30') {
            const startRow = 6;
            const sets = result.recordsets; // Requires request.multiple = true

            if (!sets || sets.length === 0) {
                console.warn(`⚠️  [${sheetName}] No recordsets returned — check SQL returns 3 SELECT results.`);
                return;
            }

            // Clear all 3 data zones before rewriting
            await sheetsApi.spreadsheets.values.batchClear({
                spreadsheetId,
                requestBody: {
                    ranges: [
                        `'${sheetName}'!B${startRow}:D36`,  // Table 1
                        `'${sheetName}'!G${startRow}:I36`,  // Table 2
                        `'${sheetName}'!L${startRow}:N36`,  // Table 3
                    ]
                }
            });

            const batchData = [];
            if (sets[0]?.length) batchData.push({ range: `'${sheetName}'!B${startRow}`, values: sets[0].map(r => formatRow(r)) });
            if (sets[1]?.length) batchData.push({ range: `'${sheetName}'!G${startRow}`, values: sets[1].map(r => formatRow(r)) });
            if (sets[2]?.length) batchData.push({ range: `'${sheetName}'!L${startRow}`, values: sets[2].map(r => formatRow(r)) });

            if (batchData.length > 0) {
                await sheetsApi.spreadsheets.values.batchUpdate({
                    spreadsheetId,
                    requestBody: { data: batchData, valueInputOption: 'RAW' }
                });
                console.log(`✅ [${sheetName}] Side-by-side sync complete. Sets received: ${sets.length}`);
            }
            return;
        }

        // --- LOGIC FOR ALL OTHER SHEETS ---
        const rows = result.recordset;
        const startAtRow6 = [
            'Out of Stocks', 'Expired', 'Near Expiry', 
            'Top Peso Sold (Meds)', 'Top Peso Sold (Supplies)',
            'Top AR', 'Top Inactive',
            'New Client Contacts', 'Canvass Details', 'Ordering Kiosk Details'
        ];

        const startRow = (sheetName === 'High Peso Value') ? 5 : (startAtRow6.includes(sheetName) ? 6 : 5);

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
        }
    } catch (err) {
        console.error(`❌ [${sheetName}] Error:`, err.message);
    }
    // CRITICAL: Removed pool.close() from finally block
}

// This is the main entry point exported to Server.js
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