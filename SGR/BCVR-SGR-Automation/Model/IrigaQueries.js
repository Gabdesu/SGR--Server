const { DATE } = require('../config');

// =============================================================================
// IRIGA QUERIES
// Centralized SQL query repository for Iriga branch controllers.
// Used by: acnController.js | prdController.js | slsController.js
// =============================================================================


// --- ACN (Accounting) QUERIES ---
// NOTE: Cross-DB access handled via fully-qualified [BCVR-IBS].dbo. / [BCVR-SBS].dbo. table references.
function buildAcnQueries(dbName) {
    return {
        'ST: IBS->DW': `
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

        'ST: IBS->PHSSI': `
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

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

        'RT: PHSSI->IBS': `
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

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
SET @SalesDate_From = '${DATE.sql.start}';
SET @SalesDate_To   = '${DATE.sql.end}';

select Remittance_Date AS [Remittance Date], LEFT(Order_Type, 4) AS [Sales Category], Total_Net AS [Total Net], Total_Remittance AS [Total Remittance],
Deposit_Deposited AS [Deposited], Cash_ShortOver AS [Cash Short/Over], Deposit_ShortOver AS [Deposit Short/Over], Total_Expense AS [Total Expense], Expense_Replenished AS [Expense Replenished] from TBL_Remittance
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
DECLARE @Date_From DATE = '${DATE.sql.start}';
DECLARE @Date_To   DateTime = '${DATE.sql.datetimeEnd}';

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
OPEX_Category AS [Category],
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
FROM [BCVR-SBS].dbo.disbursement_deposits
WHERE deposit_date >= '${DATE.sql.start}'
  AND deposit_date < '${DATE.sql.end}'
ORDER BY deposit_date ASC`,


        'Govt. Collection Forecast': `

DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

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


DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

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
FROM [BCVR-SBS].dbo.opex_sop_records
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
FROM [BCVR-SBS].dbo.ar_sop_cashout
WHERE trans_date >= @StartDate 
  AND trans_date < DATEADD(DAY, 1, @EndDate)
ORDER BY trans_date ASC
`
    }; // end ACN queries
} // end buildAcnQueries


// --- PRD (Products) QUERIES ---
function buildPrdQueries() {
    return {
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
    }; // end PRD queries
} // end buildPrdQueries


