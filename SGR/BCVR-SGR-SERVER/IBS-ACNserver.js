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
const FOLDER_ID = '1NYRzyrMh0y24051_9AaWLg45CHHMc4zL'; 

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
    const monthNames = ["BCVR [SGR_ACN_IBS_JAN_2026] BCVR Iriga Branch Store | January 2026 - Accounting",
                        "BCVR [SGR_ACN_IBS_FEB_2026] BCVR Iriga Branch Store | February 2026 - Accounting",
                        "BCVR [SGR_ACN_IBS_MAR_2026] BCVR Iriga Branch Store | March 2026 - Accounting",
                        "BCVR [SGR_ACN_IBS_APR_2026] BCVR Iriga Branch Store | April 2026 - Accounting",
                        "BCVR [SGR_ACN_IBS_MAY_2026] BCVR Iriga Branch Store | May 2026 - Accounting",
                        "BCVR [SGR_ACN_IBS_JUN_2026] BCVR Iriga Branch Store | June 2026 - Accounting",
                        "BCVR [SGR_ACN_IBS_JUL_2026] BCVR Iriga Branch Store | July 2026 - Accounting",
                        "BCVR [SGR_ACN_IBS_AUG_2026] BCVR Iriga Branch Store | August 2026 - Accounting",
                        "BCVR [SGR_ACN_IBS_SEP_2026] BCVR Iriga Branch Store | September 2026 - Accounting",
                        "BCVR [SGR_ACN_IBS_OCT_2026] BCVR Iriga Branch Store | October 2026 - Accounting",
                        "BCVR [SGR_ACN_IBS_NOV_2026] BCVR Iriga Branch Store | November 2026 - Accounting",
                        "BCVR [SGR_ACN_IBS_DEC_2026] BCVR Iriga Branch Store | December 2026 - Accounting"               
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
    'ST: IBS->DW': `
DECLARE @StartDate DATE = '2025-01-01';
DECLARE @EndDate   DATE = '2025-12-31';

SELECT [Order Date], [Client Name], [Client Address], [Non-official Invoice], [DM], [MSDE], [GM], [LSAE], [OSEF], [ASME], [REEV], [Total Peso Sale]
FROM (
    SELECT 1 AS SortOrder,
        CAST(ISNULL(CONVERT(VARCHAR(10), O.Order_Date, 120), '') AS NVARCHAR(50)) AS [Order Date],
        CAST(ISNULL(O.Client_Name, '') AS NVARCHAR(255)) AS [Client Name],
        CAST(ISNULL(O.Client_Address, '') AS NVARCHAR(255)) AS [Client Address],
        CAST('STF#' + CAST(O.Order_No AS VARCHAR(20)) AS NVARCHAR(255)) AS [Non-official Invoice],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 1 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [DM],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 2 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [MSDE],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 3 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [GM],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 4 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [LSAE],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 5 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [OSEF],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 6 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [ASME],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 7 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [REEV],
        CAST(FORMAT(ISNULL(SUM(OD.TOTAL_COST), 0), 'N2') AS NVARCHAR(50)) AS [Total Peso Sale]
    FROM dbo.TBL_Orders O
    INNER JOIN dbo.TBL_Orders_Detail OD ON O.Order_No = OD.Order_No
    LEFT JOIN dbo.TBL_Category_Item_File CI ON OD.Item_ID = CI.Item_ID
    LEFT JOIN dbo.TBL_Category_File CF ON CI.Catg_ID = CF.Catg_ID
    LEFT JOIN dbo.TBL_Group G ON CF.Group_ID = G.Group_ID
    WHERE O.Order_Type LIKE 'TS - Transfer Sales%' -- Handles trailing spaces in MBS/SBS
      AND O.Client_Name NOT LIKE '%Distribution%'  -- Exclude Warehouse
      AND O.Client_Name NOT LIKE '%BCVR-DW%'        -- Alternative Warehouse name
      AND O.Order_Date BETWEEN @StartDate AND @EndDate
    GROUP BY O.Order_No, O.Order_Date, O.Client_Name, O.Client_Address
) AS ST_Report
ORDER BY [Order Date] ASC`,

'ST: IBS->PHSSI': `
DECLARE @StartDate DATE = '2025-01-01';
DECLARE @EndDate   DATE = '2025-12-31';

SELECT 
    [Order Date], [Client Name], [Client Address], [Non-official Invoice], 
    [DM], [MSDE], [GM], [LSAE], [OSEF], [ASME], [REEV], [Total Peso Sale]
FROM (
    SELECT 
        CAST(ISNULL(CONVERT(VARCHAR(10), O.Order_Date, 120), '') AS NVARCHAR(50)) AS [Order Date], 
        CAST(ISNULL(O.Client_Name, '') AS NVARCHAR(255)) AS [Client Name], 
        CAST(ISNULL(O.Client_Address, '') AS NVARCHAR(255)) AS [Client Address],
        CAST('STF#' + CAST(O.Order_No AS VARCHAR(20)) AS NVARCHAR(255)) AS [Non-official Invoice],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 1 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [DM],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 2 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [MSDE],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 3 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [GM],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 4 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [LSAE],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 5 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [OSEF],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 6 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [ASME],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 7 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [REEV],
        CAST(FORMAT(ISNULL(SUM(OD.TOTAL_COST), 0), 'N2') AS NVARCHAR(50)) AS [Total Peso Sale]
    FROM dbo.TBL_Orders O
    INNER JOIN dbo.TBL_Orders_Detail OD ON O.Order_No = OD.Order_No
    LEFT JOIN dbo.TBL_Category_Item_File CI ON OD.Item_ID = CI.Item_ID
    LEFT JOIN dbo.TBL_Category_File CF ON CI.Catg_ID = CF.Catg_ID
    LEFT JOIN dbo.TBL_Group G ON CF.Group_ID = G.Group_ID
    WHERE O.Order_Type LIKE 'TS - Transfer Sales%' 
      AND O.Client_Name NOT LIKE '%Distribution%' AND O.Client_Name NOT LIKE '%BCVR-DW%'
      AND O.Order_Date BETWEEN @StartDate AND @EndDate
    GROUP BY O.Order_No, O.Order_Date, O.Client_Name, O.Client_Address
) AS ST_Final
ORDER BY [Order Date] ASC`,


'RT: DW->IBS': `
DECLARE @StartDate DATE = '2025-01-01';
DECLARE @EndDate   DATE = '2026-12-31';

SELECT [Order Date], [Client Name], [Client Address], [Non-official Invoice], [DM], [MSDE], [GM], [LSAE], [OSEF], [ASME], [REEV], [Total Peso Sale]
FROM (
    SELECT 1 AS SortOrder,
        CAST(ISNULL(CONVERT(VARCHAR(10), O.Order_Date, 120), '') AS NVARCHAR(50)) AS [Order Date],
        CAST(ISNULL(O.Client_Name, '') AS NVARCHAR(255)) AS [Client Name],
        CAST(ISNULL(O.Client_Address, '') AS NVARCHAR(255)) AS [Client Address],
        CAST('STF#' + CAST(O.Order_No AS VARCHAR(20)) AS NVARCHAR(255)) AS [Non-official Invoice],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 1 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [DM],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 2 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [MSDE],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 3 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [GM],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 4 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [LSAE],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 5 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [OSEF],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 6 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [ASME],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 7 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [REEV],
        CAST(FORMAT(ISNULL(SUM(OD.TOTAL_COST), 0), 'N2') AS NVARCHAR(50)) AS [Total Peso Sale]
    FROM dbo.TBL_Orders O
    INNER JOIN dbo.TBL_Orders_Detail OD ON O.Order_No = OD.Order_No
    LEFT JOIN dbo.TBL_Category_Item_File CI ON OD.Item_ID = CI.Item_ID
    LEFT JOIN dbo.TBL_Category_File CF ON CI.Catg_ID = CF.Catg_ID
    LEFT JOIN dbo.TBL_Group G ON CF.Group_ID = G.Group_ID
    WHERE O.Order_Type LIKE 'TS - Transfer Sales%' 
      AND (O.Client_Name LIKE '%Distribution%' OR O.Client_Name LIKE '%BCVR-DW%') -- Target Warehouse
      AND O.Order_Date BETWEEN @StartDate AND @EndDate
    GROUP BY O.Order_No, O.Order_Date, O.Client_Name, O.Client_Address
) AS RT_Report
ORDER BY [Order Date] ASC`,

'RT: PHSSI->IBS': `
DECLARE @StartDate DATE = '2025-01-01';
DECLARE @EndDate   DATE = '2025-12-31';

SELECT 
    [Order Date], [Client Name], [Client Address], [Non-official Invoice], 
    [DM], [MSDE], [GM], [LSAE], [OSEF], [ASME], [REEV], [Total Peso Sale]
FROM (
    SELECT 
        CAST(ISNULL(CONVERT(VARCHAR(10), O.Order_Date, 120), '') AS NVARCHAR(50)) AS [Order Date], 
        CAST(ISNULL(O.Client_Name, '') AS NVARCHAR(255)) AS [Client Name], 
        CAST(ISNULL(O.Client_Address, '') AS NVARCHAR(255)) AS [Client Address],
        CAST('RTF#' + CAST(O.Order_No AS VARCHAR(20)) AS NVARCHAR(255)) AS [Non-official Invoice],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 1 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [DM],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 2 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [MSDE],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 3 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [GM],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 4 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [LSAE],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 5 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [OSEF],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 6 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [ASME],
        CAST(FORMAT(ISNULL(SUM(CASE WHEN G.Group_ID = 7 THEN OD.TOTAL_COST ELSE 0 END), 0), 'N2') AS NVARCHAR(50)) AS [REEV],
        CAST(FORMAT(ISNULL(SUM(OD.TOTAL_COST), 0), 'N2') AS NVARCHAR(50)) AS [Total Peso Sale]
    FROM dbo.TBL_Orders O
    INNER JOIN dbo.TBL_Orders_Detail OD ON O.Order_No = OD.Order_No
    LEFT JOIN dbo.TBL_Category_Item_File CI ON OD.Item_ID = CI.Item_ID
    LEFT JOIN dbo.TBL_Category_File CF ON CI.Catg_ID = CF.Catg_ID
    LEFT JOIN dbo.TBL_Group G ON CF.Group_ID = G.Group_ID
    WHERE O.Order_Type LIKE 'TS - Transfer Sales%' 
      AND (O.Client_Name LIKE '%Distribution%' OR O.Client_Name LIKE '%BCVR-DW%')
      AND O.Order_Date BETWEEN @StartDate AND @EndDate
    GROUP BY O.Order_No, O.Order_Date, O.Client_Name, O.Client_Address
) AS RT_Final
ORDER BY [Order Date] ASC`,

'Sales Invoice - Govt.': `
DECLARE @StartDate DATE = '2025-01-01';
DECLARE @EndDate   DATE = '2026-12-31';

SELECT 
    TRY_CONVERT(DATE, COALESCE(CASE WHEN CHARINDEX(' - ', Misc_SalesInvoice) > 0 
        THEN SUBSTRING(Misc_SalesInvoice, CHARINDEX(' - ', Misc_SalesInvoice) + 3, 
        LEN(Misc_SalesInvoice) - CHARINDEX(' - ', Misc_SalesInvoice) - 2) 
        ELSE NULL END, NULL)) AS [Released Date], -- Column A
    LEFT(Order_Type, 4)       AS [Sales Category], -- Column B
    Client_Name               AS [Entity],         -- Column C
    Client_terms              AS [PO Details],     -- Column D
    COALESCE(ReceiptNo_Note_Extra, '') AS [Invoice], -- Column E
    CAST(Product_Total AS DECIMAL(18,2)) AS [Total Delivered], -- Column F
    CAST(ISNULL(Waived_Amount, 0) AS DECIMAL(18,2)) AS [Total Waived], -- Column G
    CAST(ISNULL(PO_Amount, 0) AS DECIMAL(18,2)) AS [Total PO]     -- Column H
FROM TBL_Orders
WHERE TRY_CONVERT(DATE, COALESCE(CASE WHEN CHARINDEX(' - ', Misc_SalesInvoice) > 0 
        THEN SUBSTRING(Misc_SalesInvoice, CHARINDEX(' - ', Misc_SalesInvoice) + 3, 
        LEN(Misc_SalesInvoice) - CHARINDEX(' - ', Misc_SalesInvoice) - 2) 
        ELSE NULL END, NULL)) BETWEEN @StartDate AND @EndDate
    AND COALESCE(ReceiptNo_Note_Extra, '') != ''
    AND Order_Type LIKE '%Govt%'
ORDER BY [Released Date];`,


'Sales Invoice': `
DECLARE @StartDate DATE = '2025-01-01';
DECLARE @EndDate   DATE = '2026-12-31';

SELECT 
    CAST(Order_Date AS DATE)  AS [Released Date], -- Column A
    LEFT(Order_Type, 4)       AS [Sales Category], -- Column B
    Client_Name               AS [Entity],         -- Column C
    Client_terms              AS [PO Details],     -- Column D
    COALESCE(ReceiptNo_Note_Extra, '') AS [Invoice], -- Column E
    CAST(Product_Total AS DECIMAL(18,2)) AS [Total Delivered] -- Column F
FROM TBL_Orders
WHERE Order_Date BETWEEN @StartDate AND @EndDate
    AND COALESCE(ReceiptNo_Note_Extra, '') != ''
    AND Order_Type NOT LIKE '%Govt%'
ORDER BY [Released Date];`,


'CSR/OE/RS': `

`,


// ✅ FIX: Removed trailing space from key name — was 'Inv. Discrepancy ' (caused range parse error)
// ✅ NOTE: USE [BCVR-IBS] and GO are SSMS-only syntax — removed. Cross-DB access handled
//          via fully-qualified [BCVR-IBS].dbo. table references instead.
//          The connection pool database is still BCVR-SBS; the 3-part names do the routing.
'Inv. Discrepancy': `
DECLARE @StartDate DATE = '2025-01-01';
DECLARE @EndDate   DATE = '2025-12-31';

-- ============================================================
-- SECTION 1: Negative Variance
-- ============================================================
SELECT
    CAST(ISNULL(CONVERT(VARCHAR(10), PC.P_Date, 120), '')       AS NVARCHAR(50))  AS [Date],
    CAST(ISNULL(PC.P_Details, '')                               AS NVARCHAR(255)) AS [Inventory Group],
    CAST(ISNULL(CI.Item_Name, '')                               AS NVARCHAR(255)) AS [Product Name],
    CAST(FORMAT(ISNULL(CI.Item_Price, 0), 'N2')                 AS NVARCHAR(50))  AS [Capital],
    CAST(ISNULL(CAST(PCD.P_Counts  AS VARCHAR(20)), '0')        AS NVARCHAR(50))  AS [Physical],
    CAST(ISNULL(CAST(PCD.Total_QTY AS VARCHAR(20)), '0')        AS NVARCHAR(50))  AS [System],
    CAST((PCD.P_Counts - PCD.Total_QTY)                         AS NVARCHAR(50))  AS [Variance],
    CAST(FORMAT(
        ISNULL((PCD.P_Counts - PCD.Total_QTY) * CI.Item_Price, 0), 'N2')
                                                                AS NVARCHAR(50))  AS [Peso Value]
FROM [BCVR-IBS].dbo.TBL_Physical_Count PC
INNER JOIN [BCVR-IBS].dbo.TBL_Physical_Count_Details PCD ON PC.P_ID = PCD.P_ID
LEFT  JOIN [BCVR-IBS].dbo.TBL_Category_Item_File CI ON PCD.Item_ID = CI.Item_ID
LEFT  JOIN [BCVR-IBS].dbo.TBL_Category_File CF ON CI.Catg_ID = CF.Catg_ID
WHERE PC.P_Date BETWEEN @StartDate AND @EndDate
  AND (PCD.P_Counts - PCD.Total_QTY) < 0
ORDER BY [Date] ASC;

-- ============================================================
-- SECTION 2: Positive Variance
-- ============================================================
SELECT
    CAST(ISNULL(CONVERT(VARCHAR(10), PC.P_Date, 120), '')       AS NVARCHAR(50))  AS [Date],
    CAST(ISNULL(PC.P_Details, '')                               AS NVARCHAR(255)) AS [Inventory Group],
    CAST(ISNULL(CI.Item_Name, '')                               AS NVARCHAR(255)) AS [Product Name],
    CAST(FORMAT(ISNULL(CI.Item_Price, 0), 'N2')                 AS NVARCHAR(50))  AS [Capital],
    CAST(ISNULL(CAST(PCD.P_Counts  AS VARCHAR(20)), '0')        AS NVARCHAR(50))  AS [Physical],
    CAST(ISNULL(CAST(PCD.Total_QTY AS VARCHAR(20)), '0')        AS NVARCHAR(50))  AS [System],
    CAST((PCD.P_Counts - PCD.Total_QTY)                         AS NVARCHAR(50))  AS [Variance],
    CAST(FORMAT(
        ISNULL((PCD.P_Counts - PCD.Total_QTY) * CI.Item_Price, 0), 'N2')
                                                                AS NVARCHAR(50))  AS [Peso Value]
FROM [BCVR-IBS].dbo.TBL_Physical_Count PC
INNER JOIN [BCVR-IBS].dbo.TBL_Physical_Count_Details PCD ON PC.P_ID = PCD.P_ID
LEFT  JOIN [BCVR-IBS].dbo.TBL_Category_Item_File CI ON PCD.Item_ID = CI.Item_ID
LEFT  JOIN [BCVR-IBS].dbo.TBL_Category_File CF ON CI.Catg_ID = CF.Catg_ID
WHERE PC.P_Date BETWEEN @StartDate AND @EndDate
  AND (PCD.P_Counts - PCD.Total_QTY) > 0
ORDER BY [Date] ASC`,


'Remittance': `
DECLARE @SalesCategory VARCHAR(MAX);
DECLARE @SalesDate_From Date; 
DECLARE @SalesDate_To Date;

SET @SalesCategory = '%%';
SET @SalesDate_From = '01/01/2025';
SET @SalesDate_To = '01/31/2026';

select Remittance_Date, LEFT(Order_Type, 4) as Order_Type, Total_Net,Total_Remittance,
Deposit_Deposited, Cash_ShortOver, Deposit_ShortOver, Total_Expense, Expense_Replenished   from TBL_Remittance
where Remittance_Date between @SalesDate_From and @SalesDate_To
order by Remittance_Date


select 
Deposit_Date,
Deposit_No,
Bank_Name,
Amount,
Deposit_Type,
Deposit_Status
from TBL_Remittance_Deposit
where Deposit_Date between @SalesDate_From and @SalesDate_To
order by Deposit_Date`,


'Remittance Deposit': `
DECLARE @Date_From Date = '2025-01-01';
DECLARE @Date_To DateTime = '2025-12-31 23:59:59.997';

-- 1. TAB: Disbursement Deposit
-- Uses confirmed table: TBL_Remittance_Deposit
SELECT 
    [deposit_date] AS [Deposit Date],
    [deposit_no] AS [Deposit No],
    [bank_name] AS [Bank],
    [amount] AS [Amount],
    [deposit_type] AS [Deposit Type],
    [deposit_status] AS [Deposit Status]
FROM dbo.TBL_Remittance_Deposit
WHERE [deposit_date] BETWEEN @Date_From AND @Date_To
ORDER BY [deposit_date] ASC;`,


'OPEX': `
DECLARE @Date_From DATE = '2025-01-01';
DECLARE @Date_To   DATE = '2025-12-31';

SELECT 
    -- Column A: Date of Payment
    CAST(Date_Payment_Check AS DATE) AS [Date of Payment],       
    
    -- Column B: OPEX Particular
    ISNULL(OPEX_Particular, '-')     AS [OPEX Particular],       
    
    -- Column C: Payee
    ISNULL(Payee, 'N/A')             AS [Payee],                 
    
    -- Column D: Category
    ISNULL(OPEX_Category, '-')       AS [Category],              
    
    -- Column E: Non-Official Inovice
    ISNULL(Invoice_Number, '')       AS [Non-Official Inovice],  
    
    -- Column F: Sales Invoice
    ISNULL(Invoice_Number_Extra, '') AS [Sales Invoice],         
    
    -- Column G: Sales Invoice (VAT Ex.)
    ISNULL(Invoice_Number_Plus, '')  AS [Sales Invoice (VAT Ex.)], 
    
    -- Column H: Check No.
    ISNULL(Payment_Info, '')         AS [Check No.],             
    
    -- Column I: Total Expense
    CAST(ISNULL(Payment_Amount, 0) AS DECIMAL(18,2)) AS [Total Expense],   
    
    -- Column J: Total Non-Official Inovice
    CAST(CASE WHEN ISNULL(Invoice_Number, '') <> '' 
              THEN ISNULL(Payment_Amount, 0) ELSE 0 END AS DECIMAL(18,2)) AS [Total Non-Official Inovice], 
         
    -- Column K: Total Sales Invoice
    CAST(CASE WHEN ISNULL(Invoice_Number_Extra, '') <> '' 
              THEN ISNULL(Payment_Amount, 0) ELSE 0 END AS DECIMAL(18,2)) AS [Total Sales Invoice],        
         
    -- Column L: Total Sales Invoice (VAT Ex.)
    CAST(CASE WHEN ISNULL(Invoice_Number_Plus, '') <> '' 
              THEN ISNULL(Payment_Amount, 0) ELSE 0 END AS DECIMAL(18,2)) AS [Total Sales Invoice (VAT Ex.)]

FROM dbo.TBL_Operational_Expense
WHERE Date_Payment_Check BETWEEN @Date_From AND @Date_To
  AND OPEX_Category NOT LIKE '%Cost Of Goods%'
ORDER BY [Date of Payment] ASC;`,


'OPEX Monthly': `

select 
OPEX_Category,
SUM(CASE WHEN MONTH(Date_Payment_Check) = 1 THEN Payment_Amount ELSE 0 END) AS January,
SUM(CASE WHEN MONTH(Date_Payment_Check) = 2 THEN Payment_Amount ELSE 0 END) AS February,
SUM(CASE WHEN MONTH(Date_Payment_Check) = 3 THEN Payment_Amount ELSE 0 END) AS March,
SUM(CASE WHEN MONTH(Date_Payment_Check) = 4 THEN Payment_Amount ELSE 0 END) AS April,
SUM(CASE WHEN MONTH(Date_Payment_Check) = 5 THEN Payment_Amount ELSE 0 END) AS May,
SUM(CASE WHEN MONTH(Date_Payment_Check) = 6 THEN Payment_Amount ELSE 0 END) AS June,
SUM(CASE WHEN MONTH(Date_Payment_Check) = 7 THEN Payment_Amount ELSE 0 END) AS July,
SUM(CASE WHEN MONTH(Date_Payment_Check) = 8 THEN Payment_Amount ELSE 0 END) AS August,
SUM(CASE WHEN MONTH(Date_Payment_Check) = 9 THEN Payment_Amount ELSE 0 END) AS September,
SUM(CASE WHEN MONTH(Date_Payment_Check) = 10 THEN Payment_Amount ELSE 0 END) AS October,
SUM(CASE WHEN MONTH(Date_Payment_Check) = 11 THEN Payment_Amount ELSE 0 END) AS November,
SUM(CASE WHEN MONTH(Date_Payment_Check) = 12 THEN Payment_Amount ELSE 0 END) AS December
from TBL_Operational_Expense
where Year(Date_Payment_Check) = 2026
and OPEX_Category not in (
'Cost Of Goods 1',
'Cost Of Goods 2'
)
group by OPEX_Category`,


'Disbursement': `
DECLARE @Date_From DateTime = '2025-01-01 00:00:00';
DECLARE @Date_To DateTime = '2025-12-31 23:59:59.997';

-- Combine all spending into the Disbursement Format
SELECT 
    p.Order_Payment_Id AS [ID],
    '' AS [GV No], 
    p.BankRef_No AS [Check No], 
    p.Payment_Amount AS [Check Amount],
    p.Payment_Date AS [Date Processed],
    o.Client_Name AS [Particulars],
    o.Misc_CheckVoucher AS [Voucher No],
    p.Payment_Amount AS [Request Amount],
    p.Payment_Amount AS [Released Amount],
    0 AS [Discrepancy / For Deposit],
    '' AS [Requestor] -- Removed Encoded_By as it's missing in p table
FROM TBL_Orders_Payment p
LEFT JOIN TBL_Orders o ON p.Order_No = o.Order_No
WHERE p.Payment_Date BETWEEN @Date_From AND @Date_To

UNION ALL

-- Operational Expenses (OPEX)
SELECT 
    OPEX_ID AS [ID],
    '' AS [GV No],
    Voucher_no AS [Check No], 
    Payment_Amount AS [Check Amount],
    Voucher_date AS [Date Processed],
    ISNULL(payee, OPEX_Particular) AS [Particulars],
    Voucher_no AS [Voucher No],
    Payment_Amount AS [Request Amount],
    Payment_Amount AS [Released Amount],
    0 AS [Discrepancy / For Deposit],
    Encoded_by AS [Requestor] -- Fixed casing to match your scan
FROM TBL_Operational_Expense
WHERE Voucher_date BETWEEN @Date_From AND @Date_To
ORDER BY [Date Processed] ASC`,


'Disbursement Deposit': `
-- ── Data Rows Only ─────────────────────────────────────────────
SELECT 
    CAST(FORMAT(deposit_date, 'yyyy-MM-dd HH:mm:ss') AS VARCHAR(50)) AS [Deposit Date], 
    deposit_no AS [Deposit No], 
    bank_name AS [Bank], 
    amount AS [Amount], 
    deposit_status AS [Deposit Status]
FROM [BCVR-SBS].dbo.disbursement_deposits
WHERE deposit_date >= '2025-01-01'
  AND deposit_date < '2026-12-31'
ORDER BY deposit_date ASC`,


'Govt. Collection Forecast': `

DECLARE @StartDate DATE = '2025-01-01';
DECLARE @EndDate   DATE = '2025-12-31';

SELECT
LEFT(Order_type, 4) as 'Sales Category',
TBL_Orders.Order_No as 'Order No.',
Order_Date as 'Order Date',
CASE 
        WHEN CHARINDEX(' - ', Misc_BookingDate) > 0 THEN 
            SUBSTRING(
                Misc_BookingDate,
                CHARINDEX(' - ', Misc_BookingDate) + 3, 
                LEN(Misc_BookingDate) - CHARINDEX(' - ', Misc_BookingDate) - 2
            )
        ELSE ''
END AS 'Booking Date',
Client_Name as 'Entity',
Client_Terms as 'Order Details',
FORMAT(Product_Total, 'N2') as 'Stocks Delivered',
FORMAT(COALESCE(Waive_Amount, 0), 'N2') as 'Waived Amount',
Due_Date as 'Delivery Due Date',
CASE 
        WHEN CHARINDEX(' - ', Misc_BCVRduedate) > 0 THEN 
            SUBSTRING(
                Misc_BCVRduedate,
                CHARINDEX(' - ', Misc_BCVRduedate) + 3, 
                LEN(Misc_BCVRduedate) - CHARINDEX(' - ', Misc_BCVRduedate) - 2
            )
        ELSE ''
END AS 'BCVR Due Date',
CONCAT(CASE 
                WHEN COALESCE(PO_Amount, 0) = 0 
                THEN CAST('0' AS float) 
                ELSE CAST(((REPLACE(Product_Total, 0.01, 0) + COALESCE(Waive_Amount, 0)) / PO_Amount) * 100 AS float) 
END, '%') AS 'Ratio',
    -- BIDDING TOTAL
    CONCAT(
        CAST(
            Replace(COALESCE(Misc_EligibilityDocs, ''), COALESCE(Misc_EligibilityDocs, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_hasPerformanceBond, ''), COALESCE(Misc_hasPerformanceBond, ''), '3') AS float) +
            CAST(Replace(COALESCE(Misc_RFQdate, ''), COALESCE(Misc_RFQdate, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_PQdate, ''), COALESCE(Misc_PQdate, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_NOAdate, ''), COALESCE(Misc_NOAdate, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_NTPdate, ''), COALESCE(Misc_NTPdate, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_POdate, ''), COALESCE(Misc_POdate, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_hasContractAgreement, ''), COALESCE(Misc_hasContractAgreement, ''), '3') AS float) +
            CAST(Replace(COALESCE(Misc_Omnibus, ''), COALESCE(Misc_Omnibus, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_CopyOf, ''), COALESCE(Misc_CopyOf, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_InspectionReport, ''), COALESCE(Misc_InspectionReport, ''), '3') AS float) +
            CAST(Replace(COALESCE(Misc_PicDelivery, ''), COALESCE(Misc_PicDelivery, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_UpdatedTax, ''), COALESCE(Misc_UpdatedTax, ''), '1') AS float) +
			CAST(Replace(COALESCE(Misc_BookingDate, ''), COALESCE(Misc_BookingDate, ''), '1') AS float) +
			CAST(Replace(COALESCE(Misc_BCVRduedate, ''), COALESCE(Misc_BCVRduedate, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_PhilgepsRefNo, ''), COALESCE(Misc_PhilgepsRefNo, ''), '1') AS float)
        , '%') as Bidding,


    -- REGULATORY TOTAL
    CONCAT(
        CAST(
            Replace(COALESCE(Misc_hasCPR_CMDN, ''), COALESCE(Misc_hasCPR_CMDN, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_hasCGMP, ''), COALESCE(Misc_hasCGMP, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_DistriAgreement, ''), COALESCE(Misc_DistriAgreement, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_BatchCert, ''), COALESCE(Misc_BatchCert, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_CertAnalysis, ''), COALESCE(Misc_CertAnalysis, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_ListOfSources, ''), COALESCE(Misc_ListOfSources, ''), '1') AS float)
        , '%') as Regulatory,

    -- ENCODERS TOTAL
    CONCAT(
        CAST(
            Replace(COALESCE(Misc_WarrantyCert, ''), COALESCE(Misc_WarrantyCert, ''), '3') AS float) +
            CAST(Replace(COALESCE(Misc_Order_Guide, ''), COALESCE(Misc_Order_Guide, ''), '3') AS float) +
			CAST(Replace(COALESCE(Misc_Complete_Date, ''), COALESCE(Misc_Complete_Date, ''), '1') AS float) +
            CASE 
                WHEN COALESCE(PO_Amount, 0) = 0 
                THEN CAST('0' AS float) 
                ELSE CAST(((REPLACE(Product_Total, 0.01, 0) + COALESCE(Waive_Amount, 0)) / PO_Amount) * 0.33 * 100 AS float) 
            END
        , '%') as Encoders,

    -- ACCOUNTING TOTAL
    CONCAT(
        CAST(
            Replace(COALESCE(Misc_SalesInvoice, ''), COALESCE(Misc_SalesInvoice, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_DeliveryReceipt, ''), COALESCE(Misc_DeliveryReceipt, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_LetterOfCollection, ''), COALESCE(Misc_LetterOfCollection, ''), '2') AS float)
        , '%') as Accounting,

    -- WAREHOUSE TOTAL
    CONCAT(
        CAST(
            Replace(COALESCE(Misc_Date_of_Delivery, ''), COALESCE(Misc_Date_of_Delivery, ''), '5') AS float)
        , '%') as Warehouse,

    -- SUBTOTAL
    CONCAT(
        CAST(
            Replace(COALESCE(Misc_EligibilityDocs, ''), COALESCE(Misc_EligibilityDocs, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_hasPerformanceBond, ''), COALESCE(Misc_hasPerformanceBond, ''), '3') AS float) +
            CAST(Replace(COALESCE(Misc_RFQdate, ''), COALESCE(Misc_RFQdate, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_PQdate, ''), COALESCE(Misc_PQdate, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_NOAdate, ''), COALESCE(Misc_NOAdate, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_NTPdate, ''), COALESCE(Misc_NTPdate, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_POdate, ''), COALESCE(Misc_POdate, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_hasContractAgreement, ''), COALESCE(Misc_hasContractAgreement, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_Omnibus, ''), COALESCE(Misc_Omnibus, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_CopyOf, ''), COALESCE(Misc_CopyOf, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_InspectionReport, ''), COALESCE(Misc_InspectionReport, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_PicDelivery, ''), COALESCE(Misc_PicDelivery, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_UpdatedTax, ''), COALESCE(Misc_UpdatedTax, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_PhilgepsRefNo, ''), COALESCE(Misc_PhilgepsRefNo, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_hasCPR_CMDN, ''), COALESCE(Misc_hasCPR_CMDN, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_hasCGMP, ''), COALESCE(Misc_hasCGMP, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_DistriAgreement, ''), COALESCE(Misc_DistriAgreement, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_BatchCert, ''), COALESCE(Misc_BatchCert, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_CertAnalysis, ''), COALESCE(Misc_CertAnalysis, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_ListOfSources, ''), COALESCE(Misc_ListOfSources, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_SalesInvoice, ''), COALESCE(Misc_SalesInvoice, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_DeliveryReceipt, ''), COALESCE(Misc_DeliveryReceipt, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_LetterOfCollection, ''), COALESCE(Misc_LetterOfCollection, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_Date_of_Delivery, ''), COALESCE(Misc_Date_of_Delivery, ''), '5') AS float) +
            CAST(Replace(COALESCE(Misc_WarrantyCert, ''), COALESCE(Misc_WarrantyCert, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_Order_Guide, ''), COALESCE(Misc_Order_Guide, ''), '2') AS float) +
			CAST(Replace(COALESCE(Misc_BookingDate, ''), COALESCE(Misc_BookingDate, ''), '1') AS float) +
			CAST(Replace(COALESCE(Misc_BCVRduedate, ''), COALESCE(Misc_BCVRduedate, ''), '1') AS float) +
			CAST(Replace(COALESCE(Misc_Complete_Date, ''), COALESCE(Misc_Complete_Date, ''), '1') AS float) +
            CASE 
                WHEN COALESCE(PO_Amount, 0) = 0 
                THEN CAST('0' AS float) 
                ELSE CAST(((REPLACE(Product_Total, 0.01, 0) + COALESCE(Waive_Amount, 0)) / PO_Amount) * 0.33 * 100 AS float) 
            END
        , '%') as 'Grand Total',
        FORMAT(COALESCE(PO_Amount, 0), 'N2') as 'PO Amount' 

FROM TBL_Orders
LEFT JOIN TBL_Orders_Govt ON TBL_Orders_Govt.Order_no = TBL_Orders.Order_No
WHERE TBL_Orders.Order_Type like '%Govt%'
and Client_Terms not like 'Merge%'
and Order_Payment_Status = 'Unpaid'
and Client_Name not like '%LGU Bulan - Botica ng Bayan%'
and Year(TBL_Orders.Order_Date) >=  2023
and COALESCE(PO_Amount, 0) != 0
and CAST(
            Replace(COALESCE(Misc_EligibilityDocs, ''), COALESCE(Misc_EligibilityDocs, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_hasPerformanceBond, ''), COALESCE(Misc_hasPerformanceBond, ''), '3') AS float) +
            CAST(Replace(COALESCE(Misc_RFQdate, ''), COALESCE(Misc_RFQdate, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_PQdate, ''), COALESCE(Misc_PQdate, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_NOAdate, ''), COALESCE(Misc_NOAdate, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_NTPdate, ''), COALESCE(Misc_NTPdate, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_POdate, ''), COALESCE(Misc_POdate, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_hasContractAgreement, ''), COALESCE(Misc_hasContractAgreement, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_Omnibus, ''), COALESCE(Misc_Omnibus, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_CopyOf, ''), COALESCE(Misc_CopyOf, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_InspectionReport, ''), COALESCE(Misc_InspectionReport, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_PicDelivery, ''), COALESCE(Misc_PicDelivery, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_UpdatedTax, ''), COALESCE(Misc_UpdatedTax, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_PhilgepsRefNo, ''), COALESCE(Misc_PhilgepsRefNo, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_hasCPR_CMDN, ''), COALESCE(Misc_hasCPR_CMDN, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_hasCGMP, ''), COALESCE(Misc_hasCGMP, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_DistriAgreement, ''), COALESCE(Misc_DistriAgreement, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_BatchCert, ''), COALESCE(Misc_BatchCert, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_CertAnalysis, ''), COALESCE(Misc_CertAnalysis, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_ListOfSources, ''), COALESCE(Misc_ListOfSources, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_SalesInvoice, ''), COALESCE(Misc_SalesInvoice, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_DeliveryReceipt, ''), COALESCE(Misc_DeliveryReceipt, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_LetterOfCollection, ''), COALESCE(Misc_LetterOfCollection, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_Date_of_Delivery, ''), COALESCE(Misc_Date_of_Delivery, ''), '5') AS float) +
            CAST(Replace(COALESCE(Misc_WarrantyCert, ''), COALESCE(Misc_WarrantyCert, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_Order_Guide, ''), COALESCE(Misc_Order_Guide, ''), '2') AS float) +
			CAST(Replace(COALESCE(Misc_BookingDate, ''), COALESCE(Misc_BookingDate, ''), '1') AS float) +
			CAST(Replace(COALESCE(Misc_BCVRduedate, ''), COALESCE(Misc_BCVRduedate, ''), '1') AS float) +
			CAST(Replace(COALESCE(Misc_Complete_Date, ''), COALESCE(Misc_Complete_Date, ''), '1') AS float) +
            CASE 
                WHEN COALESCE(PO_Amount, 0) = 0 
                THEN CAST('0' AS float) 
                ELSE CAST(((REPLACE(Product_Total, 0.01, 0) + COALESCE(Waive_Amount, 0)) / PO_Amount) * 0.33 * 100 AS float) 
            END >= 90
order by CAST(
            Replace(COALESCE(Misc_EligibilityDocs, ''), COALESCE(Misc_EligibilityDocs, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_hasPerformanceBond, ''), COALESCE(Misc_hasPerformanceBond, ''), '3') AS float) +
            CAST(Replace(COALESCE(Misc_RFQdate, ''), COALESCE(Misc_RFQdate, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_PQdate, ''), COALESCE(Misc_PQdate, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_NOAdate, ''), COALESCE(Misc_NOAdate, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_NTPdate, ''), COALESCE(Misc_NTPdate, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_POdate, ''), COALESCE(Misc_POdate, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_hasContractAgreement, ''), COALESCE(Misc_hasContractAgreement, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_Omnibus, ''), COALESCE(Misc_Omnibus, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_CopyOf, ''), COALESCE(Misc_CopyOf, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_InspectionReport, ''), COALESCE(Misc_InspectionReport, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_PicDelivery, ''), COALESCE(Misc_PicDelivery, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_UpdatedTax, ''), COALESCE(Misc_UpdatedTax, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_PhilgepsRefNo, ''), COALESCE(Misc_PhilgepsRefNo, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_hasCPR_CMDN, ''), COALESCE(Misc_hasCPR_CMDN, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_hasCGMP, ''), COALESCE(Misc_hasCGMP, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_DistriAgreement, ''), COALESCE(Misc_DistriAgreement, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_BatchCert, ''), COALESCE(Misc_BatchCert, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_CertAnalysis, ''), COALESCE(Misc_CertAnalysis, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_ListOfSources, ''), COALESCE(Misc_ListOfSources, ''), '1') AS float) +
            CAST(Replace(COALESCE(Misc_SalesInvoice, ''), COALESCE(Misc_SalesInvoice, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_DeliveryReceipt, ''), COALESCE(Misc_DeliveryReceipt, ''), '4') AS float) +
            CAST(Replace(COALESCE(Misc_LetterOfCollection, ''), COALESCE(Misc_LetterOfCollection, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_Date_of_Delivery, ''), COALESCE(Misc_Date_of_Delivery, ''), '5') AS float) +
            CAST(Replace(COALESCE(Misc_WarrantyCert, ''), COALESCE(Misc_WarrantyCert, ''), '2') AS float) +
            CAST(Replace(COALESCE(Misc_Order_Guide, ''), COALESCE(Misc_Order_Guide, ''), '2') AS float) +
			CAST(Replace(COALESCE(Misc_BookingDate, ''), COALESCE(Misc_BookingDate, ''), '1') AS float) +
			CAST(Replace(COALESCE(Misc_BCVRduedate, ''), COALESCE(Misc_BCVRduedate, ''), '1') AS float) +
			CAST(Replace(COALESCE(Misc_Complete_Date, ''), COALESCE(Misc_Complete_Date, ''), '1') AS float) +
            CASE 
                WHEN COALESCE(PO_Amount, 0) = 0 
                THEN CAST('0' AS float) 
                ELSE CAST(((REPLACE(Product_Total, 0.01, 0) + COALESCE(Waive_Amount, 0)) / PO_Amount) * 0.33 * 100 AS float) 
            END desc
`,


'Procurement Audit': `


DECLARE @StartDate DATE = '2025-01-01';
DECLARE @EndDate   DATE = '2026-12-31';

SELECT
    O.Order_No                         AS [Order No],
    CAST(O.Order_Date AS DATE)         AS [Plot Date],
    DATEDIFF(day, O.Order_Date, @EndDate) AS [Days Lacking],
    O.Client_Name                      AS [Entity],
    COALESCE(O.Client_terms, '')       AS [PO Details],
    CAST(SUM(OD.QTY) AS DECIMAL(18,2)) AS [Stocks Delivered],
    COALESCE(O.PO_Amount, 0)           AS [PO Amount],
    COALESCE(OP.Cashout_Amount, 0)     AS [Cashout Amount],
    COALESCE(O.Waived_Amount, 0)       AS [Waived Amount],
    CAST((COALESCE(O.PO_Amount,0) - CAST(SUM(OD.QTY) AS DECIMAL(18,2))) AS DECIMAL(18,2)) AS [Procurement Lacking],
    CAST((COALESCE(O.PO_Amount,0) - CAST(SUM(OD.QTY) AS DECIMAL(18,2))) AS DECIMAL(18,2)) AS [Ordering Kiosk Lacking],
    CAST((CAST((COALESCE(O.PO_Amount,0) - CAST(SUM(OD.QTY) AS DECIMAL(18,2))) AS DECIMAL(18,2)) - CAST((COALESCE(O.PO_Amount,0) - CAST(SUM(OD.QTY) AS DECIMAL(18,2))) AS DECIMAL(18,2))) AS DECIMAL(18,2)) AS [Variance],
    COALESCE(O.Encoded_By, '')         AS [Encoder]
FROM TBL_Orders_Detail OD
INNER JOIN TBL_Orders O ON O.Order_No = OD.Order_No
INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
LEFT JOIN (
    SELECT Order_No, SUM(ISNULL(Payment_Amount, 0)) AS Cashout_Amount
    FROM TBL_Orders_Payment
    GROUP BY Order_No
) OP ON OP.Order_No = O.Order_No
WHERE O.Order_Date BETWEEN @StartDate AND @EndDate
GROUP BY
    O.Order_No, O.Order_Date, O.Client_Name, O.Client_terms,
    O.PO_Amount, O.Waived_Amount, O.Encoded_By, OP.Cashout_Amount
ORDER BY O.Order_No ASC`,

'OPEX: SOP/Cashout': `

-- ============================================================
-- MAIN REPORT: OPEX Record: Secret Operation Practice (SOP)
-- ============================================================
DECLARE @StartDate DATE = '2025-01-01';
DECLARE @EndDate   DATE = '2025-12-31';

SELECT 
    ISNULL(category,      '')                                 AS [Category],
    ISNULL(order_no,      '')                                 AS [Order No],
    ISNULL(CONVERT(VARCHAR(10), record_date, 120), '')      AS [Date],
    ISNULL(payee,         '')                                 AS [Payee],
    ISNULL(voucher_no,    '')                                 AS [Voucher No],
    ISNULL(payment_type,  '')                                 AS [Payment Type],
    ISNULL(check_no,      '')                                 AS [Check No],
    ISNULL(cashout,       0)                                  AS [CashOut],
    ISNULL(commitment,    0)                                  AS [Commitment],
    ISNULL(paper_use,     0)                                  AS [Paper Use],
    ISNULL(rebates,       0)                                  AS [Rebates]
FROM [BCVR-SBS].dbo.opex_sop_records
WHERE record_date BETWEEN @StartDate AND @EndDate
ORDER BY record_date ASC, voucher_no ASC
`,

'AR: SOP/Cashout': `

DECLARE @StartDate DATE = '2025-01-01';
DECLARE @EndDate   DATE = '2025-12-31';

-- ── Data Rows Only ─────────────────────────────────────────────
SELECT 
    trans_type      AS [Type],
    order_no        AS [Order No],
    CAST(trans_date AS VARCHAR(10)) AS [Date],
    contact_person  AS [Contact Person],
    cv_no           AS [CV No.],
    contact_no      AS [Contact No.],
    release_mode    AS [Release Mode],
    cashout         AS [Cashout],
    sop             AS [SOP]
FROM [BCVR-SBS].dbo.ar_sop_cashout
WHERE trans_date >= @StartDate 
  AND trans_date < DATEADD(DAY, 1, @EndDate)
ORDER BY trans_date ASC
`
};

