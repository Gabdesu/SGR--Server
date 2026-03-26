const express = require('express');
const sql = require('mssql');
const cors = require('cors');
require('dotenv').config();
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const creds = require('./credentials.json');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;
// REPLACE THIS: The ID of the Google Drive folder containing your monthly reports
const FOLDER_ID = '1MgJDN1xhxypvLsb-CvlF-LhU_jLP6F8V'; 

const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [
        'https://www.googleapis.com/auth/spreadsheets', 
        'https://www.googleapis.com/auth/drive.metadata.readonly'
    ],
});

const sheetsApi = google.sheets({ version: 'v4', auth });
const driveApi = google.drive({ version: 'v3', auth }); // Initialize Drive API
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- HELPER: FIND SPREADSHEET BY CURRENT MONTH NAME ---
async function getSpreadsheetIdForCurrentMonth() {
    const monthNames = ["BCVR [SGR_SLS_IBS_JAN_2026] BCVR Iriga Branch Store | January 2026 - Sales",
                        "BCVR [SGR_SLS_IBS_FEB_2026] BCVR Iriga Branch Store | February 2026 - Sales",
                        "BCVR [SGR_SLS_IBS_MAR_2026] BCVR Iriga Branch Store | March 2026 - Sales",
                        "BCVR [SGR_SLS_IBS_APR_2026] BCVR Iriga Branch Store | April 2026 - Sales",
                        "BCVR [SGR_SLS_IBS_MAY_2026] BCVR Iriga Branch Store | May 2026 - Sales",
                        "BCVR [SGR_SLS_IBS_JUN_2026] BCVR Iriga Branch Store | June 2026 - Sales",
                        "BCVR [SGR_SLS_IBS_JUL_2026] BCVR Iriga Branch Store | July 2026 - Sales",
                        "BCVR [SGR_SLS_IBS_AUG_2026] BCVR Iriga Branch Store | August 2026 - Sales",
                        "BCVR [SGR_SLS_IBS_SEP_2026] BCVR Iriga Branch Store | September 2026 - Sales",
                        "BCVR [SGR_SLS_IBS_OCT_2026] BCVR Iriga Branch Store | October 2026 - Sales",
                        "BCVR [SGR_SLS_IBS_NOV_2026] BCVR Iriga Branch Store | November 2026 - Sales",
                        "BCVR [SGR_SLS_IBS_DEC_2026] BCVR Iriga Branch Store | December 2026 - Sales"               
    ];
    const now = new Date();
    const currentFileName = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

    try {
        const response = await driveApi.files.list({
            q: `'${FOLDER_ID}' in parents and name contains '${currentFileName}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
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
    'BFGS-Booking': `

-- Report for March 2026
DECLARE @StartDate DATE = '2025-01-01';
DECLARE @EndDate DATE = '2025-12-31';

SELECT 
    Order_Date AS [Booking Date],                 -- Column A
    Order_Type AS [Sales Category],              -- Column B
    Client_Name AS [Entity],                      -- Column C
    Client_Address AS [End User],                 -- Column D
    Misc_NOAdate AS [PO Details],                 -- Column E
    PO_Amount AS [PO Amount],                     -- Column F
    
    -- Logic for Column G: If status is delivered, show the amount, else 0
    CASE 
        WHEN Misc_Delivery_Status = 'Delivered' THEN PO_Amount 
        ELSE 0.00 
    END AS [Total Delivered]                      -- Column G
    
FROM TBL_Orders
WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
  -- Filter for Iriga Government Sales
  AND (Order_Type LIKE '%Iriga Field Government%' OR Order_Type LIKE '%BFGS%')
ORDER BY Order_Date ASC`,

'BFGS-Delivered': `

-- Report for March 2026
DECLARE @StartDate DATE = '2025-01-01';
DECLARE @EndDate DATE = '2025-12-31';

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
  AND (Order_Type LIKE '%Iriga Field Government%' OR Order_Type LIKE '%BFGS%')
ORDER BY Order_Date ASC`,

'BFGS-Collected': `

-- Report for March 2026
DECLARE @StartDate DATE = '2025-01-01';
DECLARE @EndDate DATE = '2025-12-31';

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
  AND (O.Order_Type LIKE '%Iriga Field Government%' OR O.Order_Type LIKE '%BFGS%')
ORDER BY O.Order_Date ASC`,

'BWRS-Delivered': `

    -- Report for March 2026
    DECLARE @StartDate DATE = '2025-01-01';
    DECLARE @EndDate DATE = '2025-12-31';

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
      AND (Order_Type LIKE '%Iriga Wholesale Retail Sales%' 
           OR Order_Type LIKE '%BWRS%')               -- Matches your sheet header
    ORDER BY Order_Date ASC`,


'BWRS-Collected': `

-- Report for March 2026
DECLARE @StartDate DATE = '2025-01-01';
DECLARE @EndDate DATE = '2025-12-31';

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
  AND (Order_Type LIKE '%Iriga%' OR Order_Type LIKE '%BWRS%')
ORDER BY Order_Date ASC`,


'Top 30': `
DECLARE @StartDate DATE = '2025-01-01';
DECLARE @EndDate DATE = '2025-12-31';

-- 1. TOP 30 BOOKING (Columns B, C, D)
SELECT TOP 30
    'BWRS' AS [BOSC],
    Client_Name AS [Entity],
    SUM(ISNULL(PO_Amount, 0)) AS [Total PO]
FROM TBL_Orders
WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
  AND (Order_Type LIKE '%Iriga%' OR Order_Type LIKE '%BWRS%')
GROUP BY Client_Name ORDER BY [Total PO] DESC;

-- 2. TOP 30 DELIVERED (Columns H, I, J)
SELECT TOP 30
    'BWRS' AS [BOSC],
    Client_Name AS [Entity],
    SUM(CASE WHEN Misc_Delivery_Status = 'Delivered' THEN ISNULL(PO_Amount, 0) ELSE 0 END) AS [Total Delivered]
FROM TBL_Orders
WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
  AND (Order_Type LIKE '%Iriga%' OR Order_Type LIKE '%BWRS%')
GROUP BY Client_Name ORDER BY [Total Delivered] DESC;

-- 3. TOP 30 COLLECTED (Columns M, N, O)
SELECT TOP 30
    'BWRS' AS [BOSC],
    Client_Name AS [Entity],
    SUM(ISNULL(Payment_Amount, 0)) AS [Total Collected]
FROM TBL_Orders
WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
  AND (Order_Type LIKE '%Iriga%' OR Order_Type LIKE '%BWRS%')
GROUP BY Client_Name ORDER BY [Total Collected] DESC;`,


'Top 30': `
        DECLARE @StartDate DATE = '2025-01-01';
        DECLARE @EndDate DATE = '2025-12-31';
        SELECT TOP 30 'BWRS' AS [BOSC], Client_Name, SUM(ISNULL(PO_Amount, 0)) AS [Total PO] FROM TBL_Orders WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate) AND (Order_Type LIKE '%Iriga%' OR Order_Type LIKE '%BWRS%') GROUP BY Client_Name ORDER BY [Total PO] DESC;
        SELECT TOP 30 'BWRS' AS [BOSC], Client_Name, SUM(CASE WHEN Misc_Delivery_Status = 'Delivered' THEN ISNULL(PO_Amount, 0) ELSE 0 END) AS [Total Delivered] FROM TBL_Orders WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate) AND (Order_Type LIKE '%Iriga%' OR Order_Type LIKE '%BWRS%') GROUP BY Client_Name ORDER BY [Total Delivered] DESC;
        SELECT TOP 30 'BWRS' AS [BOSC], Client_Name, SUM(ISNULL(Payment_Amount, 0)) AS [Total Collected] FROM TBL_Orders WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate) AND (Order_Type LIKE '%Iriga%' OR Order_Type LIKE '%BWRS%') GROUP BY Client_Name ORDER BY [Total Collected] DESC;`,
    
    'Top AR': `
        DECLARE @StartDate DATE = '2025-01-01';
        DECLARE @EndDate DATE = '2025-12-31';
        SELECT TOP 30 'BWRS' AS [BOSC], Client_Name AS [Entity], SUM(ISNULL(PO_Amount, 0)) - SUM(ISNULL(Payment_Amount, 0)) AS [Total Balance]
        FROM TBL_Orders WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate) AND (Order_Type LIKE '%Iriga%' OR Order_Type LIKE '%BWRS%')
        GROUP BY Client_Name HAVING SUM(ISNULL(PO_Amount, 0)) - SUM(ISNULL(Payment_Amount, 0)) > 0 ORDER BY [Total Balance] DESC`,

    'Top Inactive': `
        DECLARE @CurrentMonthStart DATE = '2025-01-01';
        SELECT TOP 30 CASE WHEN Order_Type LIKE '%BFGS%' THEN 'BFGS' ELSE 'BWRS' END AS [BOSC], Client_Name AS [Entity], SUM(ISNULL(PO_Amount, 0)) AS [Total Consumption]
        FROM TBL_Orders WHERE (Order_Type LIKE '%Iriga%' OR Order_Type LIKE '%BWRS%' OR Order_Type LIKE '%BFGS%')
        GROUP BY Client_Name, Order_Type HAVING MAX(CAST(Order_Date AS DATE)) < @CurrentMonthStart ORDER BY [Total Consumption] DESC`,

    'New Clients': `
        DECLARE @MonthStart DATE = '2025-01-01';
        DECLARE @MonthEnd DATE = '2025-12-31';
        SELECT CAST(MIN(O.Order_Date) AS DATE) AS [Date Added], O.Client_Name AS [Name], O.Client_Address AS [Address], O.Order_Type AS [Type]
        FROM TBL_Orders O WHERE (O.Order_Type LIKE '%Iriga%' OR O.Order_Type LIKE '%BWRS%' OR O.Order_Type LIKE '%BFGS%')
        GROUP BY O.Client_Name, O.Client_Address, O.Order_Type HAVING MIN(CAST(O.Order_Date AS DATE)) BETWEEN @MonthStart AND @MonthEnd ORDER BY [Date Added] ASC`,

    'Active Clients Update Audit': `
        DECLARE @YearAgo DATE = '2025-01-01';
        SELECT CAST(MIN(Order_Date) AS DATE) AS [Date Recorded], CASE WHEN Order_Type LIKE '%BFGS%' THEN 'BFGS' ELSE 'BWRS' END AS [Sales Category], Client_Name AS [Entity], CAST(MAX(Order_Date) AS DATE) AS [Most Recent Order Date], COUNT(Order_No) AS [No. of Transactions]
        FROM TBL_Orders WHERE (Order_Type LIKE '%Iriga%' OR Order_Type LIKE '%BWRS%' OR Order_Type LIKE '%BFGS%')
        GROUP BY Client_Name, Order_Type HAVING MAX(Order_Date) >= @YearAgo ORDER BY [No. of Transactions] DESC`,

    'New Client Contacts': `
        DECLARE @MonthStart DATE = '2025-01-01';
        DECLARE @MonthEnd DATE = '2025-12-31';
        SELECT CASE WHEN Order_Type LIKE '%BFGS%' THEN 'BFGS' ELSE 'BWRS' END AS [SalesCategory], Client_Name AS [Entity], '' AS [Contact Person], '' AS [Position], '' AS [Department], '' AS [Birthday], '' AS [Contact Number], '' AS [Email Address], 'New Client March 2026' AS [Remarks]
        FROM TBL_Orders GROUP BY Client_Name, Order_Type HAVING MIN(CAST(Order_Date AS DATE)) BETWEEN @MonthStart AND @MonthEnd;`,


'Canvass Details': `
DECLARE @StartDate DATE = '2025-03-01';
DECLARE @EndDate DATE = '2025-03-31';

