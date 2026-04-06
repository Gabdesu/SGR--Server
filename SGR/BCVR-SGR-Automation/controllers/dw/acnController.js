const { google } = require("googleapis");
const { auth, DATE } = require("../../config");

const sheetsApi = google.sheets({ version: "v4", auth });
const driveApi = google.drive({ version: "v3", auth });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- BRANCH METADATA MAP ---
const BRANCH_META = {
  DW: { prefix: "SGR_ACN_DW", label: "Distribution Warehouse" }
};

const MONTH_LABELS = [
  ["JAN", "January"],
  ["FEB", "February"],
  ["MAR", "March"],
  ["APR", "April"],
  ["MAY", "May"],
  ["JUN", "June"],
  ["JUL", "July"],
  ["AUG", "August"],
  ["SEP", "September"],
  ["OCT", "October"],
  ["NOV", "November"],
  ["DEC", "December"],
];

// --- HELPER: FIND SPREADSHEET BY CURRENT MONTH NAME ---
async function getSpreadsheetIdForCurrentMonth(folderId, branchCode) {
  const meta = BRANCH_META[branchCode] || BRANCH_META["DW"];

  const now = new Date();

  // Target LAST month (mirrors config.js buildLastMonthRange logic)
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1; // 0-indexed for MONTH_LABELS
  const [shortMon, longMon] = MONTH_LABELS[month];

  const currentFileName = `BCVR [${meta.prefix}_${shortMon}_${year}] BCVR ${meta.label} | ${longMon} ${year} - Accounting`;
  console.log(
    `🔎 [ACN] Searching Drive folder for: "${currentFileName}" (Branch: ${branchCode})`,
  );

  try {
    const response = await driveApi.files.list({
      q: `'${folderId}' in parents and name contains '${currentFileName}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
      fields: "files(id, name)",
    });

    if (response.data.files.length === 0) {
      console.error(
        `❌ No spreadsheet found matching "${currentFileName}" in folder.`,
      );
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
    "ST: DW->DDS": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        Query here ***
        `,

    "ST: DW->PHSSN": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        Query here ***
        `,

    "ST: DW->PHSSI": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        Query here ***
        `,

    "ST: DW->IBS": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        Query here ***
        `,

    "ST: DW->MBS": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        Query here ***
        `,

    "ST: DW->SBS": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        Query here ***
        `,

    "RT: DDS->DW": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        Query here ***
        `,

    "RT: PHSSN->DW": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        Query here ***
        `,

    "RT: PHSSI->DW": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        Query here ***
        `,

    "RT: IBS->DW": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        Query here ***
        `,

    "RT: MBS->DW": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        Query here ***
        `,

    "RT: SBS->DW": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        Query here ***
        `,

    "Sales Invoice - Govt.": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT 
            TRY_CONVERT(DATE, COALESCE(CASE WHEN CHARINDEX(' - ', Misc_SalesInvoice) > 0 
                THEN SUBSTRING(Misc_SalesInvoice, CHARINDEX(' - ', Misc_SalesInvoice) + 3, 
                LEN(Misc_SalesInvoice) - CHARINDEX(' - ', Misc_SalesInvoice) - 2) 
                ELSE NULL END, NULL))                           AS [Released Date],
            LEFT(Order_Type, 4)                                AS [Sales Category],
            Client_Name                                        AS [Entity],
            Client_terms                                       AS [PO Details],
            COALESCE(ReceiptNo_Note_Extra, '')                 AS [Invoice],
            CAST(Product_Total AS DECIMAL(18,2))               AS [Total Delivered],
            CAST(ISNULL(Waived_Amount, 0) AS DECIMAL(18,2))    AS [Total Waived],
            CAST(ISNULL(PO_Amount, 0) AS DECIMAL(18,2))        AS [Total PO]
        FROM TBL_Orders
        WHERE TRY_CONVERT(DATE, COALESCE(CASE WHEN CHARINDEX(' - ', Misc_SalesInvoice) > 0 
                THEN SUBSTRING(Misc_SalesInvoice, CHARINDEX(' - ', Misc_SalesInvoice) + 3, 
                LEN(Misc_SalesInvoice) - CHARINDEX(' - ', Misc_SalesInvoice) - 2) 
                ELSE NULL END, NULL)) BETWEEN @StartDate AND @EndDate
            AND COALESCE(ReceiptNo_Note_Extra, '') != ''
            AND Order_Type LIKE '%Govt%'
        ORDER BY [Released Date]`,

    "Sales Invoice": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT 
            CAST(Order_Date AS DATE)                           AS [Released Date],
            LEFT(Order_Type, 4)                                AS [Sales Category],
            Client_Name                                        AS [Entity],
            Client_terms                                       AS [PO Details],
            COALESCE(ReceiptNo_Note_Extra, '')                 AS [Invoice],
            CAST(Product_Total AS DECIMAL(18,2))               AS [Total Delivered]
        FROM TBL_Orders
        WHERE Order_Date BETWEEN @StartDate AND @EndDate
            AND COALESCE(ReceiptNo_Note_Extra, '') != ''
            AND Order_Type NOT LIKE '%Govt%'
        ORDER BY [Released Date]`,

    "Inv. Discrepancy": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT
            CAST(ISNULL(CONVERT(VARCHAR(10), PC.P_Date, 120), '') AS NVARCHAR(50))  AS [Date],
            CAST(ISNULL(PC.P_Details, '')                         AS NVARCHAR(255)) AS [Inventory Group],
            CAST(ISNULL(CI.Item_Name, '')                         AS NVARCHAR(255)) AS [Product Name],
            CAST(FORMAT(ISNULL(CI.Item_Price, 0), 'N2')           AS NVARCHAR(50))  AS [Capital],
            CAST(ISNULL(CAST(PCD.P_Counts  AS VARCHAR(20)), '0')  AS NVARCHAR(50))  AS [Physical],
            CAST(ISNULL(CAST(PCD.Total_QTY AS VARCHAR(20)), '0')  AS NVARCHAR(50))  AS [System],
            CAST((PCD.P_Counts - PCD.Total_QTY)                   AS NVARCHAR(50))  AS [Variance],
            CAST(FORMAT(ISNULL((PCD.P_Counts - PCD.Total_QTY) * CI.Item_Price, 0), 'N2') AS NVARCHAR(50)) AS [Peso Value]
        FROM [${dbName}].dbo.TBL_Physical_Count PC
        INNER JOIN [${dbName}].dbo.TBL_Physical_Count_Details PCD ON PC.P_ID = PCD.P_ID
        LEFT  JOIN [${dbName}].dbo.TBL_Category_Item_File CI ON PCD.Item_ID = CI.Item_ID
        LEFT  JOIN [${dbName}].dbo.TBL_Category_File CF ON CI.Catg_ID = CF.Catg_ID
        WHERE PC.P_Date BETWEEN @StartDate AND @EndDate
          AND (PCD.P_Counts - PCD.Total_QTY) < 0
        ORDER BY [Date] ASC;

        SELECT
            CAST(ISNULL(CONVERT(VARCHAR(10), PC.P_Date, 120), '') AS NVARCHAR(50))  AS [Date],
            CAST(ISNULL(PC.P_Details, '')                         AS NVARCHAR(255)) AS [Inventory Group],
            CAST(ISNULL(CI.Item_Name, '')                         AS NVARCHAR(255)) AS [Product Name],
            CAST(FORMAT(ISNULL(CI.Item_Price, 0), 'N2')           AS NVARCHAR(50))  AS [Capital],
            CAST(ISNULL(CAST(PCD.P_Counts  AS VARCHAR(20)), '0')  AS NVARCHAR(50))  AS [Physical],
            CAST(ISNULL(CAST(PCD.Total_QTY AS VARCHAR(20)), '0')  AS NVARCHAR(50))  AS [System],
            CAST((PCD.P_Counts - PCD.Total_QTY)                   AS NVARCHAR(50))  AS [Variance],
            CAST(FORMAT(ISNULL((PCD.P_Counts - PCD.Total_QTY) * CI.Item_Price, 0), 'N2') AS NVARCHAR(50)) AS [Peso Value]
        FROM [${dbName}].dbo.TBL_Physical_Count PC
        INNER JOIN [${dbName}].dbo.TBL_Physical_Count_Details PCD ON PC.P_ID = PCD.P_ID
        LEFT  JOIN [${dbName}].dbo.TBL_Category_Item_File CI ON PCD.Item_ID = CI.Item_ID
        LEFT  JOIN [${dbName}].dbo.TBL_Category_File CF ON CI.Catg_ID = CF.Catg_ID
        WHERE PC.P_Date BETWEEN @StartDate AND @EndDate
          AND (PCD.P_Counts - PCD.Total_QTY) > 0
        ORDER BY [Date] ASC`,

    Remittance: `
        DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
        DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
        SELECT Remittance_Date, LEFT(Order_Type, 4) AS Order_Type, Total_Net, Total_Remittance,
               Deposit_Deposited, Cash_ShortOver, Deposit_ShortOver, Total_Expense, Expense_Replenished
        FROM TBL_Remittance
        WHERE Remittance_Date BETWEEN @SalesDate_From AND @SalesDate_To
        ORDER BY Remittance_Date;

        SELECT Deposit_Date, Deposit_No, Bank_Name, Amount, Deposit_Type, Deposit_Status
        FROM TBL_Remittance_Deposit
        WHERE Deposit_Date BETWEEN @SalesDate_From AND @SalesDate_To
        ORDER BY Deposit_Date`,

    "Remittance Deposit": `
        SELECT 
            CONVERT(VARCHAR(16), [deposit_date], 120) AS [Deposit Date],
            [deposit_no]     AS [Deposit No],
            [bank_details]   AS [Bank],
            FORMAT(ISNULL([amount], 0), 'N2') AS [Amount],
            [deposit_type]   AS [Deposit Type],
            [deposit_status] AS [Deposit Status]
        FROM dbo.remittance_deposits
        WHERE [deposit_date] BETWEEN '${DATE.sql.start}' AND '${DATE.sql.end}'
        ORDER BY [deposit_date] ASC`,

    Opex: `
        DECLARE @Date_From DATE = '${DATE.sql.start}';
        DECLARE @Date_To   DATE = '${DATE.sql.end}';
        SELECT 
            CAST(Date_Payment_Check AS DATE)                   AS [Date of Payment],
            ISNULL(OPEX_Particular, '-')                       AS [OPEX Particular],
            ISNULL(Payee, 'N/A')                               AS [Payee],
            ISNULL(OPEX_Category, '-')                         AS [Category],
            ISNULL(Invoice_Number, '')                         AS [Non-Official Inovice],
            ISNULL(Invoice_Number_Extra, '')                   AS [Sales Invoice],
            ISNULL(Invoice_Number_Plus, '')                    AS [Sales Invoice (VAT Ex.)],
            ISNULL(Payment_Info, '')                           AS [Check No.],
            CAST(ISNULL(Payment_Amount, 0) AS DECIMAL(18,2))   AS [Total Expense],
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

    "Cost of Goods 1": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        Query here ***
        `,

    "Cost of Goods 2": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        Query here ***
        `,

    "OPEX Monthly": `
        SELECT 
            OPEX_Category,
            SUM(CASE WHEN MONTH(Date_Payment_Check) = 1  THEN Payment_Amount ELSE 0 END) AS [January],
            SUM(CASE WHEN MONTH(Date_Payment_Check) = 2  THEN Payment_Amount ELSE 0 END) AS [February],
            SUM(CASE WHEN MONTH(Date_Payment_Check) = 3  THEN Payment_Amount ELSE 0 END) AS [March],
            SUM(CASE WHEN MONTH(Date_Payment_Check) = 4  THEN Payment_Amount ELSE 0 END) AS [April],
            SUM(CASE WHEN MONTH(Date_Payment_Check) = 5  THEN Payment_Amount ELSE 0 END) AS [May],
            SUM(CASE WHEN MONTH(Date_Payment_Check) = 6  THEN Payment_Amount ELSE 0 END) AS [June],
            SUM(CASE WHEN MONTH(Date_Payment_Check) = 7  THEN Payment_Amount ELSE 0 END) AS [July],
            SUM(CASE WHEN MONTH(Date_Payment_Check) = 8  THEN Payment_Amount ELSE 0 END) AS [August],
            SUM(CASE WHEN MONTH(Date_Payment_Check) = 9  THEN Payment_Amount ELSE 0 END) AS [September],
            SUM(CASE WHEN MONTH(Date_Payment_Check) = 10 THEN Payment_Amount ELSE 0 END) AS [October],
            SUM(CASE WHEN MONTH(Date_Payment_Check) = 11 THEN Payment_Amount ELSE 0 END) AS [November],
            SUM(CASE WHEN MONTH(Date_Payment_Check) = 12 THEN Payment_Amount ELSE 0 END) AS [December]
        FROM TBL_Operational_Expense
        WHERE YEAR(Date_Payment_Check) = ${DATE.sql.year}
          AND OPEX_Category NOT IN ('Cost Of Goods 1', 'Cost Of Goods 2')
        GROUP BY OPEX_Category`,

    "Supplier Received": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        Query here ***
        `,

    AP: `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        Query here ***
        `,

    "AP - Debit (COGS1)": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        select 
Date_Debit,
REPLACE(COALESCE(Date_Check, ''), '1900-01-01', '') as Date_Check,
Date_Payment,
Purchased_Date,
Received_Date,
SuppName,
InvoiceDetails,
InvoiceDetails_Extra,
InvoiceDetails_Plus,
Payment_Amount,
case when InvoiceDetails != '' then Purchase_Total else 0 end as NonOfficial,
case when InvoiceDetails_Extra != '' then Purchase_Total else 0 end as SalesInvoice,
case when InvoiceDetails_Plus != '' then Purchase_Total else 0 end as SalesInvoiceVAT
from TBL_Purchase_Order_Payment
inner join TBL_Purchase_Order on TBL_Purchase_Order.Purchase_ID = TBL_Purchase_Order_Payment.Purchase_ID
inner join TBL_Suppliers on TBL_Suppliers.Supp_ID = TBL_Purchase_Order.Supp_ID
where Date_Debit between @StartDate and @EndDate
and SuppName not like '%BCVR%'
and Payment_Mode = 'Cash'
order by Date_Debit
        `,

    "AP - Debit (COGS2)": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        select 
Date_Debit,
REPLACE(COALESCE(Date_Check, ''), '1900-01-01', '') as Date_Check,
Date_Payment,
Purchased_Date,
Received_Date,
SuppName,
InvoiceDetails,
InvoiceDetails_Extra,
InvoiceDetails_Plus,
Payment_Amount,
case when InvoiceDetails != '' then Purchase_Total else 0 end as NonOfficial,
case when InvoiceDetails_Extra != '' then Purchase_Total else 0 end as SalesInvoice,
case when InvoiceDetails_Plus != '' then Purchase_Total else 0 end as SalesInvoiceVAT
from TBL_Purchase_Order_Payment
inner join TBL_Purchase_Order on TBL_Purchase_Order.Purchase_ID = TBL_Purchase_Order_Payment.Purchase_ID
inner join TBL_Suppliers on TBL_Suppliers.Supp_ID = TBL_Purchase_Order.Supp_ID
where Date_Debit between @StartDate and @EndDate
and SuppName not like '%BCVR%'
and Payment_Mode = 'Cash'
order by Date_Debit
        `,

    "AP - Overdue": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        SELECT
    TBL_Purchase_Order.Purchase_ID AS Purchase_ID,
Purchased_Date,
Received_Date,
Due_Date,
TBL_Suppliers.SuppName,
Delivery_Term,
TBL_Suppliers.Supp_TIN,
COALESCE(PurchaseOrder_No, '') as PO_No,
InvoiceDetails,
InvoiceDetails_Extra,
InvoiceDetails_Plus,
FORMAT(Purchase_Total, 'N2') AS Purchase_Total,
FORMAT(COALESCE(Tax_Amount, '0'), 'N2') AS Tax_Amount,
FORMAT(Purchase_Total - COALESCE(Tax_Amount, '0')
 - COALESCE((select sum(Payment_Amount) 
        from TBL_Purchase_Order_Payment 
           where TBL_Purchase_Order_Payment.Purchase_ID 
            =  TBL_Purchase_Order.Purchase_ID 
            ), 0)
   , 'N2') as Balance,
COALESCE(Payable_Status, 'Unpaid') AS Payable_Status,
Remarks
FROM TBL_Purchase_Order
INNER JOIN TBL_Suppliers
    ON TBL_Suppliers.Supp_ID = TBL_Purchase_Order.Supp_ID
WHERE SuppName NOT LIKE '%BCVR%'
  AND YEAR(Received_Date) >= 2023
  AND Due_Date < '01/01/2026'
  AND Delivery_Term not like '%Consignment%'
  AND COALESCE(Payable_Status, 'Unpaid') = 'Unpaid'
ORDER BY
    Due_Date,
    SuppName;
        `,

    "AP - Audit": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        SELECT
    TBL_Purchase_Order.Purchase_ID AS Purchase_ID,
Purchased_Date,
Received_Date,
Due_Date,
TBL_Suppliers.SuppName,
Delivery_Term,
TBL_Suppliers.Supp_TIN,
COALESCE(PurchaseOrder_No, '') as PO_No,
InvoiceDetails,
InvoiceDetails_Extra,
InvoiceDetails_Plus,
FORMAT(Purchase_Total, 'N2') AS Purchase_Total,
FORMAT(COALESCE(Tax_Amount, '0'), 'N2') AS Tax_Amount,
FORMAT(Purchase_Total - COALESCE(Tax_Amount, '0')
 - COALESCE((select sum(Payment_Amount) 
        from TBL_Purchase_Order_Payment 
           where TBL_Purchase_Order_Payment.Purchase_ID 
            =  TBL_Purchase_Order.Purchase_ID 
            ), 0)
   , 'N2') as Balance,
COALESCE(Payable_Status, 'Unpaid') AS Payable_Status,
Remarks
FROM TBL_Purchase_Order
INNER JOIN TBL_Suppliers
    ON TBL_Suppliers.Supp_ID = TBL_Purchase_Order.Supp_ID
WHERE SuppName NOT LIKE '%BCVR%'
  AND YEAR(Received_Date) >= 2024
  AND Due_Date < '01/01/2026'
  AND Delivery_Term not like '%Consignment%'
  AND COALESCE(Payable_Status, 'Unpaid') = 'Paid'
  AND ABS(Purchase_Total - COALESCE(Tax_Amount, '0')
 - COALESCE((select sum(Payment_Amount) 
        from TBL_Purchase_Order_Payment 
           where TBL_Purchase_Order_Payment.Purchase_ID 
            =  TBL_Purchase_Order.Purchase_ID 
            ), 0)) > 10
ORDER BY
    Due_Date,
    SuppName;
        `,

    "Check Transmittal": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        //Query here ***
        `,

   "Disbursement": `
        DECLARE @Date_From DateTime = '${DATE.sql.datetimeStart}';
        DECLARE @Date_To   DateTime = '${DATE.sql.datetimeEnd}';
        select
MAX(TBL_Disbursement.Disbursement_ID) as Disbursement_ID,
MAX(TBL_Disbursement.GV_No) as GV_No,
MAX(TBL_Disbursement.Check_No) as Check_No,
MAX(TBL_Disbursement.Check_Amount) as Check_Amount,
MAX(Date_Processed) as Date_Processed,
MAX(Particulars) as Particulars,
TBL_Disbursement_CashRequest.Voucher_no,
MAX(Request_Amount) as Request_Amount,
sum(COALESCE(Payment_Amount, 0)) as Payment_Amount,
MAX(Request_Amount) - sum(COALESCE(Payment_Amount, 0)) as Variance,
MAX(Requested_By) as Requested_By
from TBL_Disbursement_CashRequest
inner join TBL_Disbursement on TBL_Disbursement.Disbursement_ID = TBL_Disbursement_CashRequest.Disbursement_ID
LEFT join TBL_Operational_Expense on TBL_Operational_Expense.Voucher_no = TBL_Disbursement_CashRequest.Voucher_No
where Date_Processed between @Date_From and @Date_To

group by TBL_Disbursement_CashRequest.Voucher_no
order by MAX(Date_Processed) asc`,

    "Disbursement Deposit": `
        SELECT 
            CAST(FORMAT(deposit_date, 'yyyy-MM-dd HH:mm:ss') AS VARCHAR(50)) AS [Deposit Date],
            deposit_no     AS [Deposit No],
            bank_name      AS [Bank],
            amount         AS [Amount],
            deposit_status AS [Deposit Status]
        FROM [${dbName}].dbo.disbursement_deposits
        WHERE deposit_date >= '${DATE.sql.start}'
          AND deposit_date <  '${DATE.sql.end}'
        ORDER BY deposit_date ASC`,

    "New Supplier": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        select min(p.Received_Date), SuppName, max(REPLACE(SuppAdd, '$..$ ', ', ')), max(SuppType)
from TBL_Purchase_Order p
inner join TBL_Suppliers s on s.Supp_ID = p.Supp_ID
where s.SuppName not like '%BCVR%'
group by s.SuppName
having min(p.Received_Date) between @Date_From and @Date_To
        `,

    "Procurement Audit": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        Query here ***
        `,

    "Supplier PO Audit": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        
        Query here ***
        `,

    "OPEX: SOP/Cashout": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT 
            ISNULL(category,   '')                               AS [Category],
            ISNULL(order_no,   '')                               AS [Order No],
            ISNULL(CONVERT(VARCHAR(10), record_date, 120), '')   AS [Date],
            ISNULL(payee,      '')                               AS [Payee],
            ISNULL(voucher_no, '')                               AS [Voucher No],
            ISNULL(payment_type, '')                             AS [Payment Type],
            ISNULL(check_no,   '')                               AS [Check No],
            ISNULL(cashout,    0)                                AS [CashOut],
            ISNULL(commitment, 0)                                AS [Commitment],
            ISNULL(paper_use,  0)                                AS [Paper Use],
            ISNULL(rebates,    0)                                AS [Rebates]
        FROM [${dbName}].dbo.opex_sop_records
        WHERE record_date BETWEEN @StartDate AND @EndDate
        ORDER BY record_date ASC, voucher_no ASC`,

    "AR: SOP/Cashout": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
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
        ORDER BY trans_date ASC`,

    "Commitment": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT 
            ROW_NUMBER() OVER(ORDER BY O.Order_Date ASC)    AS [ID],
            CAST(O.Order_Type AS NVARCHAR(50))              AS [Type],
            CAST(O.Order_No AS NVARCHAR(50))                AS [Order No],
            CONVERT(VARCHAR(10), O.Order_Date, 120)         AS [Date],
            CAST(O.Client_Name AS NVARCHAR(255))            AS [Recipient],
            CAST('' AS NVARCHAR(50))                        AS [CV No.],
            CAST('' AS NVARCHAR(50))                        AS [Release Mode],
            FORMAT(ISNULL(SUM(OD.TOTAL_COST), 0), 'N2')    AS [Cashout],
            CAST('0.00' AS NVARCHAR(50))                    AS [SOP],
            CAST('0.00' AS NVARCHAR(50))                    AS [Paper use]
        FROM dbo.TBL_Orders O
        INNER JOIN dbo.TBL_Orders_Detail OD ON O.Order_No = OD.Order_No
        WHERE O.Order_Date BETWEEN @StartDate AND @EndDate
        GROUP BY O.Order_No, O.Order_Date, O.Order_Type, O.Client_Name
        ORDER BY O.Order_Date ASC`,
  };
  return queries;
}

// --- FORMATTING HELPERS ---
const PESO_KEYS =
  /price|total|value|sold|amount|cost|capital|peso|cashout|sop|expense|check.amount|request.amount|released.amount|net|remittance|deposit(?!.no|.type|.status|.date)/i;
const DATE_KEYS = /date/i;

function formatCell(key, val) {
  if (val === null || val === undefined || val === "") return val;
  if (DATE_KEYS.test(key) && (val instanceof Date || !isNaN(Date.parse(val)))) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${mm}/${dd}/${yyyy}`;
    }
  }
  if (PESO_KEYS.test(key)) {
    const num = parseFloat(String(val).replace(/,/g, ""));
    if (!isNaN(num))
      return `₱${num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return val;
}

function formatRow(rowObj) {
  return Object.entries(rowObj).map(([key, val]) => formatCell(key, val));
}

// --- SAFE HEADER EXTRACTOR ---
// result.recordset.columns is populated by mssql even when rows = 0.
// Falls back to Object.keys(rows[0]) when rows exist, as a consistency check.
function getHeaders(result) {
  if (result.recordset.columns) {
    const keys = Object.keys(result.recordset.columns);
    if (keys.length > 0) return keys;
  }
  if (result.recordset.length > 0) {
    return Object.keys(result.recordset[0]);
  }
  return [];
}

// Same but accepts a raw recordset array (multi-recordset sheets)
function getHeadersFromRecordset(recordset) {
  if (recordset.columns) {
    const keys = Object.keys(recordset.columns);
    if (keys.length > 0) return keys;
  }
  if (recordset.length > 0) {
    return Object.keys(recordset[0]);
  }
  return [];
}

// --- SYNC FUNCTION ---
async function syncQueryToSheet(pool, spreadsheetId, query, sheetName) {
  try {
    const result = await pool.request().query(query);
    const START_ROW = 5;

    // ── Inv. Discrepancy: side-by-side (Negative → A5, Positive → J5) ────────
    if (sheetName === "Inv. Discrepancy") {
      const sets = result.recordsets;

      await sheetsApi.spreadsheets.values.batchClear({
        spreadsheetId,
        requestBody: {
          ranges: [
            `'${sheetName}'!A${START_ROW}:H1000`,
            `'${sheetName}'!J${START_ROW}:Q1000`,
          ],
        },
      });

      const batchData = [];

      // Left side — Negative Variance (always write header)
      const negHeaders = getHeadersFromRecordset(sets[0]);
      const negRows = (sets[0] ?? []).map((r) => formatRow(r));
      if (negHeaders.length > 0) {
        batchData.push({
          range: `'${sheetName}'!A${START_ROW}`,
          values: [negHeaders, ...negRows],
        });
      }

      // Right side — Positive Variance (always write header)
      const posHeaders = getHeadersFromRecordset(sets[1]);
      const posRows = (sets[1] ?? []).map((r) => formatRow(r));
      if (posHeaders.length > 0) {
        batchData.push({
          range: `'${sheetName}'!J${START_ROW}`,
          values: [posHeaders, ...posRows],
        });
      }

      if (batchData.length > 0) {
        await sheetsApi.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: { data: batchData, valueInputOption: "USER_ENTERED" },
        });
      }
      console.log(
        `✅ [${sheetName}] Neg: ${negRows.length}, Pos: ${posRows.length} row(s) — headers always at Row ${START_ROW}.`,
      );
      return;
    }

    // ── Remittance: two stacked tables, each with its own header ─────────────
    if (sheetName === "Remittance") {
      const sets = result.recordsets;

      await sheetsApi.spreadsheets.values.clear({
        spreadsheetId,
        range: `'${sheetName}'!A${START_ROW}:Z1000`,
      });

      const batchData = [];
      let nextRow = START_ROW;

      // Table 1 — always write header
      const t1Headers = getHeadersFromRecordset(sets[0]);
      const t1Rows = (sets[0] ?? []).map((r) => formatRow(r));
      if (t1Headers.length > 0) {
        batchData.push({
          range: `'${sheetName}'!A${nextRow}`,
          values: [t1Headers, ...t1Rows],
        });
        nextRow += 1 + t1Rows.length + 2; // header + data + 2-row gap
      }

      // Table 2 — always write header
      const t2Headers = getHeadersFromRecordset(sets[1]);
      const t2Rows = (sets[1] ?? []).map((r) => formatRow(r));
      if (t2Headers.length > 0) {
        batchData.push({
          range: `'${sheetName}'!A${nextRow}`,
          values: [t2Headers, ...t2Rows],
        });
      }

      if (batchData.length > 0) {
        await sheetsApi.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: { data: batchData, valueInputOption: "USER_ENTERED" },
        });
      }
      console.log(
        `✅ [${sheetName}] T1: ${t1Rows.length}, T2: ${t2Rows.length} row(s) — headers always written.`,
      );
      return;
    }

    // ── All other sheets: header at A5, data from A6 ─────────────────────────
    const rows = result.recordset;

    await sheetsApi.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${sheetName}'!A${START_ROW}:Z1000`,
    });

    // Headers from mssql column metadata — reliable even with 0 rows
    const headers = getHeaders(result);

    if (rows && rows.length > 0) {
      // Has data: write header + data rows
      await sheetsApi.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sheetName}'!A${START_ROW}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [headers, ...rows.map((r) => formatRow(r))] },
      });
      console.log(
        `✅ [${sheetName}] Synced ${rows.length} row(s) + header at Row ${START_ROW}.`,
      );
    } else {
      // No data: write header row only
      if (headers.length > 0) {
        await sheetsApi.spreadsheets.values.update({
          spreadsheetId,
          range: `'${sheetName}'!A${START_ROW}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [headers] },
        });
      }
      console.warn(
        `⚠️  [${sheetName}] No records — header only written at Row ${START_ROW}.`,
      );
    }
  } catch (err) {
    console.error(`❌ [${sheetName}] Error:`, err.message);
  }
}

// --- MAIN EXPORT ---
exports.run = async (pool, folderId, branchCode, dbName) => {
  console.log(`\n📊 [ACN] Sync started at ${new Date().toLocaleString()}`);

  const queries = buildQueries(dbName);
  const currentSpreadsheetId = await getSpreadsheetIdForCurrentMonth(
    folderId,
    branchCode,
  );

  if (!currentSpreadsheetId) {
    console.log("[ACN] ⚠️  Sync aborted: could not find target spreadsheet.");
    return;
  }

  const tabNames = Object.keys(queries);
  console.log(`📋 [ACN] Processing ${tabNames.length} tab(s)...`);

  for (let i = 0; i < tabNames.length; i++) {
    const tabName = tabNames[i];
    console.log(
      `   ⏳ [ACN] [${i + 1}/${tabNames.length}] Syncing: "${tabName}"...`,
    );
    await syncQueryToSheet(
      pool,
      currentSpreadsheetId,
      queries[tabName],
      tabName,
    );
    await sleep(3000);
  }

  console.log("✨ [ACN] All tabs synced successfully.");
};