async function syncQueryToSheet(spreadsheetId, query, sheetName) {
    let pool;
    try {
        pool = await new sql.ConnectionPool({
            user: 'intern', 
            password: 'intern2026', 
            server: '192.168.1.191',
            database: 'BCVR-IBS', 
            options: { encrypt: false, trustServerCertificate: true }
        }).connect();

        const result = await pool.request().query(query);

        // --- SPECIAL HANDLING: CSR/OE/RS (TRIPLE TABLE SYNC) ---
        if (sheetName === 'CSR/OE/RS') {
            const sets = result.recordsets;

            // Sheet layout (confirmed from screenshot):
            //   Row 1–4  : Section 1 headers (logo, title, totals, column labels)  → data starts row 5
            //   Row 5–8  : Section 1 data area  ← clear here (row 9 = Section 2 logo, must NOT be cleared)
            //   Row 9–12 : Section 2 headers (logo, title, totals, column labels)  → data starts row 13
            //   Row 13–15: Section 2 data area  ← clear here (row 16 = Section 3 logo, must NOT be cleared)
            //   Row 16–19: Section 3 headers (logo, title, totals, column labels)  → data starts row 20
            //   Row 20+  : Section 3 data area  ← clear here (no row cap)
            const rangesToClear = [
                `'${sheetName}'!A5:K8`,    // Section 1 data only (rows 5–8; row 9 = Section 2 logo — DO NOT touch)
                `'${sheetName}'!A13:K15`,  // Section 2 data only (rows 13–15; row 16 = Section 3 logo — DO NOT touch)
                `'${sheetName}'!A20:K1000` // Section 3 data (row 20 onwards — no row cap)
            ];

            await sheetsApi.spreadsheets.values.batchClear({
                spreadsheetId,
                requestBody: { ranges: rangesToClear }
            });

            const batchData = [];
            if (sets[0] && sets[0].length > 0) {
                batchData.push({ range: `'${sheetName}'!A5`,  values: sets[0].map(r => Object.values(r)) });
            }
            if (sets[1] && sets[1].length > 0) {
                batchData.push({ range: `'${sheetName}'!A13`, values: sets[1].map(r => Object.values(r)) });
            }
            if (sets[2] && sets[2].length > 0) {
                batchData.push({ range: `'${sheetName}'!A20`, values: sets[2].map(r => Object.values(r)) });
            }

            if (batchData.length > 0) {
                await sheetsApi.spreadsheets.values.batchUpdate({
                    spreadsheetId,
                    requestBody: { data: batchData, valueInputOption: 'USER_ENTERED' }
                });
                console.log(`✅ [${sheetName}] Multi-table sync completed.`);
            }
            return;
        }

        // --- SPECIAL HANDLING: Inv. Discrepancy (SIDE-BY-SIDE SYNC) ---
        // ✅ FIX: Positive data column changed from I → J.
        //         Column I is a blank spacer in the sheet; positive headers (Date, Inventory Group…)
        //         start at column J. Writing to I shifted all positive data one column left,
        //         causing the sheet's Total Positive formula (which references J onwards) to read 0.
        if (sheetName === 'Inv. Discrepancy') {
            const sets = result.recordsets; // [0] = Negative, [1] = Positive
            const startRow = 5;

            await sheetsApi.spreadsheets.values.batchClear({
                spreadsheetId,
                requestBody: { 
                    ranges: [
                        `'${sheetName}'!A${startRow}:H1000`,  // Negative side (cols A–H)
                        `'${sheetName}'!J${startRow}:Q1000`   // Positive side (cols J–Q, skipping spacer col I)
                    ] 
                }
            });

            const batchData = [];
            if (sets[0] && sets[0].length > 0) {
                batchData.push({ 
                    range: `'${sheetName}'!A${startRow}`, 
                    values: sets[0].map(r => Object.values(r)) 
                });
            }
            if (sets[1] && sets[1].length > 0) {
                batchData.push({ 
                    range: `'${sheetName}'!J${startRow}`, // ✅ col J, not I — I is a blank spacer
                    values: sets[1].map(r => Object.values(r)) 
                });
            }

            if (batchData.length > 0) {
                await sheetsApi.spreadsheets.values.batchUpdate({
                    spreadsheetId,
                    requestBody: { data: batchData, valueInputOption: 'USER_ENTERED' }
                });
                console.log(`✅ [${sheetName}] Side-by-side sync completed.`);
            }
            return;
        }

        // --- STANDARD SYNC LOGIC (With Dynamic startRow) ---
        const rows = result.recordset;
        if (rows && rows.length > 0) {
            let startRow = 5; // Default for most sheets
            
            if (sheetName === 'Remittance Deposit' || sheetName === 'Disbursement' || sheetName === 'Sales Invoice - Govt.' || sheetName === 'Sales Invoice' || sheetName === 'Remittance' || sheetName === 'OPEX') {
                startRow = 6; 
            } else if (sheetName === 'ST: SBS->DW' || sheetName === 'RT: DW->SBS') {
                startRow = 5;
            }
            const values = rows.map(r => Object.values(r));
            
            await sheetsApi.spreadsheets.values.clear({ 
                spreadsheetId, 
                range: `'${sheetName}'!A${startRow}:Z1000` 
            });

            await sheetsApi.spreadsheets.values.update({
                spreadsheetId,
                range: `'${sheetName}'!A${startRow}`,
                valueInputOption: 'USER_ENTERED', // Preserves currency formatting
                requestBody: { values },
            });
            console.log(`✅ [${sheetName}] Data synced at Row ${startRow}.`);
        } else {
            console.warn(`⚠️ [${sheetName}] No records found to fetch.`);
        }
    } catch (err) {
        console.error(`❌ [${sheetName}] Error:`, err.message);
    } finally {
        if (pool) await pool.close();
    }
}

async function runSyncCycle() {
    console.log(`\n🚀 STARTING SYNC CYCLE: ${new Date().toLocaleString()}`);
    const currentSpreadsheetId = await getSpreadsheetIdForCurrentMonth();

    if (!currentSpreadsheetId) return;

    for (const [tabName, sqlQuery] of Object.entries(queries)) {
        await syncQueryToSheet(currentSpreadsheetId, sqlQuery, tabName);
        // Using 3-second delay to avoid Google API rate limits
        await new Promise(resolve => setTimeout(resolve, 3000)); 
    }
    console.log(`\n✨ SYNC CYCLE FINISHED SUCCESSFULLY.\n`);
}

app.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
    runSyncCycle(); 
});