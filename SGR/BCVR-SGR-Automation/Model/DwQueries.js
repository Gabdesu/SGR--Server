const { DATE } = require("../config");

// =============================================================================
// DW — Distribution Warehouse
// Query Model: ACN | PRD | SLS
// =============================================================================

// --- ACN QUERIES ---
function buildAcnQueries(dbName) {
  return {
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
  AND YEAR(Received_Date) >= 2024
  AND Due_Date <= @EndDate
  AND Delivery_Term not like '%Consignment%'
  AND COALESCE(Payable_Status, 'Unpaid') != 'Paid'
ORDER BY
    Due_Date,
    SuppName;
        `,

    "AP - Paid w/ Balance": `
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

    Disbursement: `
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

    Commitment: `
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
}

// --- PRD QUERIES ---
const prdQueries = {
  "Fast Moving (Meds)": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT TOP 100
            CASE WHEN MAX(TBL_Category_File.group_ID) = 1 AND LEN(MAX(I.Item_Name)) > 4
                 THEN LEFT(MAX(I.Item_Name), LEN(MAX(I.Item_Name)) - 4)
                 ELSE MAX(I.Item_Name) END AS Product,
            COUNT(O.order_no) AS "Freq.",
            SUM(CASE WHEN order_type LIKE '%Sales%' AND order_type NOT LIKE '%Transfer%' THEN QTY ELSE 0 END) AS Quantity,
            MAX(Item_Packaging) AS Packaging
        FROM TBL_Orders_Detail OD
        INNER JOIN tbl_orders O ON O.Order_No = OD.Order_No
        INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        INNER JOIN TBL_Category_File ON TBL_Category_File.Catg_ID = I.Catg_ID
        WHERE TBL_Category_File.group_ID = 1
          AND Order_Type LIKE '%Sales%'
          AND (CASE WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
                    THEN CONVERT(DATE, Order_Date)
                    ELSE CONVERT(DATE, Encode_DateTime) END) BETWEEN @StartDate AND @EndDate
        GROUP BY CASE WHEN LEN(I.Item_Name) > 4 THEN LEFT(I.Item_Name, LEN(I.Item_Name) - 4) ELSE I.Item_Name END
        ORDER BY COUNT(O.order_no) DESC`,

  "Fast Moving (Supplies)": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        SELECT TOP 100
            CASE WHEN MAX(TBL_Category_File.group_ID) = 1 AND LEN(MAX(I.Item_Name)) > 4
                 THEN LEFT(MAX(I.Item_Name), LEN(MAX(I.Item_Name)) - 4)
                 ELSE MAX(I.Item_Name) END AS Product,
            COUNT(O.order_no) AS "Freq.",
            SUM(CASE WHEN order_type LIKE '%Sales%' AND order_type NOT LIKE '%Transfer%' THEN QTY ELSE 0 END) AS Quantity,
            MAX(Item_Packaging) AS Packaging
        FROM TBL_Orders_Detail OD
        INNER JOIN tbl_orders O ON O.Order_No = OD.Order_No
        INNER JOIN TBL_Category_Item_File I ON I.Item_ID = OD.Item_ID
        INNER JOIN TBL_Category_File ON TBL_Category_File.Catg_ID = I.Catg_ID
        WHERE TBL_Category_File.group_ID = 2
          AND Order_Type LIKE '%Sales%'
          AND (CASE WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
                    THEN CONVERT(DATE, Order_Date)
                    ELSE CONVERT(DATE, Encode_DateTime) END) BETWEEN @StartDate AND @EndDate
        GROUP BY CASE WHEN LEN(I.Item_Name) > 4 THEN LEFT(I.Item_Name, LEN(I.Item_Name) - 4) ELSE I.Item_Name END
        ORDER BY COUNT(O.order_no) DESC`,

  Procurement: `
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

  "Procurement-Special": `
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

  "Slow Moving": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        select top 100 
Item_Name, 
sum(TBL_Stocks_Balances.Item_QTY) as Quantity, 
max(Item_Packaging) as Packaging
from TBL_Stocks_Balances
inner join TBL_Category_Item_File on TBL_Category_Item_File.Item_ID = TBL_Stocks_Balances.Item_ID
where Item_Name not in (
select Item_Name from TBL_Orders_Detail
inner join tbl_orders on tbl_orders.order_no = TBL_Orders_Detail.order_no
inner join TBL_Category_Item_File on TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
where  CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END
BETWEEN @StartDate
    AND @EndDate
and order_type like '%Sales%'
)
and TBL_Stocks_Balances.Item_QTY > 0
and Item_Name not like '%Loose%'
group by Item_Name
order by sum(TBL_Stocks_Balances.Item_QTY) desc`,

  "Out of Stocks": `
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

  "Discounted (Loyalty)": `
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

  "Discounted (Senior)": `
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

  Expired: `
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

  "Near Expiry": `
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

  "Top Peso Sold (Meds)": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        select top 100
CONCAT(Item_Name, ' ', Catg_Name) as Product,
SUM(QTY) as Quantity,
MAX(Item_Packaging) as Packaging,
sum(total_Cost) as Total
		from TBL_Orders_Detail
		inner join tbl_orders on TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
		inner join TBL_Category_Item_File on TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
		inner join TBL_Category_File on TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
where group_id = 1 and Order_Type like '%Sales%'
and Order_Type not like '%Transfer%'
and CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END
BETWEEN @StartDate
    AND @EndDate
group by CONCAT(Item_Name, ' ', Catg_Name)
order by sum(total_Cost) desc`,

  "Top Peso Sold (Supplies)": `
        DECLARE @StartDate DATE = '${DATE.sql.start}';
        DECLARE @EndDate   DATE = '${DATE.sql.end}';
        select top 100
CONCAT(Item_Name, ' ', Catg_Name) as Product,
SUM(QTY) as Quantity,
MAX(Item_Packaging) as Packaging,
sum(total_Cost) as Total
		from TBL_Orders_Detail
		inner join tbl_orders on TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
		inner join TBL_Category_Item_File on TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
		inner join TBL_Category_File on TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
where group_id = 2 and Order_Type like '%Sales%'
and Order_Type not like '%Transfer%'
and CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END
BETWEEN @StartDate
    AND @EndDate
group by CONCAT(Item_Name, ' ', Catg_Name)
order by sum(total_Cost) desc
`,

  "Lacking Served": `
    DECLARE @StartDate DATE = '${DATE.sql.start}';
    DECLARE @EndDate   DATE = '${DATE.sql.end}';
    SELECT 
    
    max(LEFT(Order_type, 4)) as Order_type,
    Max(TBL_Orders_Detail.Order_No) as Order_No,
    MAX(Client_Name) as Entity, 
    MAX(Client_Terms) as PO_Details,
    MAX(TBL_Orders_Detail.OrderDetail_ItemNo) as Item_No,
    TBL_Orders_Detail.Product_Name,
    MAX(TBL_Orders_Lacking_Details.Item_Description) as Lacking_Description,
    MAX(TBL_Orders_Detail.Remarks) as Remarks,
    MAX(TBL_Orders_Detail.QTY) as Order_Quantity,
    sum(TBL_Orders_Lacking_Details.Quantity) as Lacking_Quantity,
    max(OL_Purchasing) as Purchasing_Assigned,
    max(OL_Encoder)
    
FROM TBL_Orders_Detail
INNER JOIN TBL_Orders ON TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
INNER JOIN TBL_Orders_Lacking ON TBL_Orders_Lacking.Order_No = TBL_Orders_Detail.Order_No
INNER JOIN TBL_Orders_Lacking_Details ON TBL_Orders_Lacking_Details.OL_ID = TBL_Orders_Lacking.OL_ID
WHERE CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END BETWEEN @StartDate AND @EndDate
    AND Order_Type LIKE '%GOVT%'
    and Item_No = OrderDetail_ItemNo
    group by Order_Dtl, TBL_Orders_Detail.Product_Name`,
};

// --- SLS QUERIES ---
const slsQueries = {
  "DFGS1-Booking": `
        DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
        DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
        DECLARE @SalesCategory VARCHAR(MAX);
        
        SET @SalesCategory = '%DFGS1%';

                SELECT
            TRY_CONVERT(DATE, COALESCE(CASE WHEN CHARINDEX(' - ', Misc_BookingDate) > 0 
                        THEN SUBSTRING(Misc_BookingDate,  CHARINDEX(' - ', Misc_BookingDate) + 3,  
                        LEN(Misc_BookingDate) - CHARINDEX(' - ', Misc_BookingDate) - 2)  ELSE NULL END, NULL)) as Booking_Date, 
                LEFT(Order_type, 4) as 'Sales Category',
                Client_Name,
                Requestor_EndUser,
                Client_Terms,
                FORMAT(PO_Amount, 'N2') as PO_Amount,
                FORMAT(Product_Total, 'N2') as total_delivered
                FROM TBL_Orders
            WHERE TRY_CONVERT(DATE, COALESCE(CASE WHEN CHARINDEX(' - ', Misc_BookingDate) > 0 
                        THEN SUBSTRING(Misc_BookingDate,  CHARINDEX(' - ', Misc_BookingDate) + 3,  
                        LEN(Misc_BookingDate) - CHARINDEX(' - ', Misc_BookingDate) - 2)  ELSE NULL END, NULL)) between @SalesDate_From and @SalesDate_To
                        and Order_type like @SalesCategory
            order by Booking_Date

            update TBL_Orders
            set Misc_BookingDate = CONCAT('OK - ', FORMAT(Order_Date, 'yyyy-MM-dd'))
            where Client_Name = 'LGU Bulan - Botica ng Bayan'`,

  "DFGS2-Booking": `
        DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
        DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
        DECLARE @SalesCategory VARCHAR(MAX);
        
        SET @SalesCategory = '%DFGS2%';

                SELECT
            TRY_CONVERT(DATE, COALESCE(CASE WHEN CHARINDEX(' - ', Misc_BookingDate) > 0 
                        THEN SUBSTRING(Misc_BookingDate,  CHARINDEX(' - ', Misc_BookingDate) + 3,  
                        LEN(Misc_BookingDate) - CHARINDEX(' - ', Misc_BookingDate) - 2)  ELSE NULL END, NULL)) as Booking_Date, 
                LEFT(Order_type, 4) as 'Sales Category',
                Client_Name,
                Requestor_EndUser,
                Client_Terms,
                FORMAT(PO_Amount, 'N2') as PO_Amount,
                FORMAT(Product_Total, 'N2') as total_delivered
                FROM TBL_Orders
            WHERE TRY_CONVERT(DATE, COALESCE(CASE WHEN CHARINDEX(' - ', Misc_BookingDate) > 0 
                        THEN SUBSTRING(Misc_BookingDate,  CHARINDEX(' - ', Misc_BookingDate) + 3,  
                        LEN(Misc_BookingDate) - CHARINDEX(' - ', Misc_BookingDate) - 2)  ELSE NULL END, NULL)) between @SalesDate_From and @SalesDate_To
                        and Order_type like @SalesCategory
            order by Booking_Date

            update TBL_Orders
            set Misc_BookingDate = CONCAT('OK - ', FORMAT(Order_Date, 'yyyy-MM-dd'))
            where Client_Name = 'LGU Bulan - Botica ng Bayan'`,

  "GPFS-Booking": `
        DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
        DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
        DECLARE @SalesCategory VARCHAR(MAX);
        
        SET @SalesCategory = '%GPFS%';

                SELECT
            TRY_CONVERT(DATE, COALESCE(CASE WHEN CHARINDEX(' - ', Misc_BookingDate) > 0 
                        THEN SUBSTRING(Misc_BookingDate,  CHARINDEX(' - ', Misc_BookingDate) + 3,  
                        LEN(Misc_BookingDate) - CHARINDEX(' - ', Misc_BookingDate) - 2)  ELSE NULL END, NULL)) as Booking_Date, 
                LEFT(Order_type, 4) as 'Sales Category',
                Client_Name,
                Requestor_EndUser,
                Client_Terms,
                FORMAT(PO_Amount, 'N2') as PO_Amount,
                FORMAT(Product_Total, 'N2') as total_delivered
                FROM TBL_Orders
            WHERE TRY_CONVERT(DATE, COALESCE(CASE WHEN CHARINDEX(' - ', Misc_BookingDate) > 0 
                        THEN SUBSTRING(Misc_BookingDate,  CHARINDEX(' - ', Misc_BookingDate) + 3,  
                        LEN(Misc_BookingDate) - CHARINDEX(' - ', Misc_BookingDate) - 2)  ELSE NULL END, NULL)) between @SalesDate_From and @SalesDate_To
                        and Order_type like @SalesCategory
            order by Booking_Date

            update TBL_Orders
            set Misc_BookingDate = CONCAT('OK - ', FORMAT(Order_Date, 'yyyy-MM-dd'))
            where Client_Name = 'LGU Bulan - Botica ng Bayan'`,

  "DFS1-Delivered": `
        DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
        DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
        DECLARE @SalesCategory VARCHAR(MAX);
        
        SET @SalesCategory = '%DFS1%';

            SELECT
    CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END AS Booking_Date,
    Client_Name AS 'Entity',
    MAX(Client_Terms) AS 'Order_Details',
    COALESCE(MAX(ReceiptNo_Note), '') AS 'Invoice1',
    COALESCE(MAX(ReceiptNo_Note_Extra), '') AS 'Invoice2',
    COALESCE(MAX(ReceiptNo_Note_Plus), '') AS 'Invoice3',
    COALESCE(MAX(ReceiptNo_Note_Add), '') AS 'Invoice4',
    SUM(CASE WHEN Group_ID = 1 then total_cost else 0 END) as DM,
    SUM(CASE WHEN Group_ID = 2 then total_cost else 0 END) as MSDE,
    SUM(CASE WHEN Group_ID = 3 then total_cost else 0 END) as GM,
    SUM(CASE WHEN Group_ID = 4 then total_cost else 0 END) as LSAE,
    SUM(CASE WHEN Group_ID = 5 then total_cost else 0 END) as OSEF,
    SUM(CASE WHEN Group_ID = 6 then total_cost else 0 END) as ASME,
    SUM(CASE WHEN Group_ID = 7 then total_cost else 0 END) as REEV,
    sum(total_cost) as Total_Delivered
FROM TBL_Orders_Detail
INNER JOIN TBL_Orders on TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
INNER JOIN TBL_Category_Item_File on TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
INNER JOIN TBL_Category_File on TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
WHERE Order_Type LIKE @SalesCategory
     AND CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END
BETWEEN @SalesDate_From
    AND @SalesDate_To

  AND Order_Status = 'Approved'
  AND Client_Terms NOT LIKE 'Merge%'
  

  GROUP BY TBL_Orders_Detail.Order_No, CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END, Client_Name

    Order by Booking_Date, Client_Name`,

  "DFS2-Delivered": `
        DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
        DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
        DECLARE @SalesCategory VARCHAR(MAX);
        
        SET @SalesCategory = '%DFGS2%';

            SELECT
    CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END AS Booking_Date,
    Client_Name AS 'Entity',
    MAX(Client_Terms) AS 'Order_Details',
    COALESCE(MAX(ReceiptNo_Note), '') AS 'Invoice1',
    COALESCE(MAX(ReceiptNo_Note_Extra), '') AS 'Invoice2',
    COALESCE(MAX(ReceiptNo_Note_Plus), '') AS 'Invoice3',
    COALESCE(MAX(ReceiptNo_Note_Add), '') AS 'Invoice4',
    SUM(CASE WHEN Group_ID = 1 then total_cost else 0 END) as DM,
    SUM(CASE WHEN Group_ID = 2 then total_cost else 0 END) as MSDE,
    SUM(CASE WHEN Group_ID = 3 then total_cost else 0 END) as GM,
    SUM(CASE WHEN Group_ID = 4 then total_cost else 0 END) as LSAE,
    SUM(CASE WHEN Group_ID = 5 then total_cost else 0 END) as OSEF,
    SUM(CASE WHEN Group_ID = 6 then total_cost else 0 END) as ASME,
    SUM(CASE WHEN Group_ID = 7 then total_cost else 0 END) as REEV,
    sum(total_cost) as Total_Delivered
FROM TBL_Orders_Detail
INNER JOIN TBL_Orders on TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
INNER JOIN TBL_Category_Item_File on TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
INNER JOIN TBL_Category_File on TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
WHERE Order_Type LIKE @SalesCategory
     AND CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END
BETWEEN @SalesDate_From
    AND @SalesDate_To

  AND Order_Status = 'Approved'
  AND Client_Terms NOT LIKE 'Merge%'
  

  GROUP BY TBL_Orders_Detail.Order_No, CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END, Client_Name

    Order by Booking_Date, Client_Name`,

  "DFGS1-Delivered": `
        DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
        DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
        DECLARE @SalesCategory VARCHAR(MAX);
        
        SET @SalesCategory = '%DFGS1%';

            SELECT
    CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END AS Booking_Date,
    Client_Name AS 'Entity',
    MAX(Client_Terms) AS 'Order_Details',
    COALESCE(MAX(ReceiptNo_Note), '') AS 'Invoice1',
    COALESCE(MAX(ReceiptNo_Note_Extra), '') AS 'Invoice2',
    COALESCE(MAX(ReceiptNo_Note_Plus), '') AS 'Invoice3',
    COALESCE(MAX(ReceiptNo_Note_Add), '') AS 'Invoice4',
    SUM(CASE WHEN Group_ID = 1 then total_cost else 0 END) as DM,
    SUM(CASE WHEN Group_ID = 2 then total_cost else 0 END) as MSDE,
    SUM(CASE WHEN Group_ID = 3 then total_cost else 0 END) as GM,
    SUM(CASE WHEN Group_ID = 4 then total_cost else 0 END) as LSAE,
    SUM(CASE WHEN Group_ID = 5 then total_cost else 0 END) as OSEF,
    SUM(CASE WHEN Group_ID = 6 then total_cost else 0 END) as ASME,
    SUM(CASE WHEN Group_ID = 7 then total_cost else 0 END) as REEV,
    sum(total_cost) as Total_Delivered
FROM TBL_Orders_Detail
INNER JOIN TBL_Orders on TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
INNER JOIN TBL_Category_Item_File on TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
INNER JOIN TBL_Category_File on TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
WHERE Order_Type LIKE @SalesCategory
     AND CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END
BETWEEN @SalesDate_From
    AND @SalesDate_To

  AND Order_Status = 'Approved'
  AND Client_Terms NOT LIKE 'Merge%'
  

  GROUP BY TBL_Orders_Detail.Order_No, CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END, Client_Name

    Order by Booking_Date, Client_Name`,

  "DFGS2-Delivered": `
        DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
        DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
        DECLARE @SalesCategory VARCHAR(MAX);
        
        SET @SalesCategory = '%DFGS2%';

            SELECT
    CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END AS Booking_Date,
    Client_Name AS 'Entity',
    MAX(Client_Terms) AS 'Order_Details',
    COALESCE(MAX(ReceiptNo_Note), '') AS 'Invoice1',
    COALESCE(MAX(ReceiptNo_Note_Extra), '') AS 'Invoice2',
    COALESCE(MAX(ReceiptNo_Note_Plus), '') AS 'Invoice3',
    COALESCE(MAX(ReceiptNo_Note_Add), '') AS 'Invoice4',
    SUM(CASE WHEN Group_ID = 1 then total_cost else 0 END) as DM,
    SUM(CASE WHEN Group_ID = 2 then total_cost else 0 END) as MSDE,
    SUM(CASE WHEN Group_ID = 3 then total_cost else 0 END) as GM,
    SUM(CASE WHEN Group_ID = 4 then total_cost else 0 END) as LSAE,
    SUM(CASE WHEN Group_ID = 5 then total_cost else 0 END) as OSEF,
    SUM(CASE WHEN Group_ID = 6 then total_cost else 0 END) as ASME,
    SUM(CASE WHEN Group_ID = 7 then total_cost else 0 END) as REEV,
    sum(total_cost) as Total_Delivered
FROM TBL_Orders_Detail
INNER JOIN TBL_Orders on TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
INNER JOIN TBL_Category_Item_File on TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
INNER JOIN TBL_Category_File on TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
WHERE Order_Type LIKE @SalesCategory
     AND CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END
BETWEEN @SalesDate_From
    AND @SalesDate_To

  AND Order_Status = 'Approved'
  AND Client_Terms NOT LIKE 'Merge%'
  

  GROUP BY TBL_Orders_Detail.Order_No, CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END, Client_Name

    Order by Booking_Date, Client_Name`,

  "GPFS-Delivered": `
        DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
        DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
        DECLARE @SalesCategory VARCHAR(MAX);
        
        SET @SalesCategory = '%GPFS%';

            SELECT
    CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END AS Booking_Date,
    Client_Name AS 'Entity',
    MAX(Client_Terms) AS 'Order_Details',
    COALESCE(MAX(ReceiptNo_Note), '') AS 'Invoice1',
    COALESCE(MAX(ReceiptNo_Note_Extra), '') AS 'Invoice2',
    COALESCE(MAX(ReceiptNo_Note_Plus), '') AS 'Invoice3',
    COALESCE(MAX(ReceiptNo_Note_Add), '') AS 'Invoice4',
    SUM(CASE WHEN Group_ID = 1 then total_cost else 0 END) as DM,
    SUM(CASE WHEN Group_ID = 2 then total_cost else 0 END) as MSDE,
    SUM(CASE WHEN Group_ID = 3 then total_cost else 0 END) as GM,
    SUM(CASE WHEN Group_ID = 4 then total_cost else 0 END) as LSAE,
    SUM(CASE WHEN Group_ID = 5 then total_cost else 0 END) as OSEF,
    SUM(CASE WHEN Group_ID = 6 then total_cost else 0 END) as ASME,
    SUM(CASE WHEN Group_ID = 7 then total_cost else 0 END) as REEV,
    sum(total_cost) as Total_Delivered
FROM TBL_Orders_Detail
INNER JOIN TBL_Orders on TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
INNER JOIN TBL_Category_Item_File on TBL_Category_Item_File.Item_ID = TBL_Orders_Detail.Item_ID
INNER JOIN TBL_Category_File on TBL_Category_File.Catg_ID = TBL_Category_Item_File.Catg_ID
WHERE Order_Type LIKE @SalesCategory
     AND CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END
BETWEEN @SalesDate_From
    AND @SalesDate_To

  AND Order_Status = 'Approved'
  AND Client_Terms NOT LIKE 'Merge%'
  

  GROUP BY TBL_Orders_Detail.Order_No, CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END, Client_Name

    Order by Booking_Date, Client_Name`,

  "Top 30": `
    DECLARE @SalesCategory VARCHAR(MAX);
    DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
    DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
    SET @SalesCategory = '%Sales%';

SELECT TOP 30 LEFT(MAX(Order_Type),4) as OT, Client_Name, sum(COALESCE(PO_Amount,0)) AS Total
FROM TBL_Orders
WHERE Order_Date BETWEEN @SalesDate_From AND @SalesDate_To
  AND Order_Type LIKE @SalesCategory
  AND Order_Type LIKE '%Govt%'
GROUP BY Client_Name
ORDER BY Total desc

SELECT TOP 30 LEFT(MAX(Order_Type),4) as OT, Client_Name, sum(COALESCE(TOTAL_COST,0)) AS Total
FROM TBL_Orders_Detail
INNER JOIN TBL_Orders on TBL_Orders.Order_No = TBL_Orders_Detail.Order_No
WHERE CASE
        WHEN Encode_DateTime IS NULL OR Encode_DateTime = ''
            THEN CONVERT(DATE, Order_Date)
        ELSE CONVERT(DATE, Encode_DateTime)
    END
BETWEEN @SalesDate_From
    AND @SalesDate_To
  AND Order_Type LIKE @SalesCategory
  AND Order_Type NOT LIKE '%Transfer%'
GROUP BY Client_Name
ORDER BY Total desc

SELECT TOP 30 LEFT(MAX(Order_Type),4) as OT, Client_Name,
           SUM(COALESCE(TBL_Orders_Payment.Payment_Amount, 0) + 
               COALESCE(Tax_Amount, 0) + 
               COALESCE(OtherCharges_Amount, 0) + 
               COALESCE(LiqDamages_Amount, 0) + 
               COALESCE(Retention_Amount, 0)) AS Total
    FROM TBL_Orders_Payment
    INNER JOIN TBL_Orders ON TBL_Orders.Order_No = TBL_Orders_Payment.Order_No
    WHERE Payment_Date BETWEEN @SalesDate_From AND @SalesDate_To
      AND Order_Type LIKE @SalesCategory
      AND Order_Type NOT LIKE '%Transfer%'
    GROUP BY Client_Name
    ORDER BY Total desc
    `,

  "Top AR": `
    DECLARE @SalesCategory VARCHAR(MAX);
    DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
    DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
    SET @SalesCategory = '%Sales%';
    
    SELECT Top 30

	LEFT(MAX(Order_Type), 4),
    Client_Name,
	SUM(Product_Total) 
	- sum(coalesce(TBL_Orders_Payment.Payment_Amount, 0)) 
	- sum(coalesce(TBL_Orders_Payment.Tax_Amount, 0))
	- sum(coalesce(TBL_Orders_Payment.Retention_Amount, 0))
	- sum(coalesce(TBL_Orders_Payment.Discount_Amount, 0))
	- sum(coalesce(TBL_Orders_Payment.OtherCharges_Amount, 0))
	- sum(coalesce(TBL_Orders_Payment.LiqDamages_Amount, 0)) as Total

FROM tbl_orders
LEFT JOIN TBL_Orders_Payment ON TBL_Orders_Payment.Order_No = tbl_orders.Order_No
WHERE Order_Type LIKE @SalesCategory
and Order_Type NOT LIKE '%Transfer%'
AND Order_Date >= '2023-02-01' 
AND Order_Date <= @SalesDate_To
and Order_Payment_Status != 'Paid' 
GROUP BY Client_Name
ORDER BY Total desc`,

  "Top Inactive": `
    DECLARE @SalesCategory VARCHAR(MAX);
    DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
    DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
    DECLARE @Active_From DATE = '2023-01-01';
    DECLARE @Active_To   DATE = '2025-12-31';
     

    SET @SalesCategory = 'Sales';
        
    SELECT TOP 30
        LEFT(MAX(Order_Type), 4) AS OrderTypePrefix,
        Client_Name,
        SUM(Product_Total) AS Total
    FROM TBL_Orders
    WHERE 
            Order_Date BETWEEN @Active_From AND @Active_To
        AND Order_Type LIKE '%' + @SalesCategory + '%'
        AND Order_Type NOT LIKE '%Transfer%'
        AND Client_Name NOT IN (
    SELECT Client_Name 
        FROM TBL_Orders 
        WHERE 
            Order_Date BETWEEN @SalesDate_From AND @SalesDate_To 
            AND Order_Type LIKE '%' + @SalesCategory + '%'
            AND Order_Type NOT LIKE '%Transfer%'
        GROUP BY Client_Name
    )
    GROUP BY Client_Name
    ORDER BY Total DESC;`,

  "New Client Contacts": `
    DECLARE @Date_From DATE = '${DATE.sql.start}';
    DECLARE @Date_To   DATE = '${DATE.sql.end}';
   
    select 
LEFT(Client_Type, 4) as SalesCategory,
Company_Name,
Contact_Name,
Position,
Department,
Birthday,
Contact_No,
Email_Address,
Remarks
from TBL_Client_Details
inner join TBL_Clients on TBL_Clients.Client_ID = TBL_Client_Details.Client_ID
where TBL_Client_Details.Date_Added between @Date_From and @Date_To
order by Client_Type, Company_Name`,

  "Canvass Details": `
    DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
    DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
   
    select 
Canvass_No,
Canvass_recvDate,
Canvass_Name,
LEFT(Canvass_Type,4),
End_User,
Canvasser_Name,
Canvasser_Contact,
Canvasser_Designation,
Canvass_Approved,
COALESCE(Bid_Result, '') as Bid_Result,
ABC_Total,
Canvass_bidTotal as Bid,
Encoded_By
from TBL_Canvass
where Canvass_No in 
(select Canvass_No from TBL_Orders where order_type like '%Govt%')
and Canvass_recvDate between @SalesDate_From and @SalesDate_To`,

  "Ordering Kiosk Details": `
    DECLARE @SalesDate_From DATE = '${DATE.sql.start}';
    DECLARE @SalesDate_To   DATE = '${DATE.sql.end}';
   
    select
CASE WHEN Order_Type like '%Transfer%' or Order_Type like '%Return%' or Order_Type like '%Office%' Or Order_Type like '%Social%' then LEFT(Order_Type, 2) Else LEFT(Order_Type, 4) End as Order_Type,
Order_No, 
REPLACE(Case WHEN Order_Type like '%Govt%' then 
TRY_CONVERT(DATE, COALESCE(CASE WHEN CHARINDEX(' - ', Misc_BookingDate) > 0 
			THEN SUBSTRING(Misc_BookingDate,  CHARINDEX(' - ', Misc_BookingDate) + 3,  
			LEN(Misc_BookingDate) - CHARINDEX(' - ', Misc_BookingDate) - 2)  ELSE '' END, '')) else Order_Date End, '1900-01-01', '') as Booking_Date,
Order_Date,
Client_Name, 
Client_Address, 
Requestor_Enduser, 
Encoded_By,
Picker, 
Checker, 
Packer, 
Canvass_No, 
Client_Terms, 
case when Order_Type like '%Govt%' then PO_Amount else Product_Total end as Total
from TBL_Orders
where Order_Date between @SalesDate_From and @SalesDate_To
and Order_Type not like '%Retail%'
Order by Order_Type`,
};

module.exports = { buildAcnQueries, prdQueries, slsQueries };