SELECT 
    O.Order_No AS [Canvass No],                     -- Col A
    CAST(O.Order_Date AS DATE) AS [Plot Date],      -- Col B
    O.Client_Name AS [Canvass Name],                -- Col C
    CASE 
        WHEN O.Order_Type LIKE '%BFGS%' THEN 'BFGS' 
        ELSE 'BWRS' 
    END AS [Sales Category],                        -- Col D
    '' AS [End User],                               -- Col E (Manual)
    'Iriga Staff' AS [Canvasser Name],           -- Col F
    '' AS [Contact],                                -- Col G (Manual)
    '' AS [Designation],                            -- Col H (Manual)
    'YES' AS [Approved?],                           -- Col I
    'WON' AS [Result],                              -- Col J
    O.PO_Amount AS [ABC Total],                     -- Col K
    O.PO_Amount AS [Canvass Total],                 -- Col L
    'System' AS [Encoder]                           -- Col M
FROM TBL_Orders O
WHERE CAST(O.Order_Date AS DATE) BETWEEN @StartDate AND @EndDate
  AND (O.Order_Type LIKE '%Iriga%' OR O.Order_Type LIKE '%BWRS%' OR O.Order_Type LIKE '%BFGS%')
ORDER BY O.Order_Date ASC;`,


'Ordering Kiosk Details': `
DECLARE @StartDate DATE = '2025-01-01';
DECLARE @EndDate DATE = '2025-12-31';

