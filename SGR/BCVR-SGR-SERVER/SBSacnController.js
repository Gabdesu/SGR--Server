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
const FOLDER_ID = '1ZlrquPeXvzaJdAk1bqBLLFPL6m1nqaKm'; 

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
    const monthNames = ["BCVR [SGR_ACN_SBS_JAN_2026] BCVR Sorsogon Branch Store | January 2026 - Accounting",
                        "BCVR [SGR_ACN_SBS_FEB_2026] BCVR Sorsogon Branch Store | February 2026 - Accounting",
                        "BCVR [SGR_ACN_SBS_MAR_2026] BCVR Sorsogon Branch Store | March 2026 - Accounting",
                        "BCVR [SGR_ACN_SBS_APR_2026] BCVR Sorsogon Branch Store | April 2026 - Accounting",
                        "BCVR [SGR_ACN_SBS_MAY_2026] BCVR Sorsogon Branch Store | May 2026 - Accounting",
                        "BCVR [SGR_ACN_SBS_JUN_2026] BCVR Sorsogon Branch Store | June 2026 - Accounting",
                        "BCVR [SGR_ACN_SBS_JUL_2026] BCVR Sorsogon Branch Store | July 2026 - Accounting",
                        "BCVR [SGR_ACN_SBS_AUG_2026] BCVR Sorsogon Branch Store | August 2026 - Accounting",
                        "BCVR [SGR_ACN_SBS_SEP_2026] BCVR Sorsogon Branch Store | September 2026 - Accounting",
                        "BCVR [SGR_ACN_SBS_OCT_2026] BCVR Sorsogon Branch Store | October 2026 - Accounting",
                        "BCVR [SGR_ACN_SBS_NOV_2026] BCVR Sorsogon Branch Store | November 2026 - Accounting",
                        "BCVR [SGR_ACN_SBS_DEC_2026] BCVR Sorsogon Branch Store | December 2026 - Accounting"               
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
    'ST: SBS->DW': `
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

'RT: DW->SBS': `
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
FROM [BCVR-SBS].dbo.TBL_Physical_Count PC
INNER JOIN [BCVR-SBS].dbo.TBL_Physical_Count_Details PCD ON PC.P_ID = PCD.P_ID
LEFT  JOIN [BCVR-SBS].dbo.TBL_Category_Item_File CI ON PCD.Item_ID = CI.Item_ID
LEFT  JOIN [BCVR-SBS].dbo.TBL_Category_File CF ON CI.Catg_ID = CF.Catg_ID
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
FROM [BCVR-SBS].dbo.TBL_Physical_Count PC
INNER JOIN [BCVR-SBS].dbo.TBL_Physical_Count_Details PCD ON PC.P_ID = PCD.P_ID
LEFT  JOIN [BCVR-SBS].dbo.TBL_Category_Item_File CI ON PCD.Item_ID = CI.Item_ID
LEFT  JOIN [BCVR-SBS].dbo.TBL_Category_File CF ON CI.Catg_ID = CF.Catg_ID
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
SELECT 
    CONVERT(VARCHAR(16), [deposit_date], 120) AS [Deposit Date], -- Shows date and time
    [deposit_no] AS [Deposit No],
    [bank_details] AS [Bank],
    FORMAT(ISNULL([amount], 0), 'N2') AS [Amount],
    [deposit_type] AS [Deposit Type],
    [deposit_status] AS [Deposit Status]
FROM dbo.remittance_deposits
WHERE [deposit_date] BETWEEN '2026-02-01' AND '2026-02-28'
ORDER BY [deposit_date] ASC`,

'Opex': `
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
`,

'Commitment': `
DECLARE @StartDate DATE = '2025-01-01'; 
DECLARE @EndDate   DATE = '2026-02-28';

SELECT 
    ROW_NUMBER() OVER(ORDER BY O.Order_Date ASC) AS [ID],
    CAST(O.Order_Type AS NVARCHAR(50))           AS [Type],
    CAST(O.Order_No AS NVARCHAR(50))             AS [Order No],
    CONVERT(VARCHAR(10), O.Order_Date, 120)      AS [Date],
    CAST(O.Client_Name AS NVARCHAR(255))         AS [Recipient],
    CAST('' AS NVARCHAR(50))                     AS [CV No.],       
    CAST('' AS NVARCHAR(50))                     AS [Release Mode], 
    FORMAT(ISNULL(SUM(OD.TOTAL_COST), 0), 'N2')  AS [Cashout],
    CAST('0.00' AS NVARCHAR(50))                 AS [SOP],          
    CAST('0.00' AS NVARCHAR(50))                 AS [Paper use]     
FROM dbo.TBL_Orders O
INNER JOIN dbo.TBL_Orders_Detail OD ON O.Order_No = OD.Order_No
WHERE O.Order_Date BETWEEN @StartDate AND @EndDate
  -- 💡 Filter for specific recipients or order types here
  -- AND O.Order_Type LIKE '%Office Expenses%' 
  -- AND O.Client_Name LIKE '%Pharmacy%'
GROUP BY 
    O.Order_No, 
    O.Order_Date, 
    O.Order_Type, 
    O.Client_Name
ORDER BY O.Order_Date ASC;
`
};

async function syncQueryToSheet(spreadsheetId, query, sheetName) {
    let pool;
    try {
        pool = await new sql.ConnectionPool({
            user: 'intern', 
            password: 'intern2026', 
            server: '192.168.1.159',
            database: 'BCVR-SBS', 
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
            // Dynamic check: Transfer tabs start at Row 5, others at Row 6
            const startRow = (sheetName === 'ST: SBS->DW' || sheetName === 'RT: DW->SBS') ? 5 : 6; 
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