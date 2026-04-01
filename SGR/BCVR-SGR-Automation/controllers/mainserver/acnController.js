const { google } = require('googleapis');
const { auth, DATE } = require('../../config'); // Use the shared auth from config

const sheetsApi = google.sheets({ version: 'v4', auth });
const driveApi = google.drive({ version: 'v3', auth });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- BRANCH METADATA MAP ---
const BRANCH_META = {
    SBS: { prefix: 'SGR_ACN_SBS', label: 'Sorsogon Branch Store' },
    MBS: { prefix: 'SGR_ACN_MBS', label: 'Masbate Branch Store'  },
    IBS: { prefix: 'SGR_ACN_IBS', label: 'Iriga Branch Store'    },
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

    const currentFileName = `BCVR [${meta.prefix}_${shortMon}_${year}] BCVR ${meta.label} | ${longMon} ${year} - Accounting`;
    console.log(`🔎 [ACN] Searching Drive folder for: "${currentFileName}" (Branch: ${branchCode})`);

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
// dbName is injected at runtime so queries work for any branch (SBS, MBS, IBS)
function buildQueries(dbName) {
const queries = {
    'ST: SBS->DW': `
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

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
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

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
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

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
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

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

DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

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
FROM [${dbName}].dbo.TBL_Physical_Count PC
INNER JOIN [${dbName}].dbo.TBL_Physical_Count_Details PCD ON PC.P_ID = PCD.P_ID
LEFT  JOIN [${dbName}].dbo.TBL_Category_Item_File CI ON PCD.Item_ID = CI.Item_ID
LEFT  JOIN [${dbName}].dbo.TBL_Category_File CF ON CI.Catg_ID = CF.Catg_ID
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
FROM [${dbName}].dbo.TBL_Physical_Count PC
INNER JOIN [${dbName}].dbo.TBL_Physical_Count_Details PCD ON PC.P_ID = PCD.P_ID
LEFT  JOIN [${dbName}].dbo.TBL_Category_Item_File CI ON PCD.Item_ID = CI.Item_ID
LEFT  JOIN [${dbName}].dbo.TBL_Category_File CF ON CI.Catg_ID = CF.Catg_ID
WHERE PC.P_Date BETWEEN @StartDate AND @EndDate
  AND (PCD.P_Counts - PCD.Total_QTY) > 0
ORDER BY [Date] ASC`,


'Remittance': `
DECLARE @SalesCategory VARCHAR(MAX);
DECLARE @SalesDate_From Date; 
DECLARE @SalesDate_To Date;

SET @SalesCategory = '%%';
SET @SalesDate_From = '${DATE.sql.start}';
SET @SalesDate_To   = '${DATE.sql.end}';

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
WHERE [deposit_date] BETWEEN '${DATE.sql.start}' AND '${DATE.sql.end}'
ORDER BY [deposit_date] ASC`,

'Opex': `
DECLARE @Date_From DATE = '${DATE.sql.start}';
DECLARE @Date_To   DATE = '${DATE.sql.end}';

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
where Year(Date_Payment_Check) = ${DATE.sql.year}
and OPEX_Category not in (
'Cost Of Goods 1',
'Cost Of Goods 2'
)
group by OPEX_Category`,


'Disbursement': `
DECLARE @Date_From DateTime = '${DATE.sql.datetimeStart}';
DECLARE @Date_To   DateTime = '${DATE.sql.datetimeEnd}';

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
FROM [${dbName}].dbo.disbursement_deposits
WHERE deposit_date >= '${DATE.sql.start}'
  AND deposit_date < '${DATE.sql.end}'
ORDER BY deposit_date ASC`,

'OPEX: SOP/Cashout': `

-- ============================================================
-- MAIN REPORT: OPEX Record: Secret Operation Practice (SOP)
-- ============================================================
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

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
FROM [${dbName}].dbo.opex_sop_records
WHERE record_date BETWEEN @StartDate AND @EndDate
ORDER BY record_date ASC, voucher_no ASC
`,

'AR: SOP/Cashout': `

DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

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
FROM [${dbName}].dbo.ar_sop_cashout
WHERE trans_date >= @StartDate 
  AND trans_date < DATEADD(DAY, 1, @EndDate)
ORDER BY trans_date ASC
`,

'Commitment': `
DECLARE @StartDate DATE = '${DATE.sql.start}'; 
DECLARE @EndDate   DATE = '${DATE.sql.end}';

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
}; // end queries
return queries;
} // end buildQueries

// --- FORMATTING HELPERS ---
const PESO_KEYS = /price|total|value|sold|amount|cost|capital|peso|cashout|sop|expense|check.amount|request.amount|released.amount|net|remittance|deposit(?!.no|.type|.status|.date)/i;
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

// --- Extract headers from recordset (works when data exists) ---
function getHeaders(recordset) {
    if (!recordset || recordset.length === 0) return [];
    return Object.keys(recordset[0]);
}

// --- Extract headers from mssql column metadata (works even on 0-row results) ---
function getHeadersFromColumns(recordset) {
    return Object.keys(recordset?.columns || {});
}

// --- UPDATED HELPER: Uses the pool passed from Server.js ---
async function syncQueryToSheet(pool, spreadsheetId, query, sheetName) {
    try {
        // Use the pool provided by Server.js
        const result = await pool.request().query(query);

        // --- SPECIAL HANDLING: CSR/OE/RS (TRIPLE TABLE SYNC) ---
        if (sheetName === 'CSR/OE/RS') {
            const sets = result.recordsets;
            const rangesToClear = [
                `'${sheetName}'!A5:K8`,    // Section 1 data
                `'${sheetName}'!A13:K15`,  // Section 2 data
                `'${sheetName}'!A20:K1000` // Section 3 data
            ];

            await sheetsApi.spreadsheets.values.batchClear({
                spreadsheetId,
                requestBody: { ranges: rangesToClear }
            });

            const batchData = [];
            
            // ✅ ADD HEADERS FOR EACH SECTION (using helper functions)
            const headers1 = sets[0] && sets[0].length > 0 ? getHeaders(sets[0]) : getHeadersFromColumns(sets[0]);
            if (headers1.length > 0) {
                const rows1 = (sets[0] || []).map(r => formatRow(r));
                batchData.push({ range: `'${sheetName}'!A5`, values: [headers1, ...rows1] });
            }
            
            const headers2 = sets[1] && sets[1].length > 0 ? getHeaders(sets[1]) : getHeadersFromColumns(sets[1]);
            if (headers2.length > 0) {
                const rows2 = (sets[1] || []).map(r => formatRow(r));
                batchData.push({ range: `'${sheetName}'!A13`, values: [headers2, ...rows2] });
            }
            
            const headers3 = sets[2] && sets[2].length > 0 ? getHeaders(sets[2]) : getHeadersFromColumns(sets[2]);
            if (headers3.length > 0) {
                const rows3 = (sets[2] || []).map(r => formatRow(r));
                batchData.push({ range: `'${sheetName}'!A20`, values: [headers3, ...rows3] });
            }

            if (batchData.length > 0) {
                await sheetsApi.spreadsheets.values.batchUpdate({
                    spreadsheetId,
                    requestBody: { data: batchData, valueInputOption: 'USER_ENTERED' }
                });
                console.log(`✅ [${sheetName}] Multi-table sync completed with headers.`);
            }
            return;
        }

        // --- SPECIAL HANDLING: Inv. Discrepancy (SIDE-BY-SIDE SYNC) ---
        if (sheetName === 'Inv. Discrepancy') {
            const sets = result.recordsets; 
            const startRow = 5;

            await sheetsApi.spreadsheets.values.batchClear({
                spreadsheetId,
                requestBody: { 
                    ranges: [
                        `'${sheetName}'!A${startRow}:H1000`, 
                        `'${sheetName}'!J${startRow}:Q1000` 
                    ] 
                }
            });

            const batchData = [];
            
            // ✅ ADD HEADERS FOR NEGATIVE VARIANCE SECTION (using helper functions)
            const headersNeg = sets[0] && sets[0].length > 0 ? getHeaders(sets[0]) : getHeadersFromColumns(sets[0]);
            if (headersNeg.length > 0) {
                const rowsNeg = (sets[0] || []).map(r => formatRow(r));
                batchData.push({ range: `'${sheetName}'!A${startRow}`, values: [headersNeg, ...rowsNeg] });
            }
            
            // ✅ ADD HEADERS FOR POSITIVE VARIANCE SECTION (using helper functions)
            const headersPos = sets[1] && sets[1].length > 0 ? getHeaders(sets[1]) : getHeadersFromColumns(sets[1]);
            if (headersPos.length > 0) {
                const rowsPos = (sets[1] || []).map(r => formatRow(r));
                batchData.push({ range: `'${sheetName}'!J${startRow}`, values: [headersPos, ...rowsPos] });
            }

            if (batchData.length > 0) {
                await sheetsApi.spreadsheets.values.batchUpdate({
                    spreadsheetId,
                    requestBody: { data: batchData, valueInputOption: 'USER_ENTERED' }
                });
                console.log(`✅ [${sheetName}] Side-by-side sync completed with headers at Row ${startRow}.`);
            }
            return;
        }

        // --- STANDARD SYNC LOGIC WITH HEADERS ---
        const rows = result.recordset;
        const values = [];

        // ✅ EXTRACT HEADERS: Get column names from data or metadata
        const headers = rows && rows.length > 0
            ? getHeaders(rows)
            : getHeadersFromColumns(rows);

        if (headers.length > 0) {
            // Add headers as first row
            values.push(headers);
            
            // ✅ ADD DATA ROWS: Map and format each row
            if (rows && rows.length > 0) {
                rows.forEach(r => values.push(formatRow(r)));
            }

            // Clear data range and upload with headers starting at A5
            const clearRange = `'${sheetName}'!A5:Z1000`;
            const uploadRange = `'${sheetName}'!A5`;

            await sheetsApi.spreadsheets.values.clear({ 
                spreadsheetId, 
                range: clearRange
            });

            await sheetsApi.spreadsheets.values.update({
                spreadsheetId,
                range: uploadRange,
                valueInputOption: 'USER_ENTERED', 
                requestBody: { values },
            });
            
            if (rows && rows.length > 0) {
                console.log(`✅ [${sheetName}] Data synced: ${rows.length} rows + 1 header at A5.`);
            } else {
                console.warn(`⚠️ [${sheetName}] No records found. Header written at A5.`);
            }
        } else {
            console.warn(`⚠️ [${sheetName}] No data and no columns available.`);
        }
    } catch (err) {
        console.error(`❌ [${sheetName}] Error:`, err.message);
    }
    // CRITICAL: Removed pool.close() so other controllers can continue
}

// --- EXPORTED RUN FUNCTION: Called by Server.js ---
exports.run = async (pool, folderId, branchCode, dbName) => {
    console.log(`
📊 [ACN] Sync started at ${new Date().toLocaleString()}`);
    
    const queries = buildQueries(dbName);

    // Pass folderId + branchCode to find the correct branch spreadsheet
    const currentSpreadsheetId = await getSpreadsheetIdForCurrentMonth(folderId, branchCode);

    if (!currentSpreadsheetId) {
        console.log('[ACN] ⚠️  Sync aborted: could not find target spreadsheet.');
        return;
    }

    const tabNames = Object.keys(queries);
    console.log(`📋 [ACN] Processing ${tabNames.length} tab(s)...`);
    for (let i = 0; i < tabNames.length; i++) {
        const tabName = tabNames[i];
        console.log(`   ⏳ [ACN] [${i+1}/${tabNames.length}] Syncing: "${tabName}"...`);
        await syncQueryToSheet(pool, currentSpreadsheetId, queries[tabName], tabName);
        await sleep(3000);
    }
    console.log('✨ [ACN] All tabs synced successfully.');
};