// --- SLS (Sales) QUERIES ---
function buildSlsQueries() {
    return {
        'BFGS-Booking': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            O.Order_Date AS [Booking Date],
            CASE
                WHEN I.Catg_ID IN (392979, 564572, 91602, 81593) THEN 'MEDICINES'
                WHEN I.Catg_ID IN (272586, 322690, 202276, 91931, 101946, 91901, 493490, 91936, 91908) THEN 'SUPPLIES'
                ELSE 'OTHER'
            END          AS [Sales Category],
            O.Client_Name    AS [Entity],
            O.Client_Address AS [End User],
            O.Order_Type     AS [PO Details],
            O.PO_Amount      AS [PO Amount],
            O.Payment_Amount AS [Total Delivered]
        FROM TBL_Orders O
        INNER JOIN TBL_Orders_Detail OD ON O.Order_No = OD.Order_No
        INNER JOIN TBL_Category_Item_File I ON OD.Item_ID = I.Item_ID
        WHERE (CAST(O.Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
          AND (O.Order_Type LIKE '%Iriga Field Government%' OR O.Order_Type LIKE '%BFGS%')
        ORDER BY O.Order_Date ASC`,

        'BFGS-Delivered': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            Order_Date              AS [Order Date],
            Client_Name             AS [Client Name],
            Client_Address          AS [Client Address],
            Misc_NOAdate            AS [Non-official Invoice],
            Misc_SalesInvoice       AS [Sales Invoice],
            Misc_DeliveryReceipt    AS [Official Delivery Receipt],
            ''                      AS [Charge Invoice],
            0.00                    AS [DM],
            0.00                    AS [MSDE],
            0.00                    AS [GM],
            0.00                    AS [LSAE],
            0.00                    AS [OSEF],
            0.00                    AS [ASME],
            0.00                    AS [REEV],
            PO_Amount               AS [Total Peso Sale]
        FROM TBL_Orders
        WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
          AND (Order_Type LIKE '%Iriga Field Government%' OR Order_Type LIKE '%BFGS%')
        ORDER BY Order_Date ASC`,

        'BFGS-Collected': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            O.Order_No              AS [Order No],
            O.Order_Date            AS [Booking Date],
            O.Misc_PODate           AS [Payment Date],
            ''                      AS [Check Date],
            O.Client_Name           AS [Procuring Entity],
            O.Order_Type            AS [Order Details],
            'Order Slip#' + CAST(O.Order_No AS VARCHAR(20)) AS [Non-official Invoice],
            O.Misc_SalesInvoice     AS [Sales Invoice],
            O.Misc_DeliveryReceipt  AS [Official Delivery Receipt],
            ''                      AS [Charge Invoice],
            O.Misc_RFQDate          AS [RFQ Date],
            O.Misc_PQDate           AS [PQ Date],
            O.Misc_NOAdate          AS [NOA Date],
            O.Misc_NTPdate          AS [NTP Date],
            O.Misc_PODate           AS [PO Date],
            O.Order_Payment_Status  AS [Payment Type],
            0.00                    AS [Tax Amount],
            O.PO_Amount             AS [Stocks Delivered],
            O.Payment_Amount        AS [Net Collected]
        FROM TBL_Orders O
        WHERE (CAST(O.Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
          AND (O.Order_Type LIKE '%Iriga Field Government%' OR O.Order_Type LIKE '%BFGS%')
        ORDER BY O.Order_Date ASC`,

        'BWRS-Delivered': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            Order_Date              AS [Order Date],
            Client_Name             AS [Client Name],
            Client_Address          AS [Client Address],
            Misc_NOAdate            AS [Non-official Invoice],
            Misc_SalesInvoice       AS [Sales Invoice],
            Misc_DeliveryReceipt    AS [Official Delivery Receipt],
            ''                      AS [Charge Invoice],
            0.00                    AS [DM],
            0.00                    AS [MSDE],
            0.00                    AS [GM],
            0.00                    AS [LSAE],
            0.00                    AS [OSEF],
            0.00                    AS [ASME],
            0.00                    AS [REEV],
            PO_Amount               AS [Total Peso Sale]
        FROM TBL_Orders
        WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
          AND (Order_Type LIKE '%Iriga Wholesale Retail Sales%' OR Order_Type LIKE '%BWRS%')
        ORDER BY Order_Date ASC`,

        'BWRS-Collected': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            Order_No                AS [Order No],
            Order_Date              AS [Booking Date],
            Misc_PODate             AS [Payment Date],
            ''                      AS [Check Date],
            Client_Name             AS [Entity],
            Order_Type              AS [Order Details],
            Misc_NOAdate            AS [Non-official Invoice],
            Misc_SalesInvoice       AS [Sales Invoice],
            Misc_DeliveryReceipt    AS [Delivery Receipt],
            ''                      AS [Charge Invoice],
            Order_Payment_Status    AS [Payment Type],
            ''                      AS [Bank Details],
            0.00                    AS [Discount],
            0.00                    AS [Return],
            0.00                    AS [Rebates],
            0.00                    AS [Tax],
            0.00                    AS [Other Charges],
            PO_Amount               AS [Sales Delivered],
            Payment_Amount          AS [Net Collected]
        FROM TBL_Orders
        WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
          AND (Order_Type LIKE '%Iriga%' OR Order_Type LIKE '%BWRS%')
        ORDER BY Order_Date ASC`,

        'Top 30': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT TOP 30 'BWRS' AS [BOSC], Client_Name AS [Entity], SUM(ISNULL(PO_Amount, 0)) AS [Total PO]
        FROM TBL_Orders WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
        AND (Order_Type LIKE '%Iriga%' OR Order_Type LIKE '%BWRS%')
        GROUP BY Client_Name ORDER BY SUM(ISNULL(PO_Amount, 0)) DESC;

        SELECT TOP 30 'BWRS' AS [BOSC], Client_Name AS [Entity], SUM(CASE WHEN Misc_DeliveryReceipt IS NOT NULL THEN ISNULL(PO_Amount, 0) ELSE 0 END) AS [Total Delivered]
        FROM TBL_Orders WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
        AND (Order_Type LIKE '%Iriga%' OR Order_Type LIKE '%BWRS%')
        GROUP BY Client_Name ORDER BY SUM(ISNULL(PO_Amount, 0)) DESC;

        SELECT TOP 30 'BWRS' AS [BOSC], Client_Name AS [Entity], SUM(ISNULL(Payment_Amount, 0)) AS [Total Collected]
        FROM TBL_Orders WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
        AND (Order_Type LIKE '%Iriga%' OR Order_Type LIKE '%BWRS%')
        GROUP BY Client_Name ORDER BY SUM(ISNULL(PO_Amount, 0)) DESC`,

        'Top AR': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT TOP 30
            ''              AS [#],
            'BWRS'          AS [BOSC],
            Client_Name     AS [Entity],
            SUM(ISNULL(PO_Amount, 0)) - SUM(ISNULL(Payment_Amount, 0)) AS [Total Balance]
        FROM TBL_Orders
        WHERE (CAST(Order_Date AS DATE) BETWEEN @StartDate AND @EndDate)
          AND (Order_Type LIKE '%Iriga%' OR Order_Type LIKE '%BWRS%')
        GROUP BY Client_Name
        HAVING SUM(ISNULL(PO_Amount, 0)) - SUM(ISNULL(Payment_Amount, 0)) > 0
        ORDER BY [Total Balance] DESC`,

        'Top Inactive': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT TOP 30
            ''  AS [#],
            CASE
                WHEN Order_Type LIKE '%Government%' OR Order_Type LIKE '%BFGS%' THEN 'BFGS'
                ELSE 'BWRS'
            END AS [BOSC],
            Client_Name AS [Entity],
            SUM(ISNULL(PO_Amount, 0)) AS [Total Consumption]
        FROM TBL_Orders
        WHERE (Order_Type LIKE '%Iriga%' OR Order_Type LIKE '%BWRS%' OR Order_Type LIKE '%BFGS%')
        GROUP BY Client_Name, Order_Type
        HAVING MAX(CAST(Order_Date AS DATE)) < @StartDate
        ORDER BY [Total Consumption] DESC`,

        'New Clients': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            ''              AS [#],
            FORMAT(MIN(O.Order_Date), 'yyyy-MM-dd') AS [Date Added],
            O.Client_Name   AS [Name],
            O.Client_Address AS [Address],
            O.Order_Type    AS [Type]
        FROM TBL_Orders O
        WHERE (O.Order_Type LIKE '%Iriga%' OR O.Order_Type LIKE '%BWRS%' OR O.Order_Type LIKE '%BFGS%')
        GROUP BY O.Client_Name, O.Client_Address, O.Order_Type
        HAVING MIN(CAST(O.Order_Date AS DATE)) BETWEEN @StartDate AND @EndDate
        ORDER BY [Date Added] ASC`,

        'Active Clients Update Audit': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            ''              AS [#],
            FORMAT(MIN(Order_Date), 'yyyy-MM-dd') AS [Date Recorded],
            CASE
                WHEN Order_Type LIKE '%Government%' OR Order_Type LIKE '%BFGS%' THEN 'BFGS'
                ELSE 'BWRS'
            END             AS [Sales Category],
            Client_Name     AS [Entity],
            FORMAT(MAX(Order_Date), 'yyyy-MM-dd') AS [Most Recent Order Date],
            COUNT(Order_No) AS [No. of Transactions]
        FROM TBL_Orders
        WHERE (Order_Type LIKE '%Iriga%' OR Order_Type LIKE '%BWRS%' OR Order_Type LIKE '%BFGS%')
        GROUP BY Client_Name, Order_Type
        HAVING MAX(Order_Date) >= @StartDate
        ORDER BY [No. of Transactions] DESC`,

        'New Client Contacts': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            ''      AS [#],
            CASE WHEN Order_Type LIKE '%BFGS%' THEN 'BFGS' ELSE 'BWRS' END AS [Sales Category],
            Client_Name AS [Entity],
            ''      AS [Contact Person],
            ''      AS [Position],
            ''      AS [Department],
            ''      AS [Birthday],
            ''      AS [Contact Number],
            ''      AS [Email Address],
            'New Client March 2026' AS [Remarks]
        FROM TBL_Orders
        GROUP BY Client_Name, Order_Type
        HAVING MIN(CAST(Order_Date AS DATE)) BETWEEN @StartDate AND @EndDate`,

        'Canvass Details': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            O.Order_No      AS [Canvass No],
            CAST(O.Order_Date AS DATE) AS [Plot Date],
            O.Client_Name   AS [Canvass Name],
            CASE
                WHEN O.Order_Type LIKE '%BFGS%' THEN 'BFGS'
                ELSE 'BWRS'
            END             AS [Sales Category],
            ''              AS [End User],
            'Iriga Staff' AS [Canvasser Name],
            ''              AS [Contact],
            ''              AS [Designation],
            'YES'           AS [Approved?],
            'WON'           AS [Result],
            O.PO_Amount     AS [ABC Total],
            O.PO_Amount     AS [Canvass Total],
            'System'        AS [Encoder]
        FROM TBL_Orders O
        WHERE CAST(O.Order_Date AS DATE) BETWEEN @StartDate AND @EndDate
          AND (O.Order_Type LIKE '%Iriga%' OR O.Order_Type LIKE '%BWRS%' OR O.Order_Type LIKE '%BFGS%')
        ORDER BY O.Order_Date ASC`,

        'Ordering Kiosk Details': `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            CASE
                WHEN O.Order_Type LIKE '%BFGS%' THEN 'BFGS'
                ELSE 'BWRS'
            END             AS [Sales Category],
            O.Order_No      AS [Order No],
            CAST(O.Order_Date AS DATE) AS [Booking Date],
            CAST(O.Order_Date AS DATE) AS [Order Date],
            O.Client_Name   AS [Entity],
            O.Client_Address AS [Address],
            ''              AS [End User/Requestor],
            'System_User'   AS [Encoder],
            ''              AS [Picker],
            ''              AS [Checker],
            ''              AS [Packer],
            O.Order_No      AS [Canvass No./SRF No.],
            O.Order_Type    AS [PO Details / Order Details],
            O.PO_Amount     AS [PO Amount / Order Total]
        FROM TBL_Orders O
        WHERE CAST(O.Order_Date AS DATE) BETWEEN @StartDate AND @EndDate
          AND (O.Order_Type LIKE '%Iriga%' OR O.Order_Type LIKE '%BWRS%' OR O.Order_Type LIKE '%BFGS%')
        ORDER BY O.Order_No ASC`,
    }; // end SLS queries
} // end buildSlsQueries


module.exports = { buildAcnQueries, buildPrdQueries, buildSlsQueries };
