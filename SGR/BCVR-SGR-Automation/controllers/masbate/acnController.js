const { google } = require('googleapis');
const { auth, DATE } = require('../../config');

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
    const meta  = BRANCH_META[branchCode] || BRANCH_META['MBS'];
    const now   = new Date();
    const year  = now.getFullYear();
    const [shortMon, longMon] = MONTH_LABELS[now.getMonth()];
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
function buildQueries(dbName) {
const queries = {
    'ST: MBS->DW': `
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
      AND O.Client_Name NOT LIKE '%Distribution%'
      AND O.Client_Name NOT LIKE '%BCVR-DW%'
      AND O.Order_Date BETWEEN @StartDate AND @EndDate
    GROUP BY O.Order_No, O.Order_Date, O.Client_Name, O.Client_Address
) AS ST_Report
ORDER BY [Order Date] ASC`,

    'RT: DW->MBS': `
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
      AND (O.Client_Name LIKE '%Distribution%' OR O.Client_Name LIKE '%BCVR-DW%')
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
        ELSE NULL END, NULL)) AS [Released Date],
    LEFT(Order_Type, 4)       AS [Sales Category],
    Client_Name               AS [Entity],
    Client_terms              AS [PO Details],
    COALESCE(ReceiptNo_Note_Extra, '') AS [Invoice],
    CAST(Product_Total AS DECIMAL(18,2)) AS [Total Delivered],
    CAST(ISNULL(Waived_Amount, 0) AS DECIMAL(18,2)) AS [Total Waived],
    CAST(ISNULL(PO_Amount, 0) AS DECIMAL(18,2)) AS [Total PO]
FROM TBL_Orders
WHERE TRY_CONVERT(DATE, COALESCE(CASE WHEN CHARINDEX(' - ', Misc_SalesInvoice) > 0 
        THEN SUBSTRING(Misc_SalesInvoice, CHARINDEX(' - ', Misc_SalesInvoice) + 3, 
        LEN(Misc_SalesInvoice) - CHARINDEX(' - ', Misc_SalesInvoice) - 2) 
        ELSE NULL END, NULL)) BETWEEN @StartDate AND @EndDate
    AND COALESCE(ReceiptNo_Note_Extra, '') != ''
    AND Order_Type LIKE '%Govt%'
ORDER BY [Released Date]`,

    'Sales Invoice': `
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    CAST(Order_Date AS DATE)  AS [Released Date],
    LEFT(Order_Type, 4)       AS [Sales Category],
    Client_Name               AS [Entity],
    Client_terms              AS [PO Details],
    COALESCE(ReceiptNo_Note_Extra, '') AS [Invoice],
    CAST(Product_Total AS DECIMAL(18,2)) AS [Total Delivered]
FROM TBL_Orders
WHERE Order_Date BETWEEN @StartDate AND @EndDate
    AND COALESCE(ReceiptNo_Note_Extra, '') != ''
    AND Order_Type NOT LIKE '%Govt%'
ORDER BY [Released Date]`,

    // ✅ NOTE: Cross-DB access handled via fully-qualified [BCVR-IBS].dbo. table references.
    //          The connection pool database is still BCVR-SBS; the 3-part names do the routing.
    'Inv. Discrepancy': `
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

-- SECTION 1: Negative Variance
SELECT
    CAST(ISNULL(CONVERT(VARCHAR(10), PC.P_Date, 120), '')       AS NVARCHAR(50))  AS [Date],
    CAST(ISNULL(PC.P_Details, '')                               AS NVARCHAR(255)) AS [Inventory Group],
    CAST(ISNULL(CI.Item_Name, '')                               AS NVARCHAR(255)) AS [Product Name],
    CAST(FORMAT(ISNULL(CI.Item_Price, 0), 'N2')                 AS NVARCHAR(50))  AS [Capital],
    CAST(ISNULL(CAST(PCD.P_Counts  AS VARCHAR(20)), '0')        AS NVARCHAR(50))  AS [Physical],
    CAST(ISNULL(CAST(PCD.Total_QTY AS VARCHAR(20)), '0')        AS NVARCHAR(50))  AS [System],
    CAST((PCD.P_Counts - PCD.Total_QTY)                         AS NVARCHAR(50))  AS [Variance],
    CAST(FORMAT(ISNULL((PCD.P_Counts - PCD.Total_QTY) * CI.Item_Price, 0), 'N2') AS NVARCHAR(50)) AS [Peso Value]
FROM [BCVR-IBS].dbo.TBL_Physical_Count PC
INNER JOIN [BCVR-IBS].dbo.TBL_Physical_Count_Details PCD ON PC.P_ID = PCD.P_ID
LEFT  JOIN [BCVR-IBS].dbo.TBL_Category_Item_File CI ON PCD.Item_ID = CI.Item_ID
LEFT  JOIN [BCVR-IBS].dbo.TBL_Category_File CF ON CI.Catg_ID = CF.Catg_ID
WHERE PC.P_Date BETWEEN @StartDate AND @EndDate
  AND (PCD.P_Counts - PCD.Total_QTY) < 0
ORDER BY [Date] ASC;

-- SECTION 2: Positive Variance
SELECT
    CAST(ISNULL(CONVERT(VARCHAR(10), PC.P_Date, 120), '')       AS NVARCHAR(50))  AS [Date],
    CAST(ISNULL(PC.P_Details, '')                               AS NVARCHAR(255)) AS [Inventory Group],
    CAST(ISNULL(CI.Item_Name, '')                               AS NVARCHAR(255)) AS [Product Name],
    CAST(FORMAT(ISNULL(CI.Item_Price, 0), 'N2')                 AS NVARCHAR(50))  AS [Capital],
    CAST(ISNULL(CAST(PCD.P_Counts  AS VARCHAR(20)), '0')        AS NVARCHAR(50))  AS [Physical],
    CAST(ISNULL(CAST(PCD.Total_QTY AS VARCHAR(20)), '0')        AS NVARCHAR(50))  AS [System],
    CAST((PCD.P_Counts - PCD.Total_QTY)                         AS NVARCHAR(50))  AS [Variance],
    CAST(FORMAT(ISNULL((PCD.P_Counts - PCD.Total_QTY) * CI.Item_Price, 0), 'N2') AS NVARCHAR(50)) AS [Peso Value]
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

select Remittance_Date AS [Remittance Date], LEFT(Order_Type, 4) as Order_Type AS [Order Type], Total_Net AS [Total Net], Total_Remittance AS [Total Remittance],
Deposit_Deposited AS [Deposit Deposited], Cash_ShortOver AS [Cash Short/Over], Deposit_ShortOver AS [Deposit Short/Over], Total_Expense AS [Total Expense], Expense_Replenished AS [Expense Replenished]
from TBL_Remittance
where Remittance_Date between @SalesDate_From and @SalesDate_To
order by Remittance_Date;

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

SELECT 
    [deposit_date] AS [Deposit Date],
    [deposit_no] AS [Deposit No],
    [bank_name] AS [Bank],
    [amount] AS [Amount],
    [deposit_type] AS [Deposit Type],
    [deposit_status] AS [Deposit Status]
FROM dbo.TBL_Remittance_Deposit
WHERE [deposit_date] BETWEEN @Date_From AND @Date_To
ORDER BY [deposit_date] ASC`,

    'Opex': `
DECLARE @Date_From DATE = '${DATE.sql.start}';
DECLARE @Date_To   DATE = '${DATE.sql.end}';

SELECT 
    CAST(Date_Payment_Check AS DATE) AS [Date of Payment],
    ISNULL(OPEX_Particular, '-')     AS [OPEX Particular],
    ISNULL(Payee, 'N/A')             AS [Payee],
    ISNULL(OPEX_Category, '-')       AS [Category],
    ISNULL(Invoice_Number, '')       AS [Non-Official Inovice],
    ISNULL(Invoice_Number_Extra, '') AS [Sales Invoice],
    ISNULL(Invoice_Number_Plus, '')  AS [Sales Invoice (VAT Ex.)],
    ISNULL(Payment_Info, '')         AS [Check No.],
    CAST(ISNULL(Payment_Amount, 0) AS DECIMAL(18,2)) AS [Total Expense],
    CAST(CASE WHEN ISNULL(Invoice_Number, '') <> '' 
              THEN ISNULL(Payment_Amount, 0) ELSE 0 END AS DECIMAL(18,2)) AS [Total Non-Official Inovice],
    CAST(CASE WHEN ISNULL(Invoice_Number_Extra, '') <> '' 
              THEN ISNULL(Payment_Amount, 0) ELSE 0 END AS DECIMAL(18,2)) AS [Total Sales Invoice],
    CAST(CASE WHEN ISNULL(Invoice_Number_Plus, '') <> '' 
              THEN ISNULL(Payment_Amount, 0) ELSE 0 END AS DECIMAL(18,2)) AS [Total Sales Invoice (VAT Ex.)]
FROM dbo.TBL_Operational_Expense
WHERE Date_Payment_Check BETWEEN @Date_From AND @Date_To
  AND OPEX_Category NOT LIKE '%Cost Of Goods%'
ORDER BY [Date of Payment] ASC`,

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
    '' AS [Requestor]
FROM TBL_Orders_Payment p
LEFT JOIN TBL_Orders o ON p.Order_No = o.Order_No
WHERE p.Payment_Date BETWEEN @Date_From AND @Date_To

UNION ALL

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
    Encoded_by AS [Requestor]
FROM TBL_Operational_Expense
WHERE Voucher_date BETWEEN @Date_From AND @Date_To
ORDER BY [Date Processed] ASC`,

    'Disbursement Deposit': `
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
GROUP BY O.Order_No, O.Order_Date, O.Order_Type, O.Client_Name
ORDER BY O.Order_Date ASC`,

    'OPEX: SOP/Cashout': `
DECLARE @StartDate DATE = '${DATE.sql.start}';
DECLARE @EndDate   DATE = '${DATE.sql.end}';

SELECT 
    ISNULL(category,      '')                                 AS [Category],
    ISNULL(order_no,      '')                                 AS [Order No],
    ISNULL(CONVERT(VARCHAR(10), record_date, 120), '')        AS [Date],
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
ORDER BY record_date ASC, voucher_no ASC`,
}; // end queries
return queries;
} // end buildQueries

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

        // ── SPECIAL CASE: CSR/OE/RS (three stacked sections at fixed row anchors) ──
        // Section 1 → A5   Section 2 → A13   Section 3 → A20
        if (sheetName === 'CSR/OE/RS') {
            const sets = result.recordsets;

            await sheetsApi.spreadsheets.values.batchClear({
                spreadsheetId,
                requestBody: {
                    ranges: [
                        
                    ]
                }
            });

            const batchData = [];

            // Section 1
            if (sets?.[0]) {
                const h = sets[0].length ? getHeaders(sets[0]) : getHeadersFromColumns(sets[0]);
                if (h.length) {
                    const rows = sets[0].map(r => formatRow(r));
                    batchData.push({ range: `'${sheetName}'!A5`, values: [h, ...rows] });
                    if (!rows.length) console.warn(`⚠️  [${sheetName}] Section 1: 0 rows. Header written at A5.`);
                }
            }

            // Section 2
            if (sets?.[1]) {
                const h = sets[1].length ? getHeaders(sets[1]) : getHeadersFromColumns(sets[1]);
                if (h.length) {
                    const rows = sets[1].map(r => formatRow(r));
                    batchData.push({ range: `'${sheetName}'!A13`, values: [h, ...rows] });
                    if (!rows.length) console.warn(`⚠️  [${sheetName}] Section 2: 0 rows. Header written at A13.`);
                }
            }

            // Section 3
            if (sets?.[2]) {
                const h = sets[2].length ? getHeaders(sets[2]) : getHeadersFromColumns(sets[2]);
                if (h.length) {
                    const rows = sets[2].map(r => formatRow(r));
                    batchData.push({ range: `'${sheetName}'!A20`, values: [h, ...rows] });
                    if (!rows.length) console.warn(`⚠️  [${sheetName}] Section 3: 0 rows. Header written at A20.`);
                }
            }

            if (batchData.length > 0) {
                await sheetsApi.spreadsheets.values.batchUpdate({
                    spreadsheetId,
                    requestBody: { data: batchData, valueInputOption: 'USER_ENTERED' }
                });
                console.log(`✅ [${sheetName}] Multi-section sync complete.`);
            }
            return;
        }

        // ── SPECIAL CASE: Inv. Discrepancy (two side-by-side panels, both at row 5) ──
        // Left panel (Negative Variance) → A5:H   Right panel (Positive Variance) → J5:Q
        if (sheetName === 'Inv. Discrepancy') {
            const sets = result.recordsets;

            await sheetsApi.spreadsheets.values.batchClear({
                spreadsheetId,
                requestBody: {
                    ranges: [
                        `'${sheetName}'!A5:H1000`,
                        `'${sheetName}'!J5:Q1000`,
                    ]
                }
            });

            const batchData = [];

            // Left panel — Negative Variance
            if (sets?.[0]) {
                const h = sets[0].length ? getHeaders(sets[0]) : getHeadersFromColumns(sets[0]);
                if (h.length) {
                    const rows = sets[0].map(r => formatRow(r));
                    batchData.push({ range: `'${sheetName}'!A5`, values: [h, ...rows] });
                    if (!rows.length) console.warn(`⚠️  [${sheetName}] Left (Negative): 0 rows. Header written at A5.`);
                }
            }

            // Right panel — Positive Variance
            if (sets?.[1]) {
                const h = sets[1].length ? getHeaders(sets[1]) : getHeadersFromColumns(sets[1]);
                if (h.length) {
                    const rows = sets[1].map(r => formatRow(r));
                    batchData.push({ range: `'${sheetName}'!J5`, values: [h, ...rows] });
                    if (!rows.length) console.warn(`⚠️  [${sheetName}] Right (Positive): 0 rows. Header written at J5.`);
                }
            }

            if (batchData.length > 0) {
                await sheetsApi.spreadsheets.values.batchUpdate({
                    spreadsheetId,
                    requestBody: { data: batchData, valueInputOption: 'USER_ENTERED' }
                });
                console.log(`✅ [${sheetName}] Side-by-side sync complete.`);
            }
            return;
        }

        // ── ALL OTHER SHEETS: header + data starting at A5 ───────────────────────
        const rows = result.recordset;

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
                valueInputOption: 'USER_ENTERED',
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

exports.run = async (pool, folderId, branchCode, dbName) => {
    console.log(`\n📊 [ACN] Sync started at ${new Date().toLocaleString()}`);

    const queries = buildQueries(dbName);

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