SELECT 
    CASE 
        WHEN O.Order_Type LIKE '%BFGS%' THEN 'BFGS' 
        ELSE 'BWRS' 
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
  AND (O.Order_Type LIKE '%Iriga%' OR O.Order_Type LIKE '%BWRS%' OR O.Order_Type LIKE '%BFGS%')
ORDER BY O.Order_No ASC`

};

async function syncQueryToSheet(spreadsheetId, query, sheetName) {
    let pool;
    try {
        pool = await new sql.ConnectionPool({
            user: 'intern', password: 'intern2026', server: '192.168.1.191',
            database: 'BCVR-IBS', options: { encrypt: false, trustServerCertificate: true }
        }).connect();

        const result = await pool.request().query(query);

        if (sheetName === 'Top 30') {
            const startRow = 6;
            const sets = result.recordsets;
            await sheetsApi.spreadsheets.values.batchClear({
                spreadsheetId,
                requestBody: { ranges: [`'${sheetName}'!B${startRow}:D50`, `'${sheetName}'!H${startRow}:J50`, `'${sheetName}'!M${startRow}:O50`] }
            });
            const batchData = [];
            if (sets[0]) batchData.push({ range: `'${sheetName}'!B${startRow}`, values: sets[0].map(r => Object.values(r)) });
            if (sets[1]) batchData.push({ range: `'${sheetName}'!H${startRow}`, values: sets[1].map(r => Object.values(r)) });
            if (sets[2]) batchData.push({ range: `'${sheetName}'!M${startRow}`, values: sets[2].map(r => Object.values(r)) });
            if (batchData.length > 0) {
                await sheetsApi.spreadsheets.values.batchUpdate({
                    spreadsheetId, requestBody: { data: batchData, valueInputOption: 'RAW' }
                });
                console.log(`✅ [${sheetName}] Triple-column sync.`);
            }
            return;
        }

        const rows = result.recordset;

        // UPDATED: Added 'New Client Contacts' to Col B start list
        const startAtColB = [
            'Top AR', 'Top Inactive', 'New Clients', 
            'Active Clients Update Audit', 'New Client Contacts'
        ];

        const startAtRow6 = [
            'Top AR', 'Top Inactive', 'New Client Contacts', 
            'Canvass Details', 'Ordering Kiosk Details'
        ];

        const startRow = (sheetName === 'High Peso Value') ? 5 : (startAtRow6.includes(sheetName) ? 6 : 5);
        const startCol = startAtColB.includes(sheetName) ? 'B' : 'A';

        const dataRange = `'${sheetName}'!${startCol}${startRow}:Z1000`; 
        await sheetsApi.spreadsheets.values.clear({ spreadsheetId, range: dataRange });

        if (rows && rows.length > 0) {
            const values = rows.map(r => Object.values(r));
            await sheetsApi.spreadsheets.values.update({
                spreadsheetId,
                range: `'${sheetName}'!${startCol}${startRow}`, // FIXED: range now uses startCol
                valueInputOption: 'RAW',
                requestBody: { values },
            });
            console.log(`✅ [${sheetName}] Data synced at ${startCol}${startRow}.`);
        }
    } catch (err) {
        console.error(`❌ [${sheetName}] Error:`, err.message);
    } finally {
        if (pool) await pool.close();
    }
}

async function runSyncCycle() {
    console.log(`\n🚀 STARTING SYNC CYCLE: ${new Date().toLocaleString()}`);
    
    // Dynamically find the spreadsheet for the current month
    const currentSpreadsheetId = await getSpreadsheetIdForCurrentMonth();

    if (!currentSpreadsheetId) {
        console.log("⚠️ Sync Cycle Aborted: Could not find target spreadsheet in folder.");
        return;
    }

    for (const [tabName, sqlQuery] of Object.entries(queries)) {
        await syncQueryToSheet(currentSpreadsheetId, sqlQuery, tabName);
        await sleep(3000); 
    }
    console.log(`\n✨ SYNC CYCLE FINISHED SUCCESSFULLY.\n`);
}

app.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
    runSyncCycle(); 